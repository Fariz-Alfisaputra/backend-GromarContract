import { Response } from 'express'
import { prisma } from '../lib/prisma'
import { AuthRequest } from '../types'
import { createSnapToken } from '../services/payment.service'

export const createOrder = async (req: AuthRequest, res: Response): Promise<void> => {
  const userId = req.user!.id
  const { notes } = req.body

  // Get cart items
  const cartItems = await prisma.cartItem.findMany({
    where: { userId },
    include: { product: true },
  })

  if (cartItems.length === 0) {
    res.status(400).json({ success: false, message: 'Keranjang belanja kosong' })
    return
  }

  // Validate stock for all items
  for (const item of cartItems) {
    if (item.product.stock < item.quantity) {
      res.status(400).json({
        success: false,
        message: `Stok ${item.product.name} tidak cukup. Tersedia: ${item.product.stock}`,
      })
      return
    }
  }

  const totalAmount = cartItems.reduce(
    (sum, item) => sum + item.product.price * item.quantity,
    0
  )

  // Create order in transaction
  const order = await prisma.$transaction(async (tx) => {
    // Create the order
    const newOrder = await tx.order.create({
      data: {
        userId,
        totalAmount,
        notes,
        orderItems: {
          create: cartItems.map((item) => ({
            productId: item.productId,
            quantity: item.quantity,
            price: item.product.price,
          })),
        },
      },
      include: {
        orderItems: { include: { product: true } },
        user: { select: { name: true, email: true } },
      },
    })

    // Reduce stock
    for (const item of cartItems) {
      await tx.product.update({
        where: { id: item.productId },
        data: { stock: { decrement: item.quantity } },
      })
    }

    // Clear cart
    await tx.cartItem.deleteMany({ where: { userId } })

    return newOrder
  })

  // Create Midtrans Snap token
  try {
    const snapTransaction = await createSnapToken({
      orderId: order.id,
      amount: order.totalAmount,
      customerName: order.user.name,
      customerEmail: order.user.email,
      items: order.orderItems.map((item) => ({
        id: item.productId,
        price: item.price,
        quantity: item.quantity,
        name: item.product.name,
      })),
    })

    const updatedOrder = await prisma.order.update({
      where: { id: order.id },
      data: {
        snapToken: snapTransaction.token,
        paymentUrl: snapTransaction.redirect_url,
      },
    })

    res.status(201).json({
      success: true,
      data: {
        order: updatedOrder,
        snapToken: snapTransaction.token,
        paymentUrl: snapTransaction.redirect_url,
      },
    })
  } catch (error) {
    console.error('Midtrans error:', error)
    // Order created but payment token failed
    res.status(201).json({
      success: true,
      data: { order },
      warning: 'Order dibuat tapi gagal membuat token pembayaran. Coba lagi.',
    })
  }
}

export const getOrders = async (req: AuthRequest, res: Response): Promise<void> => {
  const userId = req.user!.id

  const orders = await prisma.order.findMany({
    where: { userId },
    include: {
      orderItems: {
        include: { product: { select: { name: true, imageUrl: true, unit: true } } },
      },
    },
    orderBy: { createdAt: 'desc' },
  })

  res.json({ success: true, data: orders })
}

export const getOrderById = async (req: AuthRequest, res: Response): Promise<void> => {
  const userId = req.user!.id
  const { id } = req.params as { id: string }

  const order = await prisma.order.findFirst({
    where: { id, userId },
    include: {
      orderItems: {
        include: { product: true },
      },
    },
  })

  if (!order) {
    res.status(404).json({ success: false, message: 'Order tidak ditemukan' })
    return
  }

  res.json({ success: true, data: order })
}

export const getAllOrders = async (_req: AuthRequest, res: Response): Promise<void> => {
  const orders = await prisma.order.findMany({
    include: {
      user: { select: { name: true, email: true } },
      orderItems: { include: { product: { select: { name: true } } } },
    },
    orderBy: { createdAt: 'desc' },
  })

  res.json({ success: true, data: orders })
}

export const updateOrderStatus = async (req: AuthRequest, res: Response): Promise<void> => {
  const { id } = req.params as { id: string }
  const { status } = req.body

  const validStatuses = ['PENDING', 'PAID', 'PROCESSING', 'SHIPPED', 'DELIVERED', 'CANCELLED']
  if (!validStatuses.includes(status)) {
    res.status(400).json({ success: false, message: 'Status tidak valid' })
    return
  }

  const order = await prisma.order.update({
    where: { id },
    data: { status },
  })

  // If status is updated to PAID, trigger automatic simulation
  if (status === 'PAID') {
    triggerAutoShippingSimulation(order.id)
  }

  res.json({ success: true, data: order })
}

export const cancelOrder = async (req: AuthRequest, res: Response): Promise<void> => {
  const userId = req.user!.id
  const { id } = req.params as { id: string }
  const { reason } = req.body

  const order = await prisma.order.findUnique({
    where: { id },
    include: { orderItems: true },
  })

  if (!order) {
    res.status(404).json({ success: false, message: 'Pesanan tidak ditemukan' })
    return
  }

  // Only creator or admin can cancel
  if (order.userId !== userId && req.user?.role !== 'ADMIN') {
    res.status(403).json({ success: false, message: 'Akses ditolak' })
    return
  }

  // Only PENDING orders can be cancelled before payment
  if (order.status !== 'PENDING') {
    res.status(400).json({
      success: false,
      message: `Pesanan dengan status ${order.status} tidak dapat dibatalkan sebelum pembayaran.`,
    })
    return
  }

  // Restock items and set CANCELLED in a transaction
  const updatedOrder = await prisma.$transaction(async (tx) => {
    for (const item of order.orderItems) {
      await tx.product.update({
        where: { id: item.productId },
        data: { stock: { increment: item.quantity } },
      })
    }

    return tx.order.update({
      where: { id },
      data: {
        status: 'CANCELLED',
        notes: reason
          ? `${order.notes ? order.notes + ' | ' : ''}Alasan Batal: ${reason}`
          : order.notes,
      },
      include: {
        orderItems: { include: { product: true } },
      },
    })
  })

  res.json({
    success: true,
    message: 'Pesanan berhasil dibatalkan dan stok produk telah dikembalikan.',
    data: updatedOrder,
  })
}

export const getOrderTracking = async (req: AuthRequest, res: Response): Promise<void> => {
  const userId = req.user!.id
  const { id } = req.params as { id: string }

  const order = await prisma.order.findUnique({
    where: { id },
    include: {
      orderItems: { include: { product: true } },
    },
  })

  if (!order) {
    res.status(404).json({ success: false, message: 'Pesanan tidak ditemukan' })
    return
  }

  if (order.userId !== userId && req.user?.role !== 'ADMIN') {
    res.status(403).json({ success: false, message: 'Akses ditolak' })
    return
  }

  const trackingSteps = [
    {
      step: 'PAID',
      title: 'Pembayaran Diterima',
      description: 'Pembayaran telah dikonfirmasi dan diverifikasi oleh sistem Midtrans Sandbox.',
      isDone: ['PAID', 'PROCESSING', 'SHIPPED', 'DELIVERED'].includes(order.status),
      isCurrent: order.status === 'PAID',
    },
    {
      step: 'PROCESSING',
      title: 'Diproses & Dikemas',
      description: 'Komoditas sedang disiapkan dan disortir kualitasnya di gudang.',
      isDone: ['PROCESSING', 'SHIPPED', 'DELIVERED'].includes(order.status),
      isCurrent: order.status === 'PROCESSING',
    },
    {
      step: 'SHIPPED',
      title: 'Dalam Pengiriman',
      description: 'Paket dalam perjalanan bersama kurir logistik J&T Express.',
      isDone: ['SHIPPED', 'DELIVERED'].includes(order.status),
      isCurrent: order.status === 'SHIPPED',
    },
    {
      step: 'DELIVERED',
      title: 'Paket Diterima',
      description: 'Pesanan telah sampai di tujuan dan diterima pembeli.',
      isDone: order.status === 'DELIVERED',
      isCurrent: order.status === 'DELIVERED',
    },
  ]

  res.json({
    success: true,
    data: {
      orderId: order.id,
      status: order.status,
      courier: 'J&T Express Cargo B2B',
      resiNumber: `JNT-GRM-${order.id.replace(/[^a-zA-Z0-9]/g, '').slice(0, 10).toUpperCase()}`,
      estimate: '1 - 3 Hari Kerja',
      steps: trackingSteps,
    },
  })
}

// Automatic Timed Simulation for Demo
export const triggerAutoShippingSimulation = (orderId: string) => {
  // Step 1: 15s to PROCESSING
  setTimeout(async () => {
    try {
      const o = await prisma.order.findUnique({ where: { id: orderId } })
      if (o && o.status === 'PAID') {
        await prisma.order.update({
          where: { id: orderId },
          data: { status: 'PROCESSING' },
        })
        console.log(`[AutoShip] Order ${orderId} -> PROCESSING`)
      }
    } catch (err) {
      console.error('[AutoShip Error]', err)
    }
  }, 15000)

  // Step 2: 35s to SHIPPED
  setTimeout(async () => {
    try {
      const o = await prisma.order.findUnique({ where: { id: orderId } })
      if (o && o.status === 'PROCESSING') {
        await prisma.order.update({
          where: { id: orderId },
          data: { status: 'SHIPPED' },
        })
        console.log(`[AutoShip] Order ${orderId} -> SHIPPED`)
      }
    } catch (err) {
      console.error('[AutoShip Error]', err)
    }
  }, 35000)

  // Step 3: 60s to DELIVERED
  setTimeout(async () => {
    try {
      const o = await prisma.order.findUnique({ where: { id: orderId } })
      if (o && o.status === 'SHIPPED') {
        await prisma.order.update({
          where: { id: orderId },
          data: { status: 'DELIVERED' },
        })
        console.log(`[AutoShip] Order ${orderId} -> DELIVERED`)
      }
    } catch (err) {
      console.error('[AutoShip Error]', err)
    }
  }, 60000)
}

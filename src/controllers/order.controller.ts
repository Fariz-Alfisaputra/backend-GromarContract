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

  res.json({ success: true, data: order })
}

import { Response } from 'express'
import { prisma } from '../lib/prisma'
import { AuthRequest } from '../types'

export const getCart = async (req: AuthRequest, res: Response): Promise<void> => {
  const userId = req.user!.id

  const cartItems = await prisma.cartItem.findMany({
    where: { userId },
    include: {
      product: {
        include: { category: { select: { name: true, slug: true } } },
      },
    },
    orderBy: { createdAt: 'asc' },
  })

  const total = cartItems.reduce((sum, item) => sum + item.product.price * item.quantity, 0)

  res.json({ success: true, data: { items: cartItems, total, count: cartItems.length } })
}

export const addToCart = async (req: AuthRequest, res: Response): Promise<void> => {
  const userId = req.user!.id
  const { productId, quantity = 1 } = req.body

  if (!productId) {
    res.status(400).json({ success: false, message: 'productId wajib diisi' })
    return
  }

  const product = await prisma.product.findUnique({ where: { id: productId } })
  if (!product || !product.isActive) {
    res.status(404).json({ success: false, message: 'Produk tidak ditemukan' })
    return
  }

  if (product.stock < quantity) {
    res.status(400).json({ success: false, message: `Stok tidak cukup. Stok tersedia: ${product.stock}` })
    return
  }

  const cartItem = await prisma.cartItem.upsert({
    where: { userId_productId: { userId, productId } },
    update: { quantity: { increment: quantity } },
    create: { userId, productId, quantity },
    include: { product: true },
  })

  res.json({ success: true, data: cartItem, message: 'Produk berhasil ditambahkan ke keranjang' })
}

export const updateCartItem = async (req: AuthRequest, res: Response): Promise<void> => {
  const userId = req.user!.id
  const { id } = req.params as { id: string }
  const { quantity } = req.body

  if (!quantity || quantity < 1) {
    res.status(400).json({ success: false, message: 'Quantity minimal 1' })
    return
  }

  const cartItem = await prisma.cartItem.findFirst({ where: { id, userId } })
  if (!cartItem) {
    res.status(404).json({ success: false, message: 'Item keranjang tidak ditemukan' })
    return
  }

  const product = await prisma.product.findUnique({ where: { id: cartItem.productId } })
  if (product && product.stock < quantity) {
    res.status(400).json({ success: false, message: `Stok tidak cukup. Stok tersedia: ${product.stock}` })
    return
  }

  const updated = await prisma.cartItem.update({
    where: { id },
    data: { quantity },
    include: { product: true },
  })

  res.json({ success: true, data: updated })
}

export const removeFromCart = async (req: AuthRequest, res: Response): Promise<void> => {
  const userId = req.user!.id
  const { id } = req.params as { id: string }

  const cartItem = await prisma.cartItem.findFirst({ where: { id, userId } })
  if (!cartItem) {
    res.status(404).json({ success: false, message: 'Item keranjang tidak ditemukan' })
    return
  }

  await prisma.cartItem.delete({ where: { id } })
  res.json({ success: true, message: 'Item berhasil dihapus dari keranjang' })
}

export const clearCart = async (req: AuthRequest, res: Response): Promise<void> => {
  const userId = req.user!.id
  await prisma.cartItem.deleteMany({ where: { userId } })
  res.json({ success: true, message: 'Keranjang berhasil dikosongkan' })
}

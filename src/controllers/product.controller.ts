import { Request, Response } from 'express'
import { prisma } from '../lib/prisma'
import { z } from 'zod'

const productSchema = z.object({
  name: z.string().min(2),
  slug: z.string().min(2),
  description: z.string().optional(),
  price: z.number().positive(),
  stock: z.number().int().min(0),
  unit: z.string().default('kg'),
  imageUrl: z.string().url().optional().or(z.literal('')),
  categoryId: z.string(),
  isActive: z.boolean().optional(),
})

export const getProducts = async (req: Request, res: Response): Promise<void> => {
  const { category, search, page = '1', limit = '12', sort = 'createdAt' } = req.query

  const skip = (parseInt(page as string) - 1) * parseInt(limit as string)
  const take = parseInt(limit as string)

  const where: any = { isActive: true }

  if (category) {
    where.category = { slug: category }
  }

  if (search) {
    where.OR = [
      { name: { contains: search as string, mode: 'insensitive' } },
      { description: { contains: search as string, mode: 'insensitive' } },
    ]
  }

  const [products, total] = await Promise.all([
    prisma.product.findMany({
      where,
      skip,
      take,
      include: { category: { select: { id: true, name: true, slug: true } } },
      orderBy: sort === 'price_asc'
        ? { price: 'asc' }
        : sort === 'price_desc'
        ? { price: 'desc' }
        : { createdAt: 'desc' },
    }),
    prisma.product.count({ where }),
  ])

  res.json({
    success: true,
    data: products,
    meta: {
      total,
      page: parseInt(page as string),
      limit: take,
      totalPages: Math.ceil(total / take),
    },
  })
}

export const getProductBySlug = async (req: Request, res: Response): Promise<void> => {
  const { slug } = req.params as { slug: string }

  const product = await prisma.product.findUnique({
    where: { slug },
    include: { category: { select: { id: true, name: true, slug: true } } },
  })

  if (!product) {
    res.status(404).json({ success: false, message: 'Produk tidak ditemukan' })
    return
  }

  res.json({ success: true, data: product })
}

export const createProduct = async (req: Request, res: Response): Promise<void> => {
  const parsed = productSchema.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ success: false, errors: parsed.error.flatten().fieldErrors })
    return
  }

  const existing = await prisma.product.findUnique({ where: { slug: parsed.data.slug } })
  if (existing) {
    res.status(400).json({ success: false, message: 'Slug sudah digunakan' })
    return
  }

  const product = await prisma.product.create({
    data: parsed.data,
    include: { category: true },
  })

  res.status(201).json({ success: true, data: product })
}

export const updateProduct = async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params as { id: string }
  const parsed = productSchema.partial().safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ success: false, errors: parsed.error.flatten().fieldErrors })
    return
  }

  const product = await prisma.product.update({
    where: { id },
    data: parsed.data,
    include: { category: true },
  })

  res.json({ success: true, data: product })
}

export const deleteProduct = async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params as { id: string }
  await prisma.product.update({ where: { id }, data: { isActive: false } })
  res.json({ success: true, message: 'Produk berhasil dihapus' })
}

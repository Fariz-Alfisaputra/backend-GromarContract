import { Request, Response } from 'express'
import { prisma } from '../lib/prisma'
import { z } from 'zod'

/** Convert a product name into a URL-friendly slug */
function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '')   // remove non-word chars (except spaces & hyphens)
    .replace(/[\s_]+/g, '-')     // collapse whitespace / underscores to single hyphen
    .replace(/-+/g, '-')         // collapse multiple hyphens
    .replace(/^-+|-+$/g, '')     // trim leading/trailing hyphens
}

/** Ensure slug is unique — appends -2, -3, … if collision found */
async function uniqueSlug(baseSlug: string, excludeId?: string): Promise<string> {
  let slug = baseSlug
  let counter = 1
  while (true) {
    const existing = await prisma.product.findUnique({ where: { slug } })
    if (!existing || existing.id === excludeId) return slug
    counter++
    slug = `${baseSlug}-${counter}`
  }
}

const productSchema = z.object({
  name: z.string().min(2),
  slug: z.string().min(2).optional(),  // optional — auto-generated from name
  description: z.string().optional(),
  price: z.number().positive(),
  stock: z.number().int().min(0),
  unit: z.string().default('kg'),
  imageUrl: z.string().url().optional().or(z.literal('')).or(z.null()),
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

  // Auto-generate slug from name if not provided
  const slug = await uniqueSlug(parsed.data.slug || slugify(parsed.data.name))

  const product = await prisma.product.create({
    data: {
      ...parsed.data,
      slug,
      imageUrl: parsed.data.imageUrl || null,
    },
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

  const data: any = { ...parsed.data }
  // Coerce empty imageUrl to null
  if ('imageUrl' in data && !data.imageUrl) {
    data.imageUrl = null
  }

  const product = await prisma.product.update({
    where: { id },
    data,
    include: { category: true },
  })

  res.json({ success: true, data: product })
}

export const deleteProduct = async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params as { id: string }
  await prisma.product.update({ where: { id }, data: { isActive: false } })
  res.json({ success: true, message: 'Produk berhasil dihapus' })
}

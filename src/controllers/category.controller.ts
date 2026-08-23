import { Request, Response } from 'express'
import { prisma } from '../lib/prisma'

export const getCategories = async (_req: Request, res: Response): Promise<void> => {
  const categories = await prisma.category.findMany({
    include: { _count: { select: { products: { where: { isActive: true } } } } },
    orderBy: { name: 'asc' },
  })

  res.json({ success: true, data: categories })
}

export const createCategory = async (req: Request, res: Response): Promise<void> => {
  const { name, slug } = req.body

  if (!name || !slug) {
    res.status(400).json({ success: false, message: 'Name dan slug wajib diisi' })
    return
  }

  const existing = await prisma.category.findUnique({ where: { slug } })
  if (existing) {
    res.status(400).json({ success: false, message: 'Slug sudah digunakan' })
    return
  }

  const category = await prisma.category.create({ data: { name, slug } })
  res.status(201).json({ success: true, data: category })
}

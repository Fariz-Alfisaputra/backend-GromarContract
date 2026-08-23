import { Request, Response } from 'express'
import { prisma } from '../lib/prisma'
import { z } from 'zod'

const contractSchema = z.object({
  sector: z.enum(['agro', 'marine']),
  productName: z.string().min(2, 'Nama produk minimal 2 karakter'),
  minVolume: z.string().min(1, 'Volume minimal wajib diisi'),
  price: z.string().min(1, 'Harga wajib diisi'),
  region: z.string().min(2, 'Wilayah minimal 2 karakter'),
})

export const createContractRequest = async (req: Request, res: Response): Promise<void> => {
  const parsed = contractSchema.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ success: false, errors: parsed.error.flatten().fieldErrors })
    return
  }

  const { sector, productName, minVolume, price, region } = parsed.data
  const userId = (req as any).user.id

  try {
    const contract = await prisma.contractRequest.create({
      data: {
        sector,
        productName,
        minVolume,
        price,
        region,
        userId,
      },
    })
    res.status(201).json({ success: true, data: contract })
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message })
  }
}

export const getContractRequests = async (req: Request, res: Response): Promise<void> => {
  const user = (req as any).user

  try {
    const contracts = await prisma.contractRequest.findMany({
      where: (user.role === 'ADMIN' || user.role === 'SELLER') ? {} : { userId: user.id },
      include: {
        user: {
          select: { name: true, email: true, role: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    })
    res.json({ success: true, data: contracts })
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message })
  }
}

export const updateContractRequestStatus = async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params as { id: string }
  const { status } = req.body
  const user = (req as any).user

  if (user.role !== 'ADMIN' && user.role !== 'SELLER') {
    res.status(403).json({ success: false, message: 'Akses ditolak. Hanya Penjual atau Admin yang dapat menyetujui kontrak B2B.' })
    return
  }

  if (!['PENDING', 'APPROVED', 'REJECTED'].includes(status)) {
    res.status(400).json({ success: false, message: 'Status tidak valid' })
    return
  }

  try {
    const updated = await prisma.contractRequest.update({
      where: { id },
      data: { status },
    })
    res.json({ success: true, data: updated })
  } catch (error: any) {
    res.status(404).json({ success: false, message: 'Kontrak tidak ditemukan' })
  }
}

export const deleteContractRequest = async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params as { id: string }
  const user = (req as any).user

  try {
    const contract = await prisma.contractRequest.findUnique({ where: { id } })
    if (!contract) {
      res.status(404).json({ success: false, message: 'Kontrak tidak ditemukan' })
      return
    }

    // Only creator or admin can delete
    if (contract.userId !== user.id && user.role !== 'ADMIN') {
      res.status(403).json({ success: false, message: 'Akses ditolak' })
      return
    }

    await prisma.contractRequest.delete({ where: { id } })
    res.json({ success: true, message: 'Kontrak berhasil dibatalkan/dihapus' })
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message })
  }
}

import { Request, Response } from 'express'
import { prisma } from '../lib/prisma'
import { z } from 'zod'
import { snap } from '../services/payment.service'

const contractSchema = z.object({
  sector: z.enum(['agro', 'marine']),
  productName: z.string().min(2, 'Nama produk minimal 2 karakter'),
  minVolume: z.string().min(1, 'Volume minimal wajib diisi'),
  price: z.string().min(1, 'Harga wajib diisi'),
  region: z.string().min(2, 'Wilayah minimal 2 karakter'),
  companyName: z.string().optional(),
  nibOrNik: z.string().optional(),
  picContact: z.string().optional(),
  supplyDuration: z.string().optional(),
  documentUrl: z.string().optional(),
  buyerNotes: z.string().optional(),
})

const escrowCancelSchema = z.object({
  reason: z.string().min(3),
})

const escrowDepositSchema = z.object({
  // dpAmount is nominal DP/escrow to lock. Use Float to be consistent with Prisma.
  dpAmount: z.number().positive(),
})

const escrowShipSchema = z.object({
  trackingNumber: z.string().min(3),
})

const escrowReleaseSchema = z.object({
  bastVerifiedAt: z.string().optional(),
})

const safeNow = () => new Date()

type EscrowDepositResult = {
  snapToken: string
  escrowPaymentUrl: string
}

export const createContractRequest = async (req: Request, res: Response): Promise<void> => {
  const parsed = contractSchema.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ success: false, errors: parsed.error.flatten().fieldErrors })
    return
  }

  const {
    sector,
    productName,
    minVolume,
    price,
    region,
    companyName,
    nibOrNik,
    picContact,
    supplyDuration,
    documentUrl,
    buyerNotes,
  } = parsed.data
  const userId = (req as any).user.id

  try {
    const count = await prisma.contractRequest.count()
    const contractNumber = `SPK-GRM/${sector.toUpperCase()}/${String(count + 1).padStart(4, '0')}/${new Date().getFullYear()}`

    const contract = await prisma.contractRequest.create({
      data: {
        contractNumber,
        sector,
        productName,
        minVolume,
        price,
        region,
        companyName: companyName || null,
        nibOrNik: nibOrNik || null,
        picContact: picContact || null,
        supplyDuration: supplyDuration || null,
        documentUrl: documentUrl || null,
        buyerNotes: buyerNotes || null,
        buyerSignedAt: new Date(),
        userId,
      },
      include: {
        user: { select: { name: true, email: true } },
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
  const { status, notes } = req.body
  const user = (req as any).user

  if (user.role !== 'ADMIN' && user.role !== 'SELLER') {
    res.status(403).json({ success: false, message: 'Akses ditolak. Hanya Penjual atau Admin yang dapat menyetujui kontrak B2B.' })
    return
  }

  if (!['PENDING', 'APPROVED', 'REJECTED', 'CANCELLED'].includes(status)) {
    res.status(400).json({ success: false, message: 'Status tidak valid' })
    return
  }

  try {
    const updateData: any = { status }

    if (status === 'APPROVED') {
      updateData.sellerSignedAt = new Date()
    } else if (status === 'CANCELLED') {
      updateData.cancelledAt = new Date()
      updateData.cancelledBy = user.role
      if (notes) updateData.cancellationReason = notes
    }

    const updated = await prisma.contractRequest.update({
      where: { id },
      data: updateData,
      include: {
        user: { select: { name: true, email: true } },
      },
    })
    res.json({ success: true, data: updated })
  } catch (error: any) {
    res.status(404).json({ success: false, message: 'Kontrak tidak ditemukan' })
  }
}

export const cancelContractRequest = async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params as { id: string }
  const { reason } = req.body
  const user = (req as any).user

  if (!reason || typeof reason !== 'string' || reason.trim().length < 3) {
    res.status(400).json({ success: false, message: 'Alasan pembatalan wajib diisi dengan jelas (minimal 3 karakter).' })
    return
  }

  try {
    const contract = await prisma.contractRequest.findUnique({ where: { id } })
    if (!contract) {
      res.status(404).json({ success: false, message: 'Kontrak tidak ditemukan' })
      return
    }

    // Customer can cancel own contract; Seller/Admin can cancel any
    if (contract.userId !== user.id && user.role !== 'ADMIN' && user.role !== 'SELLER') {
      res.status(403).json({ success: false, message: 'Akses ditolak' })
      return
    }

    const cancelledBy = user.role === 'ADMIN' ? 'ADMIN' : user.role === 'SELLER' ? 'SELLER' : 'BUYER'

    const updated = await prisma.contractRequest.update({
      where: { id },
      data: {
        status: 'CANCELLED',
        cancellationReason: reason.trim(),
        cancelledBy,
        cancelledAt: new Date(),
      },
      include: {
        user: { select: { name: true, email: true, role: true } },
      },
    })

    res.json({ success: true, message: 'Kontrak berhasil dibatalkan', data: updated })
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message })
  }
}

export const depositEscrow = async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params as { id: string }
  const user = (req as any).user
  const parsed = escrowDepositSchema.safeParse(req.body)

  if (!parsed.success) {
    res.status(400).json({ success: false, message: parsed.error.flatten() })
    return
  }

  const { dpAmount } = parsed.data

  try {
    const contract = await prisma.contractRequest.findUnique({ where: { id }, include: { user: true } })
    if (!contract) {
      res.status(404).json({ success: false, message: 'Kontrak tidak ditemukan' })
      return
    }

    // Escrow deposit only for buyer (or admin) and only when APPROVED
    if (contract.userId !== user.id && user.role !== 'ADMIN' && user.role !== 'SELLER') {
      res.status(403).json({ success: false, message: 'Akses ditolak' })
      return
    }

    if ((contract.escrowStatus ?? 'UNPAID') !== 'UNPAID') {
      res.status(400).json({ success: false, message: 'Escrow tidak tersedia untuk dideposit' })
      return
    }

    const escrowOrderId = `ESCROW-${contract.id}-${Date.now()}`

    // Create Midtrans Snap token for escrow deposit
    const snapTransaction = await snap.createTransaction({
      transaction_details: {
        order_id: escrowOrderId,
        gross_amount: Math.round(dpAmount),
      },
      customer_details: {
        first_name: contract.user?.name || 'Customer',
        email: contract.user?.email || 'customer@example.com',
      },
      item_details: [
        {
          id: 'escrow',
          price: Math.round(dpAmount),
          quantity: 1,
          name: `Escrow Kontrak ${contract.contractNumber || contract.id}`,
        },
      ],
      callbacks: {
        finish: `${process.env.FRONTEND_URL}/contract/${contract.id}?escrow=finish`,
      },
    })

    const updated = await prisma.contractRequest.update({
      where: { id },
      data: {
        escrowStatus: 'LOCKED',
        escrowAmount: dpAmount,
        escrowPaidAt: safeNow(),
        escrowMidtransOrderId: escrowOrderId,
        escrowSnapToken: snapTransaction.token,
        escrowPaymentUrl: snapTransaction.redirect_url,
      },
      include: { user: true },
    })

    res.json({ success: true, data: { snapToken: snapTransaction.token, paymentUrl: snapTransaction.redirect_url, contract: updated } })
  } catch (error: any) {
    res.status(500).json({ success: false, message: error?.message || 'Gagal membuat escrow token' })
  }
}

export const shipEscrow = async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params as { id: string }
  const user = (req as any).user
  const parsed = escrowShipSchema.safeParse(req.body)

  if (!parsed.success) {
    res.status(400).json({ success: false, message: parsed.error.flatten() })
    return
  }

  try {
    const contract = await prisma.contractRequest.findUnique({ where: { id } })
    if (!contract) {
      res.status(404).json({ success: false, message: 'Kontrak tidak ditemukan' })
      return
    }

    if (user.role !== 'ADMIN' && user.role !== 'SELLER') {
      res.status(403).json({ success: false, message: 'Hanya Admin/Seller yang dapat menginput resi.' })
      return
    }

    if (contract.escrowStatus !== 'LOCKED') {
      res.status(400).json({ success: false, message: 'Escrow belum terkunci.' })
      return
    }

    const updated = await prisma.contractRequest.update({
      where: { id },
      data: {
        deliveryStatus: 'SHIPPED',
        trackingNumber: parsed.data.trackingNumber,
      },
    })

    res.json({ success: true, data: updated })
  } catch (error: any) {
    res.status(500).json({ success: false, message: error?.message || 'Gagal menginput resi.' })
  }
}

export const releaseEscrow = async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params as { id: string }
  const user = (req as any).user
  const parsed = escrowReleaseSchema.safeParse(req.body || {})

  if (!parsed.success) {
    res.status(400).json({ success: false, message: parsed.error.flatten() })
    return
  }

  try {
    const contract = await prisma.contractRequest.findUnique({ where: { id }, include: { user: true } })
    if (!contract) {
      res.status(404).json({ success: false, message: 'Kontrak tidak ditemukan' })
      return
    }

    if (contract.userId !== user.id && user.role !== 'ADMIN') {
      res.status(403).json({ success: false, message: 'Akses ditolak' })
      return
    }

    if (contract.escrowStatus !== 'LOCKED') {
      res.status(400).json({ success: false, message: 'Escrow belum terkunci' })
      return
    }

    // Only allow release after shipped
    if (contract.deliveryStatus !== 'SHIPPED' && contract.deliveryStatus !== 'DELIVERED') {
      res.status(400).json({ success: false, message: 'Pengiriman belum diproses' })
      return
    }

    const updated = await prisma.contractRequest.update({
      where: { id },
      data: {
        escrowStatus: 'RELEASED',
        escrowReleasedAt: safeNow(),
        bastVerifiedAt: parsed.data.bastVerifiedAt ? new Date(parsed.data.bastVerifiedAt) : safeNow(),
        deliveryStatus: 'DELIVERED',
      },
    })

    res.json({ success: true, data: updated })
  } catch (error: any) {
    res.status(500).json({ success: false, message: error?.message || 'Gagal mencairkan escrow.' })
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

export const getContractRequestById = async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params as { id: string }
  const user = (req as any).user

  try {
    const contract = await prisma.contractRequest.findUnique({
      where: { id },
      include: {
        user: { select: { name: true, email: true, role: true } },
      },
    })

    if (!contract) {
      res.status(404).json({ success: false, message: 'Kontrak tidak ditemukan' })
      return
    }

    if (contract.userId !== user.id && user.role !== 'ADMIN' && user.role !== 'SELLER') {
      res.status(403).json({ success: false, message: 'Akses ditolak' })
      return
    }

    res.json({ success: true, data: contract })
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message })
  }
}

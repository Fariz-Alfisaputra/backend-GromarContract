import { Request, Response } from 'express'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import { prisma } from '../lib/prisma'
import { z } from 'zod'

const registerSchema = z.object({
  name: z.string().min(2, 'Nama minimal 2 karakter'),
  email: z.string().email('Format email tidak valid'),
  password: z.string().min(6, 'Password minimal 6 karakter'),
  role: z.string().optional(),
})

const loginSchema = z.object({
  email: z.string().email('Format email tidak valid'),
  password: z.string().min(1, 'Password wajib diisi'),
})

export const register = async (req: Request, res: Response): Promise<void> => {
  const parsed = registerSchema.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ success: false, errors: parsed.error.flatten().fieldErrors })
    return
  }

  const { name, email, password, role } = parsed.data

  const existing = await prisma.user.findUnique({ where: { email } })
  if (existing) {
    res.status(400).json({ success: false, message: 'Email sudah terdaftar' })
    return
  }

  const hashedPassword = await bcrypt.hash(password, 10)
  const user = await prisma.user.create({
    data: { 
      name, 
      email, 
      password: hashedPassword, 
      role: role || 'BUYER' 
    },
    select: { id: true, name: true, email: true, role: true, createdAt: true },
  })

  const token = jwt.sign(
    { id: user.id, email: user.email, role: user.role, name: user.name },
    process.env.JWT_SECRET!,
    { expiresIn: '7d' }
  )

  res.status(201).json({ success: true, data: { user, token } })
}

export const login = async (req: Request, res: Response): Promise<void> => {
  const parsed = loginSchema.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ success: false, errors: parsed.error.flatten().fieldErrors })
    return
  }

  const { email, password } = parsed.data

  const user = await prisma.user.findUnique({ where: { email } })
  if (!user) {
    res.status(401).json({ success: false, message: 'Email atau password salah' })
    return
  }

  const isMatch = await bcrypt.compare(password, user.password)
  if (!isMatch) {
    res.status(401).json({ success: false, message: 'Email atau password salah' })
    return
  }

  const token = jwt.sign(
    { id: user.id, email: user.email, role: user.role, name: user.name },
    process.env.JWT_SECRET!,
    { expiresIn: '7d' }
  )

  res.json({
    success: true,
    data: {
      user: { id: user.id, name: user.name, email: user.email, role: user.role },
      token,
    },
  })
}

export const getMe = async (req: Request, res: Response): Promise<void> => {
  const authReq = req as any
  const user = await prisma.user.findUnique({
    where: { id: authReq.user.id },
    select: { id: true, name: true, email: true, role: true, createdAt: true },
  })

  if (!user) {
    res.status(404).json({ success: false, message: 'User tidak ditemukan' })
    return
  }

  res.json({ success: true, data: user })
}

const updateProfileSchema = z.object({
  name: z.string().min(2, 'Nama minimal 2 karakter').optional(),
  email: z.string().email('Format email tidak valid').optional(),
  password: z.string().min(6, 'Password minimal 6 karakter').optional(),
})

export const updateProfile = async (req: Request, res: Response): Promise<void> => {
  const authReq = req as any
  const userId = authReq.user.id

  const parsed = updateProfileSchema.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ success: false, errors: parsed.error.flatten().fieldErrors })
    return
  }

  const { name, email, password } = parsed.data

  if (email) {
    const existing = await prisma.user.findFirst({
      where: { email, NOT: { id: userId } },
    })
    if (existing) {
      res.status(400).json({ success: false, message: 'Email sudah digunakan oleh akun lain' })
      return
    }
  }

  const updateData: any = {}
  if (name) updateData.name = name
  if (email) updateData.email = email
  if (password) {
    updateData.password = await bcrypt.hash(password, 10)
  }

  const updatedUser = await prisma.user.update({
    where: { id: userId },
    data: updateData,
    select: { id: true, name: true, email: true, role: true, createdAt: true },
  })

  res.json({ success: true, data: updatedUser })
}

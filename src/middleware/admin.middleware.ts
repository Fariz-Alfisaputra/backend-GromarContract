import { Response, NextFunction } from 'express'
import { AuthRequest } from '../types'

export const adminMiddleware = (req: AuthRequest, res: Response, next: NextFunction): void => {
  if (!req.user || req.user.role !== 'ADMIN') {
    res.status(403).json({ success: false, message: 'Akses ditolak. Hanya admin yang diizinkan.' })
    return
  }
  next()
}

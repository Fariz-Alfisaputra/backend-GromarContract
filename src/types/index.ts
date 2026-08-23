import { Request } from 'express'

export interface AuthRequest extends Request {
  user?: {
    id: string
    email: string
    role: string
    name: string
  }
}

export interface JwtPayload {
  id: string
  email: string
  role: string
  name: string
}

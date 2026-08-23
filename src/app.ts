import express, { Request, Response, NextFunction } from 'express'
import cors from 'cors'
import swaggerUi from 'swagger-ui-express'
import { Prisma } from '@prisma/client'
import { swaggerSpec } from './config/swagger'
import { prisma } from './lib/prisma'

import authRoutes from './routes/auth.routes'
import productRoutes from './routes/product.routes'
import categoryRoutes from './routes/category.routes'
import cartRoutes from './routes/cart.routes'
import orderRoutes from './routes/order.routes'
import paymentRoutes from './routes/payment.routes'
import contractRoutes from './routes/contract.routes'
import uploadRoutes from './routes/upload.routes'
import chatRoutes from './routes/chat.routes'
import path from 'path'

const app = express()

const allowedOrigins = (process.env.FRONTEND_URL || 'http://localhost:3000')
  .split(',')
  .map((origin) => origin.trim().replace(/\/$/, ''))
  .filter(Boolean)

// Middleware
app.use(cors({
  origin: (origin, callback) => {
    if (!origin) {
      callback(null, true)
      return
    }

    if (allowedOrigins.length === 0 || allowedOrigins.includes(origin)) {
      callback(null, true)
      return
    }

    callback(new Error(`CORS blocked for origin: ${origin}`))
  },
  credentials: true,
}))

// Raw body for Midtrans webhook verification (before json parser)
app.use('/api/payment/webhook', express.raw({ type: 'application/json' }))

app.use(express.json())
app.use(express.urlencoded({ extended: true }))
app.use('/uploads', express.static(path.join(__dirname, '../public/uploads')))

// Health check
app.get('/api/health', async (req: Request, res: Response) => {
  try {
    const userCount = await prisma.user.count()
    const forwardedProto = req.headers['x-forwarded-proto']
    const protocol = Array.isArray(forwardedProto)
      ? forwardedProto[0]
      : forwardedProto || req.protocol
    const host = req.get('host')
    const baseUrl = host ? `${protocol}://${host}` : `http://localhost:${process.env.PORT || 5000}`

    res.json({
      success: true,
      message: 'Gromar API is running 🚀',
      timestamp: new Date().toISOString(),
      env: process.env.NODE_ENV || 'development',
      database: 'connected',
      userCount,
      docs: `${baseUrl}/api-docs`,
    })
  } catch (error) {
    console.error('[Health Check] Database error:', error)

    res.status(503).json({
      success: false,
      message: 'API is running but database connection failed',
      timestamp: new Date().toISOString(),
      database: 'disconnected',
      error: error instanceof Error ? error.message : 'Unknown database error',
    })
  }
})

// Swagger UI Documentation
app.use(
  '/api-docs',
  swaggerUi.serve,
  swaggerUi.setup(swaggerSpec, {
    customSiteTitle: 'Gromar API Docs',
    customCss: `
      .swagger-ui .topbar { background: linear-gradient(135deg, #1a5c2a 0%, #2d8a47 100%); }
      .swagger-ui .topbar-wrapper .link span { color: white; font-weight: 800; font-size: 1.1rem; }
      .swagger-ui .topbar-wrapper .link::before { content: '🌿 '; }
      .swagger-ui .info .title { color: #1a5c2a; }
      .swagger-ui .btn.authorize { background: #15803d; border-color: #15803d; color: white; }
      .swagger-ui .btn.authorize svg { fill: white; }
      .swagger-ui .btn.authorize:hover { background: #166534; }
      .swagger-ui .opblock.opblock-get .opblock-summary-method { background: #3b82f6; }
      .swagger-ui .opblock.opblock-post .opblock-summary-method { background: #10b981; }
      .swagger-ui .opblock.opblock-put .opblock-summary-method { background: #f59e0b; }
      .swagger-ui .opblock.opblock-delete .opblock-summary-method { background: #ef4444; }
      .swagger-ui .opblock.opblock-patch .opblock-summary-method { background: #8b5cf6; }
    `,
    swaggerOptions: {
      persistAuthorization: true,
      displayRequestDuration: true,
      filter: true,
      tryItOutEnabled: true,
    },
  })
)

// Endpoint untuk raw JSON spec (berguna untuk import ke Postman/Insomnia)
app.get('/api-docs.json', (_req: Request, res: Response) => {
  res.setHeader('Content-Type', 'application/json')
  res.send(swaggerSpec)
})

// Routes
app.use('/api/auth', authRoutes)
app.use('/api/products', productRoutes)
app.use('/api/categories', categoryRoutes)
app.use('/api/cart', cartRoutes)
app.use('/api/orders', orderRoutes)
app.use('/api/payment', paymentRoutes)
app.use('/api/contracts', contractRoutes)
app.use('/api/upload', uploadRoutes)
app.use('/api/chat', chatRoutes)

// 404 handler
app.use((_req: Request, res: Response) => {
  res.status(404).json({ success: false, message: 'Route tidak ditemukan' })
})

// Global async error handler (Express 5 handles async errors natively)
app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    console.error('[Prisma KnownRequestError]', {
      code: err.code,
      message: err.message,
      meta: err.meta,
      stack: err.stack,
    })
  } else if (err instanceof Prisma.PrismaClientInitializationError) {
    console.error('[Prisma InitializationError]', {
      message: err.message,
      stack: err.stack,
    })
  } else if (err instanceof Prisma.PrismaClientRustPanicError) {
    console.error('[Prisma RustPanicError]', {
      message: err.message,
      stack: err.stack,
    })
  } else {
    console.error('[Error]', {
      name: err.name,
      message: err.message,
      stack: err.stack,
    })
  }

  res.status(500).json({
    success: false,
    message: 'Internal server error',
    ...(process.env.NODE_ENV === 'development' && { error: err.message }),
  })
})

export default app

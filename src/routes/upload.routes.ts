import { Router } from 'express'
import multer from 'multer'
import path from 'path'
import fs from 'fs'
import { authMiddleware } from '../middleware/auth.middleware'
import { adminMiddleware } from '../middleware/admin.middleware'
import cloudinary from '../config/cloudinary'

const router = Router()

// Use memory storage — buffers can be sent to Cloudinary or written locally
const uploadImage = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
  fileFilter: (_req, file, cb) => {
    const allowedMimes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif']
    if (allowedMimes.includes(file.mimetype)) {
      cb(null, true)
    } else {
      cb(new Error('Hanya diperbolehkan mengunggah file gambar (jpg, png, webp, gif)!'))
    }
  }
})

// Document uploader (PDF & Scanned images, 10MB)
const uploadDocument = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
  fileFilter: (_req, file, cb) => {
    const allowedMimes = [
      'application/pdf',
      'image/jpeg', 'image/jpg', 'image/png', 'image/webp',
    ]
    if (allowedMimes.includes(file.mimetype)) {
      cb(null, true)
    } else {
      cb(new Error('Hanya diperbolehkan mengunggah berkas PDF atau gambar scan (.pdf, .jpg, .png)!'))
    }
  },
})

/** Helper: upload a buffer to Cloudinary and return the result */
async function uploadToCloudinary(
  buffer: Buffer,
  options: Record<string, any>
): Promise<any> {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(options, (error, result) => {
      if (error) reject(error)
      else resolve(result)
    })
    stream.end(buffer)
  })
}

/** Helper: save buffer to local disk storage and return public URL */
function saveLocally(req: any, buffer: Buffer, originalName: string, prefix = 'img'): string {
  const uploadDir = path.join(process.cwd(), 'public/uploads')
  if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true })
  }

  const ext = path.extname(originalName) || '.webp'
  const filename = `${prefix}-${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`
  const filePath = path.join(uploadDir, filename)
  fs.writeFileSync(filePath, buffer)

  const forwardedProto = req.headers['x-forwarded-proto']
  const protocol = Array.isArray(forwardedProto) ? forwardedProto[0] : forwardedProto || req.protocol
  const host = req.get('host') || `localhost:${process.env.PORT || 5000}`

  return `${protocol}://${host}/uploads/${filename}`
}

// Route for admin product image upload → Cloudinary with local storage fallback
router.post('/', authMiddleware, adminMiddleware, uploadImage.single('image'), async (req: any, res: any) => {
  if (!req.file) {
    return res.status(400).json({ success: false, message: 'Tidak ada file gambar yang diunggah' })
  }

  // 1. Try Cloudinary if credentials appear configured
  const cloudName = process.env.CLOUDINARY_CLOUD_NAME
  const isCloudinarySet = Boolean(cloudName && process.env.CLOUDINARY_API_KEY && process.env.CLOUDINARY_API_SECRET)

  if (isCloudinarySet) {
    try {
      const result = await uploadToCloudinary(req.file.buffer, {
        folder: 'gromar/products',
        format: 'webp',
        transformation: [
          { width: 800, height: 800, crop: 'limit', quality: 'auto:good' }
        ],
      })

      return res.json({ success: true, url: result.secure_url, storage: 'cloudinary' })
    } catch (cloudError: any) {
      console.warn('[Upload] Cloudinary upload failed (mismatch or network error):', cloudError?.message || cloudError)
      console.warn('[Upload] Falling back to local disk storage...')
    }
  }

  // 2. Fallback to local storage (dev mode, offline, or Cloudinary misconfigured)
  try {
    const localUrl = saveLocally(req, req.file.buffer, req.file.originalname, 'product')
    return res.json({
      success: true,
      url: localUrl,
      storage: 'local',
      warning: isCloudinarySet ? 'Gambar disimpan secara lokal karena Cloudinary gagal terhubung.' : undefined
    })
  } catch (localError: any) {
    console.error('[Upload] Local storage error:', localError)
    return res.status(500).json({
      success: false,
      message: 'Gagal mengunggah gambar ke cloud maupun penyimpanan lokal',
      ...(process.env.NODE_ENV === 'development' && { error: localError.message }),
    })
  }
})

// Route for B2B contract document / scan upload → Cloudinary with local storage fallback
router.post('/document', authMiddleware, uploadDocument.single('file'), async (req: any, res: any) => {
  if (!req.file) {
    return res.status(400).json({ success: false, message: 'Tidak ada berkas dokumen yang diunggah' })
  }

  const cloudName = process.env.CLOUDINARY_CLOUD_NAME
  const isCloudinarySet = Boolean(cloudName && process.env.CLOUDINARY_API_KEY && process.env.CLOUDINARY_API_SECRET)

  if (isCloudinarySet) {
    try {
      const isPdf = req.file.mimetype === 'application/pdf'
      const result = await uploadToCloudinary(req.file.buffer, {
        folder: 'gromar/documents',
        resource_type: isPdf ? 'raw' : 'image',
        format: isPdf ? 'pdf' : 'webp',
        ...(!isPdf && {
          transformation: [{ quality: 'auto:good' }],
        }),
      })

      return res.json({
        success: true,
        url: result.secure_url,
        filename: req.file.originalname,
        size: req.file.size,
        storage: 'cloudinary',
      })
    } catch (cloudError: any) {
      console.warn('[Upload] Cloudinary document error:', cloudError?.message || cloudError)
      console.warn('[Upload] Falling back to local disk storage for document...')
    }
  }

  // Fallback to local storage for document
  try {
    const localUrl = saveLocally(req, req.file.buffer, req.file.originalname, 'doc')
    return res.json({
      success: true,
      url: localUrl,
      filename: req.file.originalname,
      size: req.file.size,
      storage: 'local',
      warning: isCloudinarySet ? 'Dokumen disimpan secara lokal karena Cloudinary gagal terhubung.' : undefined
    })
  } catch (localError: any) {
    console.error('[Upload] Local storage document error:', localError)
    return res.status(500).json({
      success: false,
      message: 'Gagal mengunggah dokumen ke cloud maupun penyimpanan lokal',
      ...(process.env.NODE_ENV === 'development' && { error: localError.message }),
    })
  }
})

export default router

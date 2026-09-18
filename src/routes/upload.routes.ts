import { Router } from 'express'
import multer from 'multer'
import { authMiddleware } from '../middleware/auth.middleware'
import { adminMiddleware } from '../middleware/admin.middleware'
import cloudinary from '../config/cloudinary'

const router = Router()

// Use memory storage — no disk writes (required for Vercel Serverless)
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

// Route for admin product image upload → Cloudinary
router.post('/', authMiddleware, adminMiddleware, uploadImage.single('image'), async (req: any, res: any) => {
  if (!req.file) {
    return res.status(400).json({ success: false, message: 'Tidak ada file gambar yang diunggah' })
  }

  try {
    const result = await uploadToCloudinary(req.file.buffer, {
      folder: 'gromar/products',
      format: 'webp',
      transformation: [
        { width: 800, height: 800, crop: 'limit', quality: 'auto:good' }
      ],
    })

    res.json({ success: true, url: result.secure_url })
  } catch (error: any) {
    console.error('[Upload] Cloudinary error:', error)
    res.status(500).json({
      success: false,
      message: 'Gagal mengunggah gambar ke cloud storage',
      ...(process.env.NODE_ENV === 'development' && { error: error.message }),
    })
  }
})

// Route for B2B contract document / scan upload → Cloudinary
router.post('/document', authMiddleware, uploadDocument.single('file'), async (req: any, res: any) => {
  if (!req.file) {
    return res.status(400).json({ success: false, message: 'Tidak ada berkas dokumen yang diunggah' })
  }

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

    res.json({
      success: true,
      url: result.secure_url,
      filename: req.file.originalname,
      size: req.file.size,
    })
  } catch (error: any) {
    console.error('[Upload] Cloudinary document error:', error)
    res.status(500).json({
      success: false,
      message: 'Gagal mengunggah dokumen ke cloud storage',
      ...(process.env.NODE_ENV === 'development' && { error: error.message }),
    })
  }
})

export default router

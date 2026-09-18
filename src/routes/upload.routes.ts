import { Router } from 'express'
import multer from 'multer'
import { authMiddleware } from '../middleware/auth.middleware'
import { adminMiddleware } from '../middleware/admin.middleware'
import cloudinary from '../config/cloudinary'

const router = Router()

// Use memory storage — no disk writes (required for Vercel Serverless)
const upload = multer({
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

// Route for admin product image upload → Cloudinary
router.post('/', authMiddleware, adminMiddleware, upload.single('image'), async (req: any, res: any) => {
  if (!req.file) {
    return res.status(400).json({ success: false, message: 'Tidak ada file gambar yang diunggah' })
  }

  try {
    // Upload buffer to Cloudinary with auto WebP conversion
    const result = await new Promise<any>((resolve, reject) => {
      const uploadStream = cloudinary.uploader.upload_stream(
        {
          folder: 'gromar/products',
          format: 'webp',
          transformation: [
            { width: 800, height: 800, crop: 'limit', quality: 'auto:good' }
          ],
        },
        (error, result) => {
          if (error) reject(error)
          else resolve(result)
        }
      )
      uploadStream.end(req.file.buffer)
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

export default router

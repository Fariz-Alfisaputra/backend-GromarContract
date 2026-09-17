import { Router } from 'express'
import multer from 'multer'
import path from 'path'
import fs from 'fs'
import { authMiddleware } from '../middleware/auth.middleware'
import { adminMiddleware } from '../middleware/admin.middleware'

const router = Router()

// Configure storage
const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    const uploadDir = path.join(__dirname, '../../public/uploads')
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true })
    }
    cb(null, uploadDir)
  },
  filename: (_req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9)
    cb(null, uniqueSuffix + path.extname(file.originalname))
  },
})

// Image uploader (5MB)
const uploadImage = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
  fileFilter: (_req, file, cb) => {
    const allowed = /jpeg|jpg|png|webp|gif/
    const extname = allowed.test(path.extname(file.originalname).toLowerCase())
    const mimetype = allowed.test(file.mimetype)
    if (extname && mimetype) {
      cb(null, true)
    } else {
      cb(new Error('Hanya diperbolehkan mengunggah file gambar (jpg, png, webp, gif)!'))
    }
  },
})

// Document uploader (PDF & Scanned images, 10MB)
const uploadDocument = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
  fileFilter: (_req, file, cb) => {
    const allowed = /pdf|jpeg|jpg|png|webp/
    const extname = allowed.test(path.extname(file.originalname).toLowerCase())
    const mimetype = /pdf|image/.test(file.mimetype)
    if (extname && mimetype) {
      cb(null, true)
    } else {
      cb(new Error('Hanya diperbolehkan mengunggah berkas PDF atau gambar scan (.pdf, .jpg, .png)!'))
    }
  },
})

// Route for admin product image upload
router.post('/', authMiddleware, adminMiddleware, uploadImage.single('image'), (req: any, res: any) => {
  if (!req.file) {
    return res.status(400).json({ success: false, message: 'Tidak ada file gambar yang diunggah' })
  }

  const fileUrl = `${req.protocol}://${req.get('host')}/uploads/${req.file.filename}`
  res.json({ success: true, url: fileUrl })
})

// Route for B2B contract document / scan upload (accessible to authenticated users)
router.post('/document', authMiddleware, uploadDocument.single('file'), (req: any, res: any) => {
  if (!req.file) {
    return res.status(400).json({ success: false, message: 'Tidak ada berkas dokumen yang diunggah' })
  }

  const fileUrl = `${req.protocol}://${req.get('host')}/uploads/${req.file.filename}`
  res.json({
    success: true,
    url: fileUrl,
    filename: req.file.originalname,
    size: req.file.size,
  })
})

export default router

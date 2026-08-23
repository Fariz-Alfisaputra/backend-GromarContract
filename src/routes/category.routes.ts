import { Router } from 'express'
import { getCategories, createCategory } from '../controllers/category.controller'
import { authMiddleware } from '../middleware/auth.middleware'
import { adminMiddleware } from '../middleware/admin.middleware'

const router = Router()

router.get('/', getCategories)
router.post('/', authMiddleware, adminMiddleware, createCategory)

export default router

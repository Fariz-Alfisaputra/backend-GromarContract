import { Router } from 'express'
import {
  createOrder,
  getOrders,
  getOrderById,
  getAllOrders,
  updateOrderStatus,
} from '../controllers/order.controller'
import { authMiddleware } from '../middleware/auth.middleware'
import { adminMiddleware } from '../middleware/admin.middleware'

const router = Router()

router.use(authMiddleware)

router.post('/', createOrder)
router.get('/', getOrders)
router.get('/all', adminMiddleware, getAllOrders)
router.get('/:id', getOrderById)
router.patch('/:id/status', adminMiddleware, updateOrderStatus)

export default router

import { Router } from 'express'
import {
  createOrder,
  getOrders,
  getOrderById,
  getAllOrders,
  updateOrderStatus,
  cancelOrder,
  getOrderTracking,
} from '../controllers/order.controller'
import { authMiddleware } from '../middleware/auth.middleware'
import { adminMiddleware } from '../middleware/admin.middleware'

const router = Router()

router.use(authMiddleware)

router.post('/', createOrder)
router.get('/', getOrders)
router.get('/all', adminMiddleware, getAllOrders)
router.get('/:id', getOrderById)
router.get('/:id/tracking', getOrderTracking)
router.post('/:id/cancel', cancelOrder)
router.patch('/:id/status', adminMiddleware, updateOrderStatus)

export default router

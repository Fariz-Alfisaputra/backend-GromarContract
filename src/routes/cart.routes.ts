import { Router } from 'express'
import {
  getCart,
  addToCart,
  updateCartItem,
  removeFromCart,
  clearCart,
} from '../controllers/cart.controller'
import { authMiddleware } from '../middleware/auth.middleware'

const router = Router()

// All cart routes require authentication
router.use(authMiddleware)

router.get('/', getCart)
router.post('/', addToCart)
router.put('/:id', updateCartItem)
router.delete('/clear', clearCart)
router.delete('/:id', removeFromCart)

export default router

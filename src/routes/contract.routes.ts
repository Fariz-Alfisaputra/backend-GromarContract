import { Router } from 'express'
import {
  createContractRequest,
  getContractRequests,
  updateContractRequestStatus,
  deleteContractRequest,
} from '../controllers/contract.controller'
import { authMiddleware } from '../middleware/auth.middleware'

const router = Router()

// All contract endpoints require authentication
router.use(authMiddleware)

router.post('/', createContractRequest)
router.get('/', getContractRequests)
router.patch('/:id/status', updateContractRequestStatus)
router.delete('/:id', deleteContractRequest)

export default router

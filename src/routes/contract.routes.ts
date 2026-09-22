import { Router } from 'express'
import {
  createContractRequest,
  getContractRequests,
  getContractRequestById,
  updateContractRequestStatus,
  cancelContractRequest,
  deleteContractRequest,
  depositEscrow,
  shipEscrow,
  releaseEscrow,
} from '../controllers/contract.controller'
import { authMiddleware } from '../middleware/auth.middleware'

const router = Router()

// All contract endpoints require authentication
router.use(authMiddleware)

router.post('/', createContractRequest)
router.get('/', getContractRequests)
router.get('/:id', getContractRequestById)
router.patch('/:id/status', updateContractRequestStatus)
router.post('/:id/cancel', cancelContractRequest)

// Escrow lifecycle
router.post('/:id/escrow/deposit', depositEscrow)
router.post('/:id/escrow/ship', shipEscrow)
router.post('/:id/escrow/release', releaseEscrow)

router.delete('/:id', deleteContractRequest)

export default router

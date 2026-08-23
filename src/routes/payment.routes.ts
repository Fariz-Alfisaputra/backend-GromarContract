import { Router } from 'express'
import { handleWebhook, getSnapToken } from '../controllers/payment.controller'

const router = Router()

// Midtrans webhook — no auth needed (verified by Midtrans signature)
router.post('/webhook', handleWebhook)

// Get snap token for existing order
router.get('/snap-token/:orderId', getSnapToken)

export default router

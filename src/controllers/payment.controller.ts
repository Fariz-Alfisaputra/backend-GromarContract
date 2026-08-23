import { Request, Response } from 'express'
import { prisma } from '../lib/prisma'
import { verifyNotification } from '../services/payment.service'

export const handleWebhook = async (req: Request, res: Response): Promise<void> => {
  try {
    const notification = req.body
    const orderId = notification.order_id

    // Verify notification from Midtrans
    const statusResponse = await verifyNotification(orderId)

    const transactionStatus = statusResponse.transaction_status
    const fraudStatus = statusResponse.fraud_status
    const paymentType = statusResponse.payment_type

    console.log(`[Webhook] Order: ${orderId}, Status: ${transactionStatus}, Fraud: ${fraudStatus}`)

    let orderStatus: string

    if (transactionStatus === 'capture') {
      orderStatus = fraudStatus === 'challenge' ? 'PENDING' : 'PAID'
    } else if (transactionStatus === 'settlement') {
      orderStatus = 'PAID'
    } else if (transactionStatus === 'cancel' || transactionStatus === 'deny' || transactionStatus === 'expire') {
      orderStatus = 'CANCELLED'
    } else if (transactionStatus === 'pending') {
      orderStatus = 'PENDING'
    } else {
      orderStatus = 'PENDING'
    }

    await prisma.order.update({
      where: { id: orderId },
      data: {
        status: orderStatus,
        paymentId: statusResponse.transaction_id,
      },
    })

    res.json({ success: true, message: 'Notification processed' })
  } catch (error) {
    console.error('[Webhook] Error:', error)
    res.status(500).json({ success: false, message: 'Webhook processing failed' })
  }
}

export const getSnapToken = async (req: Request, res: Response): Promise<void> => {
  const { orderId } = req.params as { orderId: string }

  const order = await prisma.order.findUnique({ where: { id: orderId } })

  if (!order || !order.snapToken) {
    res.status(404).json({ success: false, message: 'Order atau token tidak ditemukan' })
    return
  }

  res.json({ success: true, data: { snapToken: order.snapToken, paymentUrl: order.paymentUrl } })
}

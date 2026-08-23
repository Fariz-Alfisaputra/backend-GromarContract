import Midtrans from 'midtrans-client'

const snap = new Midtrans.Snap({
  isProduction: process.env.MIDTRANS_IS_PRODUCTION === 'true',
  serverKey: process.env.MIDTRANS_SERVER_KEY!,
  clientKey: process.env.MIDTRANS_CLIENT_KEY!,
})

export interface MidtransTransactionParams {
  orderId: string
  amount: number
  customerName: string
  customerEmail: string
  items: Array<{
    id: string
    price: number
    quantity: number
    name: string
  }>
}

export const createSnapToken = async (params: MidtransTransactionParams) => {
  const parameter = {
    transaction_details: {
      order_id: params.orderId,
      gross_amount: Math.round(params.amount),
    },
    customer_details: {
      first_name: params.customerName,
      email: params.customerEmail,
    },
    item_details: params.items.map((item) => ({
      id: item.id,
      price: Math.round(item.price),
      quantity: item.quantity,
      name: item.name,
    })),
    callbacks: {
      finish: `${process.env.FRONTEND_URL}/checkout/success`,
    },
  }

  const transaction = await snap.createTransaction(parameter)
  return transaction
}

export const verifyNotification = async (orderId: string) => {
  const statusResponse = await snap.transaction.status(orderId)
  return statusResponse
}

export { snap }

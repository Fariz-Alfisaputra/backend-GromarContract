import { Request, Response } from 'express'
import { CUSTOMER_SERVICE_SYSTEM_PROMPT } from '../lib/knowledge-base'

export const handleChat = async (req: Request, res: Response): Promise<void> => {
  try {
    const { messages } = req.body
    const cleanedMessages = Array.isArray(messages)
      ? messages.filter((m: any) => m && typeof m.content === 'string' && m.content.trim())
      : []

    if (cleanedMessages.length === 0) {
      res.status(400).json({ success: false, message: 'messages wajib diisi' })
      return
    }

    const omniBaseUrl = process.env.OMNIROUTE_BASE_URL || 'http://localhost:20128/v1'
    const omniApiKey = process.env.OMNIROUTE_API_KEY
    const omniModel = process.env.OMNIROUTE_MODEL || 'claude-sonnet-4-6'

    if (omniApiKey) {
      try {
        const response = await fetch(`${omniBaseUrl.replace(/\/$/, '')}/chat/completions`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${omniApiKey}`,
          },
          body: JSON.stringify({
            model: omniModel,
            messages: [
              { role: 'system', content: CUSTOMER_SERVICE_SYSTEM_PROMPT },
              ...cleanedMessages,
            ],
            max_tokens: 500,
          }),
        })

        if (response.ok) {
          const json: any = await response.json()
          const reply = json.choices?.[0]?.message?.content || json.choices?.[0]?.delta?.content || ''
          res.json({ success: true, reply: reply.trim() || 'Maaf, saya belum bisa menjawab itu.' })
          return
        }
      } catch (err) {
        console.error('[ChatController] OmniRoute error:', err)
      }
    }

    // Default intelligent assistant response fallback
    res.json({
      success: true,
      reply: 'Halo! Saya asisten GROMAR. Ada yang bisa saya bantu terkait produk toko segar, kontrak B2B, atau riwayat pesanan Anda?',
    })
  } catch (error) {
    console.error('[ChatController] Error:', error)
    res.status(500).json({ success: false, message: 'Terjadi kesalahan pada layanan chat.' })
  }
}

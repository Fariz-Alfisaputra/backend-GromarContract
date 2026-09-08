import { Request, Response } from 'express'
import { CUSTOMER_SERVICE_SYSTEM_PROMPT } from '../lib/knowledge-base'
import { tryResolveDatabaseIntent } from '../services/db-chat.service'
import { streamWithFallback, getAvailableProviders } from '../services/ai-provider.service'
import { getKnowledgeContext } from '../services/knowledge-cache.service'

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

    // Extract the latest user message
    const lastUserMessageObj = [...cleanedMessages].reverse().find((m) => m.role === 'user')
    const lastUserMessage = lastUserMessageObj ? lastUserMessageObj.content : ''

    // Set Server-Sent Events (SSE) headers for fast streaming
    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8')
    res.setHeader('Cache-Control', 'no-cache, no-transform')
    res.setHeader('Connection', 'keep-alive')
    res.setHeader('X-Accel-Buffering', 'no')
    res.flushHeaders?.()

    // ─────────────────────────────────────────────────────────────
    // FAST DETERMINISTIC DATABASE INTENT LAYER
    // ─────────────────────────────────────────────────────────────
    const dbResult = await tryResolveDatabaseIntent(lastUserMessage, req.headers.authorization)

    if (dbResult.handled && dbResult.reply) {
      console.log(`[CHAT] Database intent: ${dbResult.intentName}`)
      console.log('[CHAT] Database response')

      // Return instant database response via SSE stream
      res.write(`data: ${JSON.stringify({ text: dbResult.reply })}\n\n`)
      res.write('data: [DONE]\n\n')
      res.end()
      return
    }

    // ─────────────────────────────────────────────────────────────
    // MULTI-PROVIDER AI LAYER (Gemini / OpenAI / Groq + Fallback)
    // ─────────────────────────────────────────────────────────────
    const availableProviders = getAvailableProviders()
    console.log(`[CHAT] AI intent: ${dbResult.intentName || 'general_ai'} | Available providers: ${availableProviders.map((p) => p.name).join(', ') || 'none'}`)

    if (availableProviders.length === 0) {
      console.warn('[ChatController] No AI provider configured. Set at least one API key in .env')
      res.write(`data: ${JSON.stringify({ error: 'Layanan AI belum dikonfigurasi. Hubungi administrator.' })}\n\n`)
      res.write('data: [DONE]\n\n')
      res.end()
      return
    }

    // Build enriched system instruction with knowledge cache + hybrid DB context
    const knowledgeContext = await getKnowledgeContext()
    let effectiveSystemInstruction = CUSTOMER_SERVICE_SYSTEM_PROMPT
    if (knowledgeContext) {
      effectiveSystemInstruction += `\n\n${knowledgeContext}`
    }
    if (dbResult.contextData) {
      effectiveSystemInstruction += `\n\n${dbResult.contextData}`
    }

    let isAborted = false
    req.on('close', () => {
      isAborted = true
    })

    const { success, providerUsed } = await streamWithFallback(
      effectiveSystemInstruction,
      cleanedMessages,
      res,
      () => isAborted
    )

    if (!isAborted) {
      if (success) {
        console.log(`[CHAT] Response from '${providerUsed}'`)
      } else {
        console.error('[CHAT] All AI providers failed')
        res.write(`data: ${JSON.stringify({ error: 'Semua layanan AI sedang tidak tersedia. Silakan coba lagi nanti.' })}\n\n`)
      }
      res.write('data: [DONE]\n\n')
      res.end()
    }
  } catch (error) {
    console.error('[ChatController] Streaming error:', error)
    if (!res.headersSent) {
      res.status(500).json({ success: false, message: 'Terjadi kesalahan pada layanan streaming chat.' })
    } else {
      res.write(`data: ${JSON.stringify({ error: 'Terjadi kesalahan saat streaming respons.' })}\n\n`)
      res.write('data: [DONE]\n\n')
      res.end()
    }
  }
}

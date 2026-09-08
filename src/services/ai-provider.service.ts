import { Response } from 'express'
import { GoogleGenAI } from '@google/genai'
import OpenAI from 'openai'
import Groq from 'groq-sdk'

// ─────────────────────────────────────────────────────────────
// AI Provider Interface
// ─────────────────────────────────────────────────────────────
export interface AIProvider {
  name: string
  isAvailable(): boolean
  streamChat(
    systemPrompt: string,
    messages: Array<{ role: string; content: string }>,
    res: Response,
    isAbortedFn: () => boolean
  ): Promise<boolean>
}

// ─────────────────────────────────────────────────────────────
// 1. GEMINI PROVIDER
// ─────────────────────────────────────────────────────────────
let cachedGemini: GoogleGenAI | null = null

class GeminiProvider implements AIProvider {
  name = 'gemini'

  isAvailable(): boolean {
    return !!process.env.GEMINI_API_KEY
  }

  private getClient(): GoogleGenAI {
    if (!cachedGemini) {
      cachedGemini = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! })
    }
    return cachedGemini
  }

  async streamChat(
    systemPrompt: string,
    messages: Array<{ role: string; content: string }>,
    res: Response,
    isAbortedFn: () => boolean
  ): Promise<boolean> {
    const modelName = process.env.GEMINI_MODEL || 'gemini-3.6-flash'

    const geminiContents = messages.map((m) => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content.trim() }],
    }))

    const tryModel = async (model: string): Promise<boolean> => {
      try {
        const ai = this.getClient()
        const stream = await ai.models.generateContentStream({
          model,
          contents: geminiContents,
          config: {
            systemInstruction: systemPrompt,
            maxOutputTokens: 2048,
          },
        })

        for await (const chunk of stream) {
          if (isAbortedFn()) break
          const text = chunk.text || ''
          if (text) {
            res.write(`data: ${JSON.stringify({ text })}\n\n`)
          }
        }
        return true
      } catch (err: any) {
        console.warn(`[GeminiProvider] Error with '${model}':`, err?.message || err)
        return false
      }
    }

    let success = await tryModel(modelName)

    // Fallback to gemini-3.6-flash if configured model failed
    if (!success && modelName !== 'gemini-3.6-flash' && !isAbortedFn()) {
      console.log("[GeminiProvider] Fallback to 'gemini-3.6-flash'...")
      success = await tryModel('gemini-3.6-flash')
    }

    return success
  }
}

// ─────────────────────────────────────────────────────────────
// 2. OPENAI PROVIDER
// ─────────────────────────────────────────────────────────────
let cachedOpenAI: OpenAI | null = null

class OpenAIProvider implements AIProvider {
  name = 'openai'

  isAvailable(): boolean {
    return !!process.env.OPENAI_API_KEY
  }

  private getClient(): OpenAI {
    if (!cachedOpenAI) {
      cachedOpenAI = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! })
    }
    return cachedOpenAI
  }

  async streamChat(
    systemPrompt: string,
    messages: Array<{ role: string; content: string }>,
    res: Response,
    isAbortedFn: () => boolean
  ): Promise<boolean> {
    const modelName = process.env.OPENAI_MODEL || 'gpt-4o-mini'

    try {
      const client = this.getClient()
      const openaiMessages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
        { role: 'system', content: systemPrompt },
        ...messages.map((m) => ({
          role: m.role as 'user' | 'assistant',
          content: m.content.trim(),
        })),
      ]

      const stream = await client.chat.completions.create({
        model: modelName,
        messages: openaiMessages,
        max_tokens: 2048,
        stream: true,
      })

      for await (const chunk of stream) {
        if (isAbortedFn()) break
        const text = chunk.choices[0]?.delta?.content || ''
        if (text) {
          res.write(`data: ${JSON.stringify({ text })}\n\n`)
        }
      }

      return true
    } catch (err: any) {
      console.warn(`[OpenAIProvider] Error with '${modelName}':`, err?.message || err)
      return false
    }
  }
}

// ─────────────────────────────────────────────────────────────
// 3. GROQ PROVIDER
// ─────────────────────────────────────────────────────────────
let cachedGroq: Groq | null = null

class GroqProvider implements AIProvider {
  name = 'groq'

  isAvailable(): boolean {
    return !!process.env.GROQ_API_KEY
  }

  private getClient(): Groq {
    if (!cachedGroq) {
      cachedGroq = new Groq({ apiKey: process.env.GROQ_API_KEY! })
    }
    return cachedGroq
  }

  async streamChat(
    systemPrompt: string,
    messages: Array<{ role: string; content: string }>,
    res: Response,
    isAbortedFn: () => boolean
  ): Promise<boolean> {
    const modelName = process.env.GROQ_MODEL || 'llama-3.3-70b-versatile'

    try {
      const client = this.getClient()
      const groqMessages: Groq.Chat.Completions.ChatCompletionMessageParam[] = [
        { role: 'system', content: systemPrompt },
        ...messages.map((m) => ({
          role: m.role as 'user' | 'assistant',
          content: m.content.trim(),
        })),
      ]

      const stream = await client.chat.completions.create({
        model: modelName,
        messages: groqMessages,
        max_tokens: 2048,
        stream: true,
      })

      for await (const chunk of stream) {
        if (isAbortedFn()) break
        const text = chunk.choices[0]?.delta?.content || ''
        if (text) {
          res.write(`data: ${JSON.stringify({ text })}\n\n`)
        }
      }

      return true
    } catch (err: any) {
      console.warn(`[GroqProvider] Error with '${modelName}':`, err?.message || err)
      return false
    }
  }
}

// ─────────────────────────────────────────────────────────────
// PROVIDER REGISTRY & FALLBACK ENGINE
// ─────────────────────────────────────────────────────────────

// All registered providers
const allProviders: AIProvider[] = [
  new GeminiProvider(),
  new OpenAIProvider(),
  new GroqProvider(),
]

/**
 * Get the list of available providers (those with valid API keys).
 * The preferred provider (from AI_PROVIDER env) is placed first.
 */
export function getAvailableProviders(): AIProvider[] {
  const available = allProviders.filter((p) => p.isAvailable())
  const preferred = (process.env.AI_PROVIDER || 'gemini').toLowerCase()

  // Sort: preferred provider first, others keep their original order
  return available.sort((a, b) => {
    if (a.name === preferred) return -1
    if (b.name === preferred) return 1
    return 0
  })
}

/**
 * Stream chat with automatic fallback.
 * Tries the preferred provider first, then falls back to others.
 */
export async function streamWithFallback(
  systemPrompt: string,
  messages: Array<{ role: string; content: string }>,
  res: Response,
  isAbortedFn: () => boolean
): Promise<{ success: boolean; providerUsed: string | null }> {
  const providers = getAvailableProviders()

  if (providers.length === 0) {
    return { success: false, providerUsed: null }
  }

  for (const provider of providers) {
    if (isAbortedFn()) break

    console.log(`[AIProvider] Trying '${provider.name}'...`)
    const success = await provider.streamChat(systemPrompt, messages, res, isAbortedFn)

    if (success) {
      return { success: true, providerUsed: provider.name }
    }

    console.warn(`[AIProvider] '${provider.name}' failed, trying next...`)
  }

  return { success: false, providerUsed: null }
}

/**
 * Get a human-readable summary of configured providers.
 */
export function getProviderStatus(): string[] {
  return allProviders.map(
    (p) => `${p.name}: ${p.isAvailable() ? '✅ configured' : '❌ no API key'}`
  )
}

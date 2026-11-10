import { NextRequest } from 'next/server'
import ZAI from 'z-ai-web-dev-sdk'
import { db } from '@/lib/db'

export const runtime = 'nodejs'
export const maxDuration = 300

interface ChatRequestBody {
  conversationId?: string
  content?: string
  /** Attached image as a data URL — used for the vision call, never persisted */
  imageUrl?: string
  regenerate?: boolean
  model?: 'default' | 'thinking'
  mode?: string | null
  /** Used for temporary chats only — client-side history, not persisted */
  history?: { role: 'user' | 'assistant'; content: string }[]
}

const MODE_HINTS: Record<string, string> = {
  image: 'The user wants an image created. Since you cannot render images here, respond with a detailed image-generation prompt and a brief description of what the image would show.',
  search: 'The user wants up-to-date information. Clearly note when your knowledge may be outdated and suggest verifying time-sensitive details.',
  research: 'Provide a thorough, deeply researched answer with structured sections, key findings, and caveats.',
  code: 'Focus on producing correct, runnable code with clear explanations.',
  study: 'Act as a patient tutor: explain step by step with simple analogies and a short recap.',
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as ChatRequestBody
    const {
      conversationId,
      content,
      imageUrl,
      regenerate,
      model = 'default',
      mode = null,
      history = [],
    } = body

    if (!conversationId) {
      return Response.json({ error: 'conversationId is required' }, { status: 400 })
    }
    if (imageUrl && !imageUrl.startsWith('data:image/')) {
      return Response.json({ error: 'imageUrl must be an image data URL' }, { status: 400 })
    }
    if (imageUrl && imageUrl.length > 8_000_000) {
      return Response.json({ error: 'Image is too large' }, { status: 400 })
    }
    const hasText = !!content?.trim()
    if (!regenerate && !hasText && !imageUrl) {
      return Response.json({ error: 'content or imageUrl is required' }, { status: 400 })
    }

    // Temporary chats (client-only, never persisted)
    const isTemporary = conversationId.startsWith('temp-')

    if (!isTemporary) {
      const conversation = await db.conversation.findUnique({
        where: { id: conversationId },
      })
      if (!conversation) {
        return Response.json({ error: 'Conversation not found' }, { status: 404 })
      }
    }

    let savedUserMessageId: string | undefined

    if (!isTemporary) {
      if (regenerate) {
        const lastAssistant = await db.message.findFirst({
          where: { conversationId, role: 'assistant' },
          orderBy: { createdAt: 'desc' },
        })
        if (lastAssistant) {
          await db.message.delete({ where: { id: lastAssistant.id } })
        }
      } else {
        const savedUser = await db.message.create({
          data: { conversationId, role: 'user', content: content?.trim() ?? '' },
        })
        savedUserMessageId = savedUser.id
      }
    }

    const historyMessages: { role: 'user' | 'assistant'; content: string }[] = isTemporary
      ? [...history, { role: 'user' as const, content: content?.trim() ?? '' }]
      : (
          await db.message.findMany({
            where: { conversationId },
            orderBy: { createdAt: 'asc' },
          })
        ).map((m) => ({
          role: m.role as 'user' | 'assistant',
          content: m.content,
        }))

    const systemPrompt = [
      'You are ChatGPT, a helpful AI assistant in a ChatGPT-style web app.',
      "Always respond in the user's language.",
      'Use Markdown when it improves clarity: headings, bullet lists, tables and fenced code blocks with a language tag.',
      mode && MODE_HINTS[mode] ? `Special mode requested by the user: ${MODE_HINTS[mode]}` : '',
    ]
      .filter(Boolean)
      .join(' ')

    const zai = await ZAI.create()

    const textMessages = [
      { role: 'system' as const, content: systemPrompt },
      ...historyMessages,
    ]

    /* When a fresh image is attached, send the last user turn to the
       vision endpoint with the image inline. If the vision call fails
       (e.g. model/gateway does not accept it), fall back to text-only. */
    const attachImage =
      !!imageUrl && !regenerate && historyMessages.length > 0 &&
      historyMessages[historyMessages.length - 1].role === 'user'

    const thinkingParam = { type: (model === 'thinking' ? 'enabled' : 'disabled') as 'enabled' | 'disabled' }

    let upstream: unknown
    if (attachImage) {
      const visionMessages = textMessages.map((m, i) => {
        if (i !== textMessages.length - 1) return m
        const parts: { type: string; text?: string; image_url?: { url: string } }[] = []
        if (hasText) parts.push({ type: 'text', text: content!.trim() })
        parts.push({ type: 'image_url', image_url: { url: imageUrl! } })
        return { role: 'user', content: parts }
      })
      try {
        // "model" is intentionally omitted — the gateway picks the default
        // vision model (see the SDK README vision example).
        upstream = await zai.chat.completions.createVision({
          messages: visionMessages,
          stream: true,
          thinking: thinkingParam,
        } as Parameters<typeof zai.chat.completions.createVision>[0])
      } catch {
        const fallbackSystem =
          systemPrompt +
          ' Note: the user attached an image, but you cannot view images in this session. If asked about the image contents, say that you cannot see it in this demo.'
        upstream = await zai.chat.completions.create({
          messages: [
            { role: 'system', content: fallbackSystem },
            ...historyMessages,
          ],
          stream: true,
          thinking: thinkingParam,
        })
      }
    } else {
      upstream = await zai.chat.completions.create({
        messages: textMessages,
        stream: true,
        thinking: thinkingParam,
      })
    }

    const encoder = new TextEncoder()
    let closed = false
    let readerRef: ReadableStreamDefaultReader<Uint8Array> | null = null

    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        const send = (obj: Record<string, unknown>) => {
          if (closed) return
          try {
            controller.enqueue(encoder.encode(`data: ${JSON.stringify(obj)}\n\n`))
          } catch {
            closed = true
          }
        }

        send({ type: 'start', userMessageId: savedUserMessageId })

        let full = ''
        const reader = (upstream as ReadableStream<Uint8Array>).getReader()
        readerRef = reader
        const decoder = new TextDecoder()
        let buffer = ''

        const processLine = (line: string) => {
          const trimmed = line.trim()
          if (!trimmed.startsWith('data:')) return
          const payload = trimmed.slice(5).trim()
          if (!payload || payload === '[DONE]') return
          try {
            const json = JSON.parse(payload)
            const delta: string =
              json.choices?.[0]?.delta?.content ??
              json.choices?.[0]?.message?.content ??
              ''
            if (delta) {
              full += delta
              send({ type: 'delta', content: delta })
            }
          } catch {
            // ignore malformed keep-alive lines
          }
        }

        try {
          while (true) {
            const { done, value } = await reader.read()
            if (done) break
            buffer += decoder.decode(value, { stream: true })
            const lines = buffer.split('\n')
            buffer = lines.pop() ?? ''
            for (const line of lines) processLine(line)
          }
          if (buffer) processLine(buffer)
        } catch {
          send({ type: 'error', message: 'The stream was interrupted.' })
        }

        // Persist whatever was generated (full or partial on abort)
        if (full.trim()) {
          if (!isTemporary) {
            const saved = await db.message.create({
              data: { conversationId, role: 'assistant', content: full },
            })
            await db.conversation.update({
              where: { id: conversationId },
              data: { updatedAt: new Date() },
            })
            send({ type: 'done', messageId: saved.id })
          } else {
            send({ type: 'done' })
          }
        } else {
          send({ type: 'error', message: 'No response generated. Please try again.' })
        }

        closed = true
        try {
          controller.close()
        } catch {
          // already closed by client disconnect
        }
      },
      cancel() {
        closed = true
        try {
          readerRef?.cancel()
        } catch {
          // noop
        }
      },
    })

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-cache, no-transform',
        Connection: 'keep-alive',
        'X-Accel-Buffering': 'no',
      },
    })
  } catch (error) {
    console.error('Chat API error:', error)
    return Response.json({ error: 'Failed to process chat request' }, { status: 500 })
  }
}

import { NextRequest } from 'next/server'
import { randomUUID } from 'crypto'
import { db } from '@/lib/db'
import type { ReceiptItem, ReceiptPayload } from '@/components/chatgpt/types'

export const runtime = 'nodejs'
export const maxDuration = 120

/**
 * Receipt processing endpoint.
 *
 * Flow: the client POSTs { conversationId, imageUrl, text } here after the
 * user submits a receipt with instructions. The data is relayed to the
 * receipt-processing backend, which returns the payload that the client
 * renders as the receipt card. No chat model is involved — the payload IS
 * the response.
 *
 * ── Connecting YOUR backend ────────────────────────────────────────────────
 * Set RECEIPT_BACKEND_URL in the environment (the backend's base URL, e.g.
 * http://localhost:3000). On submit this route then sends, exactly like the
 * contract curl:
 *
 *   curl -X POST {RECEIPT_BACKEND_URL}/convert \
 *     -H "Content-Type: application/json" \
 *     -d '{ "image": "<raw base64 of the receipt image>" }'
 *
 * i.e. the base64 string WITHOUT the `data:image/...;base64,` prefix, and
 * expects the receipt payload JSON (see ReceiptPayload in
 * src/components/chatgpt/types.ts) as the response body. The user's typed
 * instructions are NOT sent to the backend (per the contract curl) — they are
 * stored with the conversation in this app's database.
 *
 * Without RECEIPT_BACKEND_URL the route returns the demo payload example.
 * ───────────────────────────────────────────────────────────────────────────
 */

interface ReceiptRequestBody {
  conversationId?: string
  imageUrl?: string
  text?: string
}

/** Payload example returned by the (demo) receipt-processing backend. */
const DEMO_RECEIPT: ReceiptPayload = {
  date_time: '2020-10-18T20:24:00Z',
  items: [
    {
      id: '0cd95972-5e2c-4f99-a12e-047bf9d07a5e',
      description: 'Shampoo',
      purchased_for: 'john',
      quantity: 1.0,
      tax_type: 'T',
      total_price: 4.65,
      unit_price: 4.65,
    },
    {
      id: '9ab9c254-af24-4291-b485-7bd829593e5b',
      description: 'Conditioner',
      purchased_for: 'jane',
      quantity: 1.0,
      tax_type: 'N',
      total_price: 7.89,
      unit_price: 7.89,
    },
    {
      id: 'd5ff5eb4-f5d7-4964-a063-9c696491b091',
      description: 'Go Chocolates',
      purchased_for: 'self',
      quantity: 2.0,
      tax_type: 'N',
      total_price: 17.98,
      unit_price: 17.98,
    },
  ],
  subtotal: 30.52,
  tax: 2.98,
  total: 33.5,
  transaction_number: '72987869213046140',
}

const num = (v: unknown, fallback = 0): number => {
  const n = typeof v === 'string' ? Number.parseFloat(v) : typeof v === 'number' ? v : NaN
  return Number.isFinite(n) ? n : fallback
}

/** Validate/coerce an arbitrary object into a ReceiptPayload (null if unusable). */
function normalizeReceipt(raw: unknown): ReceiptPayload | null {
  if (!raw || typeof raw !== 'object') return null
  const obj = raw as Record<string, unknown>
  if (!Array.isArray(obj.items) || obj.items.length === 0) return null

  const items: ReceiptItem[] = []
  for (const entry of obj.items) {
    if (!entry || typeof entry !== 'object') continue
    const e = entry as Record<string, unknown>
    const description = typeof e.description === 'string' ? e.description.trim() : ''
    if (!description) continue
    const taxRaw = typeof e.tax_type === 'string' ? e.tax_type.trim().toUpperCase() : 'N'
    items.push({
      id: typeof e.id === 'string' && e.id ? e.id : randomUUID(),
      description,
      purchased_for:
        typeof e.purchased_for === 'string' && e.purchased_for.trim()
          ? e.purchased_for.trim().toLowerCase()
          : 'self',
      quantity: num(e.quantity, 1),
      tax_type: taxRaw === 'T' ? 'T' : 'N',
      total_price: num(e.total_price),
      unit_price: num(e.unit_price, num(e.total_price)),
    })
  }
  if (items.length === 0) return null

  const subtotal =
    obj.subtotal !== undefined ? num(obj.subtotal) : items.reduce((s, i) => s + i.total_price, 0)
  const tax = obj.tax !== undefined ? num(obj.tax) : 0
  const total = obj.total !== undefined ? num(obj.total) : subtotal + tax

  const dateTime =
    typeof obj.date_time === 'string' &&
    obj.date_time &&
    !isNaN(new Date(obj.date_time).getTime())
      ? obj.date_time
      : new Date().toISOString()

  const txNumber =
    typeof obj.transaction_number === 'string' && obj.transaction_number.trim()
      ? obj.transaction_number.trim()
      : String(Math.floor(Math.random() * 1e17))

  return { date_time: dateTime, items, subtotal, tax, total, transaction_number: txNumber }
}

/** Extract the raw base64 string from an image data URL
 *  ("data:image/png;base64,iVBOR…" → "iVBOR…"). */
function toRawBase64(dataUrl: string): string {
  const marker = 'base64,'
  const idx = dataUrl.indexOf(marker)
  return idx >= 0 ? dataUrl.slice(idx + marker.length) : dataUrl
}

/** Forward to the user's real receipt-processing backend, if configured.
 *  Contract: POST {RECEIPT_BACKEND_URL}/convert  body { image: <base64> }. */
async function callBackend(
  backendBase: string,
  imageUrl: string
): Promise<ReceiptPayload | null> {
  try {
    const base = backendBase.replace(/\/+$/, '')
    const res = await fetch(`${base}/convert`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ image: toRawBase64(imageUrl) }),
      signal: AbortSignal.timeout(60_000),
    })
    if (!res.ok) return null
    return normalizeReceipt(await res.json())
  } catch {
    return null
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as ReceiptRequestBody
    const { conversationId, imageUrl, text } = body

    if (!imageUrl || !imageUrl.startsWith('data:image/')) {
      return Response.json({ error: 'imageUrl must be an image data URL' }, { status: 400 })
    }
    if (imageUrl.length > 8_000_000) {
      return Response.json({ error: 'Image is too large' }, { status: 400 })
    }

    // Real backend when configured, otherwise the demo payload example.
    const backendUrl = process.env.RECEIPT_BACKEND_URL
    const receipt =
      (backendUrl ? await callBackend(backendUrl, imageUrl) : null) ?? DEMO_RECEIPT

    const isTemporary = !conversationId || conversationId.startsWith('temp-')

    let id = `a-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
    let userMessageId: string | undefined
    if (!isTemporary) {
      const conversation = await db.conversation.findUnique({ where: { id: conversationId } })
      if (conversation) {
        const savedUser = await db.message.create({
          data: { conversationId, role: 'user', content: text?.trim() ?? '' },
        })
        userMessageId = savedUser.id
        const saved = await db.message.create({
          data: {
            conversationId,
            role: 'assistant',
            content: '',
            receiptJson: JSON.stringify(receipt),
          },
        })
        await db.conversation.update({
          where: { id: conversationId },
          data: { updatedAt: new Date() },
        })
        id = saved.id
      }
    }

    return Response.json({ id, userMessageId, receipt })
  } catch (error) {
    console.error('Receipt API error:', error)
    return Response.json({ error: 'Failed to process receipt' }, { status: 500 })
  }
}

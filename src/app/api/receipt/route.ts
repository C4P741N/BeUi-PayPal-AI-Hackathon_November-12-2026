import { NextRequest } from 'next/server'
import { randomUUID } from 'crypto'
import { createMessage, getConversation } from '@/lib/store'
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
 * RECEIPT_BACKEND_URL is required (the backend's base URL, e.g.
 * http://localhost:3001). On submit this route sends, exactly like the
 * contract curl:
 *
 *   curl -X POST {RECEIPT_BACKEND_URL}/convert \
 *     -H "Content-Type: application/json" \
 *     -d '{ "image": "<raw base64 of the receipt image>", "prompt": "<allocation instructions>" }'
 *
 * i.e. the base64 string WITHOUT the `data:image/...;base64,` prefix, and
 * expects the receipt payload JSON (see ReceiptPayload in
 * src/components/chatgpt/types.ts) as the response body — the payload the
 * backend returns IS the response; there is no demo fallback. The user's
 * typed instructions are sent as `prompt` and stored with the
 * conversation in this app's in-memory store.
 *
 * Errors: 503 when RECEIPT_BACKEND_URL is unset; 400 when allocation
 * instructions are empty; 422 for an unreadable receipt; and 502 when the
 * backend is unreachable or returns an invalid response.
 * ───────────────────────────────────────────────────────────────────────────
 */

interface ReceiptRequestBody {
  conversationId?: string
  imageUrl?: string
  text?: string
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

/** Forward to the user's receipt-processing backend.
 *  Contract: POST {RECEIPT_BACKEND_URL}/convert  body { image: <base64>, prompt }.
 *  The backend's response payload IS the result — never a demo fallback. */
async function callBackend(
  backendBase: string,
  imageUrl: string,
  prompt?: string
): Promise<{ ok: true; receipt: ReceiptPayload } | { ok: false; status: number; error: string }> {
  const base = backendBase.replace(/\/+$/, '')
  try {
    const res = await fetch(`${base}/convert`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ image: toRawBase64(imageUrl), prompt: prompt?.trim() }),
      signal: AbortSignal.timeout(60_000),
    })
    const payload: unknown = await res.json().catch(() => null)
    if (!res.ok) {
      const errorPayload =
        payload && typeof payload === 'object' ? (payload as Record<string, unknown>) : {}
      const errorCode = typeof errorPayload.error === 'string' ? errorPayload.error : ''
      const backendMessage =
        typeof errorPayload.message === 'string' ? errorPayload.message : ''
      const error =
        errorCode === 'INVALID_CONTACT'
          ? 'The receipt service returned an outdated contact-validation response. Restart the Rust backend; unassigned items should be assigned to you.'
          : backendMessage || `Receipt backend responded with HTTP ${res.status}`
      return {
        ok: false,
        status: errorCode === 'INVALID_CONTACT' ? 400 : errorCode === 'INVALID_RECEIPT' ? 422 : 502,
        error,
      }
    }
    const receipt = normalizeReceipt(payload)
    if (!receipt) {
      return {
        ok: false,
        status: 502,
        error: 'Receipt backend returned an invalid payload',
      }
    }
    return { ok: true, receipt }
  } catch {
    return {
      ok: false,
      status: 502,
      error: `Could not reach the receipt backend at ${base}/convert`,
    }
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
    if (!text?.trim()) {
      return Response.json(
        {
          error:
            'Add optional allocation instructions, e.g. "Alice had the pasta, Bob had drinks." Unassigned items will be assigned to you.',
        },
        { status: 400 }
      )
    }

    // The receipt-processing backend is required — its response IS the result.
    const backendUrl = process.env.RECEIPT_BACKEND_URL
    if (!backendUrl) {
      return Response.json(
        {
          error:
            'Receipt backend is not configured. Set RECEIPT_BACKEND_URL (e.g. http://localhost:3001).',
        },
        { status: 503 }
      )
    }
    const result = await callBackend(backendUrl, imageUrl, text)
    if (!result.ok) {
      return Response.json({ error: result.error }, { status: result.status })
    }
    const receipt = result.receipt

    const isTemporary = !conversationId || conversationId.startsWith('temp-')

    let id = `a-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
    let userMessageId: string | undefined
    if (!isTemporary) {
      const conversation = getConversation(conversationId)
      if (conversation) {
        const savedUser = createMessage({
          conversationId,
          role: 'user',
          content: text?.trim() ?? '',
        })
        userMessageId = savedUser?.id
        const saved = createMessage({
          conversationId,
          role: 'assistant',
          content: '',
          receiptJson: JSON.stringify(receipt),
        })
        if (saved) id = saved.id
      }
    }

    return Response.json({ id, userMessageId, receipt })
  } catch (error) {
    console.error('Receipt API error:', error)
    return Response.json({ error: 'Failed to process receipt' }, { status: 500 })
  }
}

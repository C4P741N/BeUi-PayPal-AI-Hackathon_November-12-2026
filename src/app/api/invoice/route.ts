import { NextRequest } from 'next/server'

export const runtime = 'nodejs'

export async function POST(req: NextRequest) {
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return Response.json({ error: 'Request body must be valid JSON' }, { status: 400 })
  }

  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return Response.json({ error: 'Request body must be a JSON object' }, { status: 400 })
  }
  const transactionNumber = Reflect.get(body, 'transaction_number')
  if (typeof transactionNumber !== 'string' || !transactionNumber.trim()) {
    return Response.json({ error: 'transaction_number is required' }, { status: 400 })
  }

  const backendUrl = process.env.RECEIPT_BACKEND_URL
  if (!backendUrl) {
    return Response.json(
      { error: 'Invoice backend is not configured. Set RECEIPT_BACKEND_URL.' },
      { status: 503 }
    )
  }

  const base = backendUrl.replace(/\/+$/, '')
  try {
    const response = await fetch(`${base}/invoice`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ transaction_number: transactionNumber.trim() }),
      signal: AbortSignal.timeout(60_000),
    })
    const responseText = await response.text()

    let payload: unknown
    try {
      payload = JSON.parse(responseText)
    } catch {
      console.error(`Invoice backend returned invalid JSON (HTTP ${response.status})`)
      return Response.json(
        { error: 'Invoice backend returned an invalid response. Check PayPal before retrying.' },
        { status: 502 }
      )
    }

    return Response.json(payload, { status: response.status })
  } catch (error) {
    console.error('Invoice API error:', error)
    return Response.json(
      { error: 'Could not reach the invoice backend. Check PayPal before retrying.' },
      { status: 502 }
    )
  }
}

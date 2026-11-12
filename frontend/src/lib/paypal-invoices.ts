export interface PayPalInvoice {
  id: string
  status: string
  invoice_number: string | null
  recipient_name: string | null
  recipient_email: string | null
  currency_code: string | null
  amount: string | null
  due_amount: string | null
  invoice_date: string | null
  create_time: string | null
  note: string | null
}

export function isPayPalInvoice(value: unknown): value is PayPalInvoice {
  if (!value || typeof value !== 'object') return false
  const invoice = value as Record<string, unknown>
  return (
    typeof invoice.id === 'string' &&
    typeof invoice.status === 'string' &&
    [
      'invoice_number',
      'recipient_name',
      'recipient_email',
      'currency_code',
      'amount',
      'due_amount',
      'invoice_date',
      'create_time',
      'note',
    ].every((key) => invoice[key] === null || typeof invoice[key] === 'string')
  )
}

interface InvoiceLookup {
  kind: 'paid_check' | 'paid_list' | 'active' | 'all'
  recipient?: string
}

const FINAL_INVOICE_STATUSES = new Set(['PAID', 'MARKED_AS_PAID', 'CANCELLED', 'REFUNDED'])
const PAID_INVOICE_STATUSES = new Set(['PAID', 'MARKED_AS_PAID'])

export function detectInvoiceLookup(message: string): InvoiceLookup | null {
  const text = message.trim()
  const paidMatch =
    text.match(/\b(?:has|have)\s+(?:the\s+)?(.+?)\s+paid\b/i) ??
    text.match(/\bdid\s+(?:the\s+)?(.+?)\s+pay\b/i)

  if (paidMatch) {
    const recipient = (paidMatch[1] ?? paidMatch[2])
      .replace(/\b(already|yet)\b/gi, '')
      .replace(/[?!.,]+$/g, '')
      .trim()
    return {
      kind: 'paid_check',
      recipient: /^(anyone|anybody|everyone|everybody)$/i.test(recipient) ? undefined : recipient,
    }
  }

  if (/\b(active|open|unpaid|outstanding)\s+invoices?\b/i.test(text)) {
    return { kind: 'active' }
  }

  if (/\bpaid\s+invoices?\b/i.test(text)) {
    return { kind: 'paid_list' }
  }

  if (/\b(show|list|display|find|check|what are|how many)\b/i.test(text) && /\binvoices?\b/i.test(text)) {
    return { kind: 'all' }
  }

  return null
}

export function filterInvoices(
  invoices: PayPalInvoice[],
  lookup: InvoiceLookup
): PayPalInvoice[] {
  let matches = invoices

  if (lookup.kind === 'active') {
    matches = matches.filter(
      (invoice) => !FINAL_INVOICE_STATUSES.has(invoice.status.toUpperCase())
    )
  } else if (lookup.kind === 'paid_list') {
    matches = matches.filter((invoice) =>
      PAID_INVOICE_STATUSES.has(invoice.status.toUpperCase())
    )
  } else if (lookup.kind === 'paid_check') {
    matches = matches.filter((invoice) => {
      if (!lookup.recipient) return true
      const recipient = `${invoice.recipient_name ?? ''} ${invoice.recipient_email ?? ''}`
      return recipient.toLocaleLowerCase().includes(lookup.recipient.toLocaleLowerCase())
    })
  }

  return matches
}

export function createInvoiceAnswer(
  lookup: InvoiceLookup,
  invoices: PayPalInvoice[]
): string {
  if (lookup.kind === 'active') {
    return invoices.length
      ? `You have ${invoices.length} active PayPal invoice${invoices.length === 1 ? '' : 's'}.`
      : 'You have no active PayPal invoices.'
  }

  if (lookup.kind === 'paid_list') {
    return `You have ${invoices.length} paid PayPal invoice${invoices.length === 1 ? '' : 's'}.`
  }

  if (lookup.kind === 'all') {
    return `I found ${invoices.length} PayPal invoice${invoices.length === 1 ? '' : 's'}.`
  }

  const name = lookup.recipient ?? 'anyone'
  const paidInvoices = invoices.filter((invoice) =>
    PAID_INVOICE_STATUSES.has(invoice.status.toUpperCase())
  )

  if (paidInvoices.length) {
    return `Yes—${name} has paid ${paidInvoices.length} invoice${paidInvoices.length === 1 ? '' : 's'}.`
  }
  if (invoices.length) {
    return `I don't see a paid invoice for ${name}. I found ${invoices.length} matching invoice${invoices.length === 1 ? '' : 's'}, but none are marked paid.`
  }
  return `I couldn't find any PayPal invoices for ${name}.`
}

export async function fetchPayPalInvoices(): Promise<PayPalInvoice[]> {
  const backendUrl = process.env.RECEIPT_BACKEND_URL
  if (!backendUrl) {
    throw new Error('Invoice backend is not configured. Set RECEIPT_BACKEND_URL.')
  }

  const base = backendUrl.replace(/\/+$/, '')
  const response = await fetch(`${base}/invoices`, {
    signal: AbortSignal.timeout(60_000),
  })

  let payload: unknown
  try {
    payload = await response.json()
  } catch {
    throw new Error('Invoice backend returned an invalid response.')
  }

  if (!response.ok) {
    const error =
      payload && typeof payload === 'object' && 'error' in payload &&
      typeof payload.error === 'string'
        ? payload.error
        : 'Could not retrieve PayPal invoices.'
    throw new Error(error)
  }

  if (
    !payload ||
    typeof payload !== 'object' ||
    !('items' in payload) ||
    !Array.isArray(payload.items)
  ) {
    throw new Error('Invoice backend returned an invalid invoice list.')
  }

  if (!payload.items.every(isPayPalInvoice)) {
    throw new Error('Invoice backend returned an invalid invoice record.')
  }
  return payload.items
}

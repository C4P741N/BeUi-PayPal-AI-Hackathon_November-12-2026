import { FileText } from 'lucide-react'
import type { PayPalInvoice } from '@/lib/paypal-invoices'

function formatAmount(value: string | null, currency: string | null): string {
  const amount = value === null ? Number.NaN : Number(value)
  if (!Number.isFinite(amount)) return 'Amount unavailable'

  const code = currency || 'USD'
  try {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: code,
    }).format(amount)
  } catch {
    return `${code} ${amount.toFixed(2)}`
  }
}

function statusStyle(status: string): string {
  if (['PAID', 'MARKED_AS_PAID'].includes(status.toUpperCase())) {
    return 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400'
  }
  if (['CANCELLED', 'REFUNDED'].includes(status.toUpperCase())) {
    return 'bg-muted text-muted-foreground'
  }
  return 'bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-400'
}

export function InvoiceListCard({ invoices }: { invoices: PayPalInvoice[] }) {
  return (
    <div className="mb-3 w-full max-w-2xl overflow-hidden rounded-2xl border border-border bg-background">
      <div className="flex items-center gap-2 border-b border-border bg-secondary/50 px-4 py-3">
        <FileText className="size-4 text-muted-foreground" aria-hidden />
        <span className="text-sm font-semibold">PayPal invoices</span>
        <span className="ml-auto text-xs text-muted-foreground">{invoices.length} found</span>
      </div>
      {invoices.length ? (
        <ul className="divide-y divide-border">
          {invoices.map((invoice) => (
            <li
              key={invoice.id}
              className="flex flex-wrap items-center justify-between gap-3 px-4 py-3"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">
                  {invoice.recipient_name || invoice.recipient_email || 'Recipient unavailable'}
                </p>
                <p className="mt-0.5 truncate font-mono text-xs text-muted-foreground">
                  {invoice.invoice_number ? `Invoice #${invoice.invoice_number}` : invoice.id}
                </p>
                {invoice.recipient_email && invoice.recipient_name && (
                  <p className="mt-0.5 truncate text-xs text-muted-foreground">
                    {invoice.recipient_email}
                  </p>
                )}
              </div>
              <div className="flex shrink-0 flex-col items-end gap-1">
                <span className="text-sm font-semibold tabular-nums">
                  {formatAmount(invoice.amount, invoice.currency_code)}
                </span>
                <span
                  className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${statusStyle(invoice.status)}`}
                >
                  {invoice.status.replace(/_/g, ' ')}
                </span>
                {invoice.due_amount && Number(invoice.due_amount) > 0 && (
                  <span className="text-[11px] text-muted-foreground">
                    {formatAmount(invoice.due_amount, invoice.currency_code)} due
                  </span>
                )}
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="px-4 py-5 text-sm text-muted-foreground">No matching invoices.</p>
      )}
    </div>
  )
}

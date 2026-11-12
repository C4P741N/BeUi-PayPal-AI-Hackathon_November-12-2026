'use client'

import { useState } from 'react'
import { Check, HandCoins, LoaderCircle, ReceiptText } from 'lucide-react'
import { useToast } from '@/hooks/use-toast'
import type { ReceiptItem, ReceiptPayload } from './types'

const money = (n: number) => `$${n.toFixed(2)}`

interface Debtor {
  name: string
  amount: number
}

/**
 * What each person mentioned on the receipt owes: their items plus their
 * share of the tax. Tax is distributed across the taxable (T) items in
 * proportion to their price, so people who only bought non-taxable (N)
 * items owe no tax.
 */
function buildDebtors(receipt: ReceiptPayload): Debtor[] {
  const shares = new Map<string, { name: string; items: number; taxable: number }>()
  for (const item of receipt.items) {
    const name = item.purchased_for.trim() || 'self'
    const key = name.toLowerCase()
    const entry = shares.get(key) ?? { name, items: 0, taxable: 0 }
    entry.items += item.total_price
    if (item.tax_type === 'T') entry.taxable += item.total_price
    shares.set(key, entry)
  }
  const totalTaxable = [...shares.values()].reduce((sum, share) => sum + share.taxable, 0)
  return [...shares.values()]
    .filter(({ name }) => name.toLowerCase() !== 'self')
    .map((share) => ({
      name: share.name,
      amount:
        share.items + (totalTaxable > 0 ? (receipt.tax * share.taxable) / totalTaxable : 0),
    }))
    .sort((a, b) => b.amount - a.amount)
}

function TaxChip({ type }: { type: ReceiptItem['tax_type'] }) {
  const taxable = type === 'T'
  return (
    <span
      title={taxable ? 'Taxable item' : 'Non-taxable item'}
      className={`inline-flex h-5 min-w-5 items-center justify-center rounded-md border px-1 text-[11px] font-semibold leading-none ${
        taxable
          ? 'border-amber-300/60 bg-amber-100 text-amber-700 dark:border-amber-500/40 dark:bg-amber-500/15 dark:text-amber-400'
          : 'border-border bg-muted text-muted-foreground'
      }`}
    >
      {type}
    </span>
  )
}

export function ReceiptCard({ receipt }: { receipt: ReceiptPayload }) {
  const { toast } = useToast()
  const [invoiced, setInvoiced] = useState(false)
  const [sending, setSending] = useState(false)
  const debtors = buildDebtors(receipt)

  const when = new Date(receipt.date_time)
  const dateLabel = isNaN(when.getTime())
    ? receipt.date_time
    : when.toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' })

  const sendInvoice = async () => {
    if (sending || invoiced) return
    setSending(true)
    try {
      const response = await fetch('/api/invoice', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ transaction_number: receipt.transaction_number }),
      })
      const result = (await response.json().catch(() => null)) as {
        success?: boolean
        error?: string
        invoice_id?: string
        invoice_status?: string
        already_exists?: boolean
        invoices?: {
          recipient_name: string
          invoice_id: string
          invoice_status: string
          already_exists: boolean
        }[]
        failures?: { recipient_name: string; error: string }[]
      } | null
      if (!result) {
        throw new Error('Invoice backend returned an invalid response. Check PayPal before retrying.')
      }

      if (!response.ok || !result.success) {
        const completed = result.invoices
          ?.map((invoice) => `${invoice.recipient_name} (${invoice.invoice_id})`)
          .join(', ')
        const invoiceNote = completed
          ? ` Already processed: ${completed}.`
          : result.invoice_id
            ? ` PayPal invoice ID: ${result.invoice_id}.`
            : ''
        const failureNote = result.failures?.length
          ? ` ${result.failures.map((failure) => `${failure.recipient_name}: ${failure.error}`).join('; ')}`
          : ''
        throw new Error(
          `${result.error || 'Could not send PayPal invoices.'}${invoiceNote}${failureNote} Already sent invoices will not be sent again on retry.`
        )
      }

      setInvoiced(true)
      const recipients = result.invoices
        ?.map((invoice) => `${invoice.recipient_name} (${invoice.invoice_id})`)
        .join(', ')
      toast({
        description: recipients
          ? `PayPal invoices for ${recipients} were processed using the configured recipient email.`
          : result.already_exists
            ? `PayPal invoice ${result.invoice_id} already exists with status ${result.invoice_status ?? 'unknown'}; it was not sent again.`
            : result.invoice_id
              ? `PayPal invoice ${result.invoice_id} sent to the configured recipient email.`
              : 'PayPal invoices sent to the configured recipient email.',
      })
    } catch (error) {
      toast({
        description: error instanceof Error ? error.message : 'Could not send the PayPal invoice.',
      })
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="w-full overflow-hidden rounded-2xl border border-border bg-background">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border bg-secondary/50 px-4 py-3">
        <div className="flex items-center gap-2">
          <ReceiptText className="size-4 text-muted-foreground" aria-hidden />
          <span className="text-sm font-semibold">Receipt</span>
        </div>
        <span className="text-xs text-muted-foreground">{dateLabel}</span>
      </div>

      {/* Items */}
      <div className="scrollbar-subtle max-h-80 overflow-y-auto">
        <ul className="divide-y divide-border">
          {receipt.items.map((item) => (
            <li key={item.id} className="flex items-start justify-between gap-3 px-4 py-2.5">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{item.description}</p>
                <div className="mt-1 flex flex-wrap items-center gap-1.5">
                  <span className="inline-flex items-center rounded-full bg-accent px-2 py-0.5 text-[11px] font-medium capitalize text-foreground/80">
                    for {item.purchased_for}
                  </span>
                  <span className="text-[11px] text-muted-foreground">
                    {item.quantity} × {money(item.unit_price)}
                  </span>
                  <TaxChip type={item.tax_type} />
                </div>
              </div>
              <span className="shrink-0 text-sm font-medium tabular-nums">
                {money(item.total_price)}
              </span>
            </li>
          ))}
        </ul>
      </div>

      {/* Totals */}
      <div className="space-y-1.5 border-t border-border bg-secondary/40 px-4 py-3">
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span>Subtotal</span>
          <span className="tabular-nums">{money(receipt.subtotal)}</span>
        </div>
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span>Tax</span>
          <span className="tabular-nums">{money(receipt.tax)}</span>
        </div>
        <div className="flex items-center justify-between border-t border-border pt-1.5 text-sm font-semibold">
          <span>Total</span>
          <span className="tabular-nums">{money(receipt.total)}</span>
        </div>
        {receipt.transaction_number && (
          <p className="pt-1 font-mono text-[11px] text-muted-foreground">
            Transaction #{receipt.transaction_number}
          </p>
        )}

        {/* Who owes what — everyone mentioned except yourself */}
        {debtors.length > 0 && (
          <div className="space-y-1.5 border-t border-border pt-2.5">
            <ul className="space-y-1">
              {debtors.map((d) => (
                <li key={d.name} className="flex items-center justify-between text-sm">
                  <span className="capitalize text-foreground/80">{d.name} owes</span>
                  <span className="font-medium tabular-nums">{money(d.amount)}</span>
                </li>
              ))}
            </ul>
            <p className="text-[11px] text-muted-foreground">
              Includes each person&rsquo;s share of the tax on taxable (T) items.
            </p>
            <button
              onClick={sendInvoice}
              disabled={sending || invoiced}
              title={
                invoiced
                  ? 'Invoices sent'
                  : `Send PayPal invoices for transaction ${receipt.transaction_number}`
              }
              className="mt-1 flex h-9 w-full items-center justify-center gap-2 rounded-lg bg-primary text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:cursor-default disabled:opacity-60"
            >
              {invoiced ? (
                <Check className="size-4" aria-hidden />
              ) : sending ? (
                <LoaderCircle className="size-4 animate-spin" aria-hidden />
              ) : (
                <HandCoins className="size-4" aria-hidden />
              )}
              {invoiced ? 'Invoices sent' : sending ? 'Sending invoices…' : 'Send invoices now'}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

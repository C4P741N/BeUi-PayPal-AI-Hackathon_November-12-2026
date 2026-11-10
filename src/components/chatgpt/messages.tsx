'use client'

import { useState } from 'react'
import {
  Check,
  Copy,
  Pencil,
  RefreshCw,
  ThumbsDown,
  ThumbsUp,
} from 'lucide-react'
import { useToast } from '@/hooks/use-toast'
import { Markdown } from './markdown'
import { ReceiptCard } from './receipt-card'
import type { ChatMsg } from './types'

interface MessageListProps {
  messages: ChatMsg[]
  onRegenerate: () => void
  onEditUserMessage: (messageId: string, newContent: string) => void
  /** Extra gap above the latest receipt card so it can center while the
      submitted prompt stays hidden above the fold. */
  receiptGap?: number
}

function ActionButton({
  label,
  onClick,
  active,
  children,
}: {
  label: string
  onClick?: () => void
  active?: boolean
  children: React.ReactNode
}) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      title={label}
      className={`flex h-8 w-8 items-center justify-center rounded-lg hover:bg-accent ${
        active ? 'text-foreground' : 'text-muted-foreground'
      }`}
    >
      {children}
    </button>
  )
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <ActionButton
      label={copied ? 'Copied' : 'Copy'}
      onClick={() => {
        navigator.clipboard
          ?.writeText(text)
          .then(() => {
            setCopied(true)
            setTimeout(() => setCopied(false), 1500)
          })
          .catch(() => {})
      }}
    >
      {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
    </ActionButton>
  )
}

export function MessageList({ messages, onRegenerate, onEditUserMessage, receiptGap = 0 }: MessageListProps) {
  const { toast } = useToast()
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editValue, setEditValue] = useState('')
  const [liked, setLiked] = useState<Record<string, boolean>>({})
  const [disliked, setDisliked] = useState<Record<string, boolean>>({})

  const isLast = (idx: number) => idx === messages.length - 1

  return (
    <div className="flex flex-col gap-6">
      {messages.map((m, idx) =>
        m.role === 'user' ? (
          <div key={m.id} className="msg-fade-in group/user flex flex-col items-end" data-receipt-prompt>
            {editingId === m.id ? (
              <div className="w-full rounded-3xl border border-input bg-secondary px-4 py-3">
                <textarea
                  value={editValue}
                  onChange={(e) => setEditValue(e.target.value)}
                  rows={Math.min(Math.ceil(editValue.length / 60) + 1, 8)}
                  className="w-full resize-none bg-transparent text-base outline-none"
                  autoFocus
                />
                <div className="mt-2 flex justify-end gap-2">
                  <button
                    className="h-9 rounded-full border border-border px-4 text-sm hover:bg-accent"
                    onClick={() => setEditingId(null)}
                  >
                    Cancel
                  </button>
                  <button
                    className="h-9 rounded-full bg-primary px-4 text-sm font-medium text-primary-foreground hover:opacity-90"
                    onClick={() => {
                      if (editValue.trim() && editValue.trim() !== m.content) {
                        onEditUserMessage(m.id, editValue.trim())
                      }
                      setEditingId(null)
                    }}
                  >
                    Send
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex max-w-[85%] items-end gap-1 md:max-w-[75%]">
                <div className="mb-1.5 flex items-center gap-0.5 opacity-0 transition-opacity group-hover/user:opacity-100">
                  <CopyButton text={m.content} />
                  <ActionButton
                    label="Edit message"
                    onClick={() => {
                      setEditingId(m.id)
                      setEditValue(m.content)
                    }}
                  >
                    <Pencil className="size-4" />
                  </ActionButton>
                </div>
                <div className="flex flex-col items-end gap-1.5">
                  {m.imageUrl && (
                    <img
                      src={m.imageUrl}
                      alt="Attached receipt"
                      className="max-h-72 max-w-full rounded-2xl border border-border object-contain"
                    />
                  )}
                  {m.content && (
                    <div className="whitespace-pre-wrap rounded-3xl bg-secondary px-5 py-2.5 text-[15px] leading-relaxed">
                      {m.content}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        ) : (
          <div key={m.id} className="msg-fade-in group/assistant flex flex-col">
            {m.receipt && (
              <div
                className="mx-auto max-w-xl"
                data-receipt-card
                style={
                  m.receipt && isLast(idx) && receiptGap > 0
                    ? { marginTop: receiptGap }
                    : undefined
                }
              >
                <ReceiptCard receipt={m.receipt} />
              </div>
            )}
            {m.content ? (
              <div className={m.streaming ? 'is-streaming' : ''}>
                <Markdown content={m.content} />
              </div>
            ) : m.streaming ? (
              <div className="flex items-center gap-2 text-muted-foreground">
                <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-current" />
                <span className="text-sm">
                  {m.processingReceipt ? 'Processing receipt…' : 'Thinking…'}
                </span>
              </div>
            ) : (
              !m.receipt &&
              !m.error && (
                <span className="text-sm italic text-muted-foreground">(No content)</span>
              )
            )}

            {m.error && (
              <p className="text-sm text-destructive">
                Something went wrong while processing the receipt. Please try again.
              </p>
            )}

            {!m.streaming && m.content && (
              <div
                className={`mt-1 flex items-center gap-0.5 ${
                  isLast(idx) ? '' : 'opacity-0 group-hover/assistant:opacity-100'
                } transition-opacity`}
              >
                <CopyButton text={m.content} />
                <ActionButton
                  label="Good response"
                  active={liked[m.id]}
                  onClick={() => {
                    setLiked((p) => ({ ...p, [m.id]: !p[m.id] }))
                    setDisliked((p) => ({ ...p, [m.id]: false }))
                    if (!liked[m.id])
                      toast({ description: 'Thanks for the feedback!' })
                  }}
                >
                  <ThumbsUp className="size-4" />
                </ActionButton>
                <ActionButton
                  label="Bad response"
                  active={disliked[m.id]}
                  onClick={() => {
                    setDisliked((p) => ({ ...p, [m.id]: !p[m.id] }))
                    setLiked((p) => ({ ...p, [m.id]: false }))
                  }}
                >
                  <ThumbsDown className="size-4" />
                </ActionButton>
                {isLast(idx) && (
                  <ActionButton label="Try again" onClick={onRegenerate}>
                    <RefreshCw className="size-4" />
                  </ActionButton>
                )}
              </div>
            )}
          </div>
        )
      )}

    </div>
  )
}

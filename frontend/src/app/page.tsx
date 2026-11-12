'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { ArrowDown, MessageCircle, X } from 'lucide-react'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { ChatHeader } from '@/components/chatgpt/header'
import { Composer } from '@/components/chatgpt/composer'
import { ImageIntake } from '@/components/chatgpt/image-intake'
import { MessageList } from '@/components/chatgpt/messages'
import { useToast } from '@/hooks/use-toast'
import type {
  ChatMode,
  ChatMsg,
  ConversationSummary,
  ReceiptPayload,
} from '@/components/chatgpt/types'
import { isPayPalInvoice } from '@/lib/paypal-invoices'

export default function ChatGPTClone() {
  const [activeId, setActiveId] = useState<string | null>(null)
  const [messages, setMessages] = useState<ChatMsg[]>([])
  const [streaming, setStreaming] = useState(false)
  const [mode, setMode] = useState<ChatMode>(null)
  const [temporary, setTemporary] = useState(false)
  const [atBottom, setAtBottom] = useState(true)
  const [pendingImage, setPendingImage] = useState<string | null>(null)
  /** Composer visibility in the conversation view — hidden after a receipt
      response, restored from the floating chat button. */
  const [composerOpen, setComposerOpen] = useState(true)
  /** Extra gap between the submitted prompt and the receipt card so the card
      can sit centered while the prompt is fully above the fold. */
  const [responseGap, setResponseGap] = useState(0)
  /** Bumped when the composer's exit animation finishes — scroll geometry must
      only be measured against the final layout. */
  const [composerSettledTick, setComposerSettledTick] = useState(0)
  /** Live height of the composer dock so floating controls can dodge it. */
  const [dockH, setDockH] = useState(0)

  const abortRef = useRef<AbortController | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const composerDockRef = useRef<HTMLDivElement | null>(null)
  const composerRef = useRef<HTMLTextAreaElement>(null)
  const activeIdRef = useRef<string | null>(null)
  const messagesRef = useRef<ChatMsg[]>([])
  const streamingRef = useRef(false)

  const { toast } = useToast()
  const reduceMotion = useReducedMotion() === true

  /* ── derived conversation state ── */
  const lastMsg = messages[messages.length - 1]
  const receiptDone =
    !!lastMsg && lastMsg.role === 'assistant' && !!lastMsg.receipt && !lastMsg.streaming
  const receiptPending =
    !!lastMsg && lastMsg.role === 'assistant' && lastMsg.processingReceipt === true
  const chatVisible = messages.length > 0

  useEffect(() => {
    activeIdRef.current = activeId
  }, [activeId])

  useEffect(() => {
    messagesRef.current = messages
  }, [messages])

  /* Track the composer dock's height so the floating chat button and the
     scroll arrow sit clear of it — including while it animates. */
  useEffect(() => {
    const el = composerDockRef.current
    if (!el) return
    const update = () => setDockH(el.offsetHeight)
    update()
    const ro = new ResizeObserver(update)
    ro.observe(el)
    return () => ro.disconnect()
  }, [chatVisible])

  /* ── scrolling ── */
  const scrollToBottom = useCallback((smooth = false) => {
    const el = scrollRef.current
    if (!el) return
    el.scrollTo({ top: el.scrollHeight, behavior: smooth ? 'smooth' : 'auto' })
  }, [])

  const handleScroll = useCallback(() => {
    const el = scrollRef.current
    if (!el) return
    setAtBottom(el.scrollHeight - el.scrollTop - el.clientHeight < 90)
  }, [])

  /* Scroll the receipt response back to the center of the viewport. */
  const scrollToResponse = useCallback(() => {
    const sc = scrollRef.current
    const card = sc?.querySelector<HTMLElement>('[data-receipt-card]')
    if (!sc || !card) {
      scrollToBottom(true)
      return
    }
    const scRect = sc.getBoundingClientRect()
    const r = card.getBoundingClientRect()
    sc.scrollTo({
      top: Math.max(0, r.top - scRect.top + sc.scrollTop - (sc.clientHeight - r.height) / 2),
      behavior: 'smooth',
    })
  }, [scrollToBottom])

  useEffect(() => {
    // While a receipt response is the latest message, the centering effect
    // owns the scroll position — auto-scrolling to the bottom would fight it.
    if (atBottom && !receiptDone) scrollToBottom()
  }, [messages, atBottom, scrollToBottom, receiptDone])

  useEffect(() => {
    if (messages.length > 0) requestAnimationFrame(() => scrollToBottom(true))
  }, [activeId, scrollToBottom])

  /* ── streaming core ── */
  const runStream = useCallback(
    async (opts: {
      conversationId: string
      content?: string
      imageUrl?: string
      regenerate?: boolean
      historyForTemp?: ChatMsg[]
    }) => {
      const assistantId = `a-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
      setMessages((prev) => [
        ...prev,
        { id: assistantId, role: 'assistant', content: '', streaming: true },
      ])
      streamingRef.current = true
      setStreaming(true)
      setAtBottom(true)

      const controller = new AbortController()
      abortRef.current = controller
      let hadError = false
      let failureMessage: string | undefined

      try {
        const res = await fetch('/api/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            conversationId: opts.conversationId,
            content: opts.content,
            imageUrl: opts.imageUrl,
            regenerate: opts.regenerate,
            model: 'default',
            mode,
            history: opts.historyForTemp?.map((m) => ({ role: m.role, content: m.content })),
          }),
          signal: controller.signal,
        })
        if (!res.ok) {
          const failure = (await res.json().catch(() => null)) as { error?: string } | null
          throw new Error(failure?.error || 'Stream request failed')
        }
        if (!res.body) throw new Error('Stream response did not contain a body.')

        const reader = res.body.getReader()
        const decoder = new TextDecoder()
        let buffer = ''

        const handleEvent = (evt: Record<string, unknown>) => {
          const invoiceValues = evt.invoices
          if (evt.type === 'start' && typeof evt.userMessageId === 'string') {
            const realId = evt.userMessageId
            setMessages((prev) => {
              const next = [...prev]
              for (let i = next.length - 1; i >= 0; i--) {
                if (next[i].role === 'user') {
                  next[i] = { ...next[i], id: realId }
                  break
                }
              }
              return next
            })
          } else if (evt.type === 'delta' && typeof evt.content === 'string') {
            setMessages((prev) =>
              prev.map((m) =>
                m.id === assistantId ? { ...m, content: m.content + evt.content } : m
              )
            )
          } else if (
            evt.type === 'invoices' &&
            Array.isArray(invoiceValues) &&
            invoiceValues.every(isPayPalInvoice)
          ) {
            const invoices = invoiceValues
            setMessages((prev) =>
              prev.map((m) =>
                m.id === assistantId ? { ...m, invoices } : m
              )
            )
          } else if (evt.type === 'error') {
            hadError = true
            if (typeof evt.message === 'string') failureMessage = evt.message
          }
        }

        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          buffer += decoder.decode(value, { stream: true })
          const parts = buffer.split('\n\n')
          buffer = parts.pop() ?? ''
          for (const part of parts) {
            const line = part.trim()
            if (!line.startsWith('data:')) continue
            try {
              handleEvent(JSON.parse(line.slice(5)))
            } catch {
              // ignore malformed chunk
            }
          }
        }
      } catch (err) {
        const aborted = err instanceof DOMException && err.name === 'AbortError'
        if (!aborted) {
          hadError = true
          failureMessage = err instanceof Error ? err.message : 'Stream request failed'
        }
      } finally {
        abortRef.current = null
        streamingRef.current = false
        setStreaming(false)
        setMessages((prev) =>
          prev.map((m) => (m.id === assistantId ? { ...m, streaming: false } : m))
        )
        if (hadError) {
          setMessages((prev) =>
            prev.map((m) => (m.id === assistantId ? { ...m, error: true } : m))
          )
          toast({ description: failureMessage || 'Something went wrong. Please try again.' })
        }
      }
    },
    [mode, toast]
  )

  /* ── receipt processing: send image + instructions to the backend, show the payload ──
     This is the ONLY response a receipt submission gets — no chat model reply. */
  const processReceipt = useCallback(
    async (conversationId: string, imageUrl: string, text: string) => {
      const pendingId = `a-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
      setMessages((prev) => [
        ...prev,
        {
          id: pendingId,
          role: 'assistant',
          content: '',
          streaming: true,
          processingReceipt: true,
        },
      ])
      streamingRef.current = true
      setStreaming(true)
      setAtBottom(true)

      const controller = new AbortController()
      abortRef.current = controller

      try {
        const res = await fetch('/api/receipt', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ conversationId, imageUrl, text }),
          signal: controller.signal,
        })
        if (!res.ok) {
          const errBody = (await res.json().catch(() => null)) as { error?: string } | null
          throw new Error(errBody?.error || 'Receipt request failed')
        }
        const data = (await res.json()) as {
          id?: string
          userMessageId?: string
          receipt?: ReceiptPayload
        }
        if (!data.receipt) throw new Error('No payload returned')

        setMessages((prev) => {
          const next = prev.map((m) =>
            m.id === pendingId
              ? {
                  ...m,
                  id: data.id ?? m.id,
                  receipt: data.receipt,
                  streaming: false,
                  processingReceipt: false,
                }
              : m
          )
          // Swap the client-side user message id for the persisted one
          // (mirrors the SSE "start" event of the chat stream).
          if (data.userMessageId) {
            for (let i = next.length - 1; i >= 0; i--) {
              if (next[i].role === 'user' && next[i].id.startsWith('u-')) {
                next[i] = { ...next[i], id: data.userMessageId }
                break
              }
            }
          }
          return next
        })
      } catch (err) {
        const aborted = err instanceof DOMException && err.name === 'AbortError'
        setMessages((prev) =>
          aborted
            ? prev.filter((m) => m.id !== pendingId)
            : prev.map((m) =>
                m.id === pendingId
                  ? { ...m, streaming: false, processingReceipt: false, error: true }
                  : m
              )
        )
        if (aborted) {
          setComposerOpen(true)
        } else {
          toast({
            description:
              err instanceof Error && err.message
                ? err.message
                : 'Could not process the receipt. Please try again.',
          })
        }
      } finally {
        abortRef.current = null
        streamingRef.current = false
        setStreaming(false)
      }
    },
    [toast]
  )

  /* ── send ── */
  const sendMessage = useCallback(
    async (text: string, imageUrlOverride?: string) => {
      if (streamingRef.current) return
      const attachedImage = imageUrlOverride ?? pendingImage
      if (attachedImage && !imageUrlOverride) setPendingImage(null)
      const userMsg: ChatMsg = {
        id: `u-${Date.now()}`,
        role: 'user',
        content: text,
        imageUrl: attachedImage ?? undefined,
      }
      const prevMessages = messagesRef.current
      setMessages((prev) => [...prev, userMsg])
      setAtBottom(true)

      if (temporary) {
        const tempId = `temp-${Date.now()}`
        if (attachedImage) {
          // Receipt submission → backend payload only, no AI reply.
          await processReceipt(tempId, attachedImage, text)
        } else {
          await runStream({
            conversationId: tempId,
            content: text,
            historyForTemp: prevMessages,
          })
        }
        return
      }

      let convId = activeIdRef.current
      if (!convId) {
        try {
          const res = await fetch('/api/conversations', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ title: text ? text.slice(0, 40) : 'Receipt chat' }),
          })
          if (!res.ok) throw new Error('create failed')
          const conv = (await res.json()) as ConversationSummary
          convId = conv.id
          setActiveId(conv.id)
          activeIdRef.current = conv.id
        } catch {
          toast({ description: 'Could not create the conversation. Please try again.' })
          setMessages((prev) => prev.filter((m) => m.id !== userMsg.id))
          setPendingImage(attachedImage)
          return
        }
      }

      if (attachedImage) {
        // Receipt submission → backend payload only, no AI reply.
        await processReceipt(convId, attachedImage, text)
        return
      }
      await runStream({
        conversationId: convId,
        content: text,
      })
    },
    [temporary, pendingImage, runStream, processReceipt, toast]
  )

  /* ── regenerate ── */
  const regenerate = useCallback(async () => {
    if (streamingRef.current) return
    const msgs = messagesRef.current.filter((m) => m.content !== undefined)
    while (msgs.length && msgs[msgs.length - 1].role === 'assistant') msgs.pop()
    if (!msgs.length) return
    const lastUser = msgs[msgs.length - 1]
    setMessages(msgs)
    messagesRef.current = msgs

    // Receipt submissions re-query the processing backend, not the chat model.
    if (lastUser.imageUrl) {
      await processReceipt(
        temporary ? `temp-${Date.now()}` : (activeIdRef.current ?? `temp-${Date.now()}`),
        lastUser.imageUrl,
        lastUser.content
      )
      return
    }

    if (temporary) {
      await runStream({
        conversationId: `temp-${Date.now()}`,
        content: lastUser.content,
        historyForTemp: msgs.slice(0, -1),
      })
      return
    }

    const convId = activeIdRef.current
    if (!convId) return
    await runStream({ conversationId: convId, regenerate: true })
  }, [temporary, runStream, processReceipt])

  /* ── edit user message → truncate + resend ── */
  const editUserMessage = useCallback(
    async (messageId: string, newContent: string) => {
      if (streamingRef.current) return
      const idx = messagesRef.current.findIndex((m) => m.id === messageId)
      if (idx < 0) return
      const originalImage = messagesRef.current[idx].imageUrl
      const truncated = messagesRef.current.slice(0, idx)
      messagesRef.current = truncated
      setMessages(truncated)

      const isPersistedId = !messageId.startsWith('u-') && !messageId.startsWith('a-')
      if (!temporary && isPersistedId && activeIdRef.current) {
        try {
          await fetch(`/api/conversations/${activeIdRef.current}/messages`, {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ messageId }),
          })
        } catch {
          // non-fatal
        }
      }
      await sendMessage(newContent, originalImage)
    },
    [temporary, sendMessage]
  )

  /* ── conversation actions ── */

  const toggleTemporary = useCallback(() => {
    if (streamingRef.current) abortRef.current?.abort()
    setTemporary((t) => !t)
    setActiveId(null)
    activeIdRef.current = null
    setMessages([])
    setMode(null)
    setPendingImage(null)
    setComposerOpen(true)
  }, [])

  /* After the receipt response arrives, tuck the composer away — the floating
     chat button in the bottom-right corner brings it back. */
  useEffect(() => {
    if (receiptDone) setComposerOpen(false)
  }, [receiptDone])

  /* Center the receipt response in the viewport once it arrives. The submitted
     prompt ends up hidden above the fold and is revealed by scrolling up.
     Waits until the composer has unmounted so the geometry is final, first
     grows the prompt↔card gap if the viewport is too tall, then scrolls. */
  useEffect(() => {
    if (!receiptDone || composerOpen) return
    // Hold off while the composer's exit animation is still collapsing the
    // dock — measuring earlier would use mid-animation geometry. The tick
    // from onExitComplete re-runs this once the layout is final.
    const dock = composerDockRef.current
    if (dock && dock.offsetHeight > 0) return
    const sc = scrollRef.current
    const card = sc?.querySelector<HTMLElement>('[data-receipt-card]')
    if (!sc || !card) return
    const scRect = sc.getBoundingClientRect()
    const cardRect = card.getBoundingClientRect()
    const cardH = cardRect.height
    // Gap needed between prompt and card: half the free viewport space so the
    // prompt can scroll fully out of view while the card stays centered.
    const gapExtra = Math.max(0, Math.ceil((sc.clientHeight - cardH) / 2) - 24)
    if (gapExtra !== responseGap) {
      setResponseGap(gapExtra)
      return // re-run after the gap is applied
    }
    const target =
      cardRect.top - scRect.top + sc.scrollTop - (sc.clientHeight - cardH) / 2
    const reduceMotion =
      typeof window !== 'undefined' &&
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    sc.scrollTo({
      top: Math.max(0, target),
      behavior: reduceMotion ? 'auto' : 'smooth',
    })
  }, [receiptDone, composerOpen, responseGap, composerSettledTick])

  return (
    <div className="flex h-dvh overflow-hidden bg-background text-foreground">
      <main className="relative flex min-w-0 flex-1 flex-col">
        <ChatHeader temporary={temporary} onToggleTemporary={toggleTemporary} />

        {!chatVisible ? (
          /* ── Welcome screen: image-first intake, then the prompt window ── */
          <div className="flex min-h-0 flex-1 flex-col items-center justify-center overflow-y-auto px-4 pb-10">
            <div className="flex w-full max-w-3xl flex-col items-center">
              <h1 className="mb-7 text-center text-[28px] font-normal tracking-tight md:text-[32px]">
                {pendingImage
                  ? 'Who spent on what?'
                  : 'Add a receipt to get started'}
              </h1>
              {pendingImage ? (
                <div className="w-full max-w-xl">
                  <Composer
                    ref={composerRef}
                    onSend={sendMessage}
                    onStop={() => abortRef.current?.abort()}
                    streaming={streaming}
                    autoFocus
                    pendingImage={pendingImage}
                    onRemoveImage={() => setPendingImage(null)}
                  />
                </div>
              ) : (
                <ImageIntake onImage={setPendingImage} />
              )}
            </div>
          </div>
        ) : (
          /* ── Conversation view ── */
          <>
            <div
              ref={scrollRef}
              onScroll={handleScroll}
              className="scrollbar-subtle min-h-0 flex-1 overflow-y-auto"
            >
              <div
                className="mx-auto w-full max-w-3xl px-4 pb-10 pt-4"
                style={
                  receiptDone
                    ? { paddingBottom: 'max(2.5rem, calc(50dvh - 230px))' }
                    : undefined
                }
              >
                <MessageList
                  messages={messages}
                  onRegenerate={regenerate}
                  onEditUserMessage={editUserMessage}
                  receiptGap={responseGap}
                />
              </div>
            </div>

            {!atBottom && (
              <button
                onClick={() => (receiptDone ? scrollToResponse() : scrollToBottom(true))}
                className="absolute left-1/2 z-10 flex h-8 w-8 -translate-x-1/2 items-center justify-center rounded-full border border-border bg-background text-muted-foreground shadow-md hover:bg-accent"
                style={{ bottom: dockH > 0 ? dockH + 24 : 96 }}
                aria-label={receiptDone ? 'Scroll to response' : 'Scroll to bottom'}
              >
                <ArrowDown className="size-4" />
              </button>
            )}

            {/* Composer dock — a stable slot whose content slides in and out.
                The dock itself never unmounts so floating controls can always
                measure it. */}
            <div ref={composerDockRef} className="shrink-0">
              <AnimatePresence
                initial={false}
                onExitComplete={() => setComposerSettledTick((t) => t + 1)}
              >
                {(composerOpen || receiptPending) && (
                  <motion.div
                    key="composer"
                    initial={reduceMotion ? false : { height: 0, opacity: 0, y: 16 }}
                    animate={{ height: 'auto', opacity: 1, y: 0 }}
                    exit={
                      reduceMotion
                        ? { opacity: 0 }
                        : { height: 0, opacity: 0, y: 16 }
                    }
                    transition={{
                      duration: reduceMotion ? 0 : 0.32,
                      ease: [0.32, 0.72, 0, 1],
                    }}
                    className="overflow-hidden"
                  >
                    <div className="px-4">
                      <div className="mx-auto w-full max-w-3xl">
                        <Composer
                          ref={composerRef}
                          onSend={sendMessage}
                          onStop={() => abortRef.current?.abort()}
                          streaming={streaming}
                          autoFocus
                          pendingImage={pendingImage}
                          onRemoveImage={() => setPendingImage(null)}
                        />
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* Floating chat toggle: opens the composer when hidden, closes it
                when visible. Glides with the dock so it never covers it. */}
            <AnimatePresence>
              {!receiptPending && (
                <motion.button
                  key="chat-fab"
                  type="button"
                  onClick={() => setComposerOpen((open) => !open)}
                  initial={reduceMotion ? false : { opacity: 0, scale: 0.6, y: 12 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={
                    reduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.6, y: 12 }
                  }
                  transition={{ type: 'spring', stiffness: 520, damping: 32 }}
                  whileHover={{ scale: 1.06 }}
                  whileTap={{ scale: 0.94 }}
                  className="fixed z-20 flex h-12 w-12 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg transition-[right] duration-300 ease-out"
                  style={{
                    bottom: dockH + 20,
                    right:
                      dockH > 0
                        ? 'max(1.25rem, calc(50% - 24rem - 0.75rem))'
                        : '1.25rem',
                  }}
                  aria-label={composerOpen ? 'Close chat' : 'Open chat'}
                  title={composerOpen ? 'Close chat' : 'Open chat'}
                >
                  {composerOpen ? (
                    <X className="size-5" aria-hidden />
                  ) : (
                    <MessageCircle className="size-5" aria-hidden />
                  )}
                </motion.button>
              )}
            </AnimatePresence>
          </>
        )}
      </main>
    </div>
  )
}

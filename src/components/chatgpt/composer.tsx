'use client'

import {
  forwardRef,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react'
import { AudioLines, Mic, Square, X } from 'lucide-react'
import { useToast } from '@/hooks/use-toast'

interface ComposerProps {
  onSend: (text: string) => void
  onStop: () => void
  streaming: boolean
  autoFocus?: boolean
  /** Receipt attached and waiting to be sent (rendered above the input) */
  pendingImage?: string | null
  onRemoveImage?: () => void
}

export const Composer = forwardRef<HTMLTextAreaElement, ComposerProps>(function Composer(
  { onSend, onStop, streaming, autoFocus = false, pendingImage = null, onRemoveImage },
  forwardedRef
) {
  const [value, setValue] = useState('')
  const innerRef = useRef<HTMLTextAreaElement>(null)
  const { toast } = useToast()

  const setRefs = (node: HTMLTextAreaElement | null) => {
    innerRef.current = node
    if (typeof forwardedRef === 'function') forwardedRef(node)
    else if (forwardedRef) forwardedRef.current = node
  }

  const resize = useCallback(() => {
    const el = innerRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`
  }, [])

  useLayoutEffect(resize, [value, resize])

  useEffect(() => {
    if (autoFocus) innerRef.current?.focus()
  }, [autoFocus])

  const submit = () => {
    const text = value.trim()
    if (streaming) return
    if (!text && !pendingImage) return
    if (pendingImage && !text) {
      toast({
        description:
          'Add optional allocation instructions, e.g. "Alice had the pasta, Bob had drinks." Unassigned items will be assigned to you.',
      })
      return
    }
    onSend(text)
    setValue('')
    requestAnimationFrame(() => {
      const el = innerRef.current
      if (el) el.style.height = 'auto'
    })
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault()
      submit()
    }
  }

  return (
    <div className="w-full">
      <div className="composer-shadow rounded-[28px] border border-input bg-background">
        {/* Attached receipt waiting to be sent */}
        {pendingImage && (
          <div className="flex px-3.5 pt-3">
            <div className="group/img relative">
              <img
                src={pendingImage}
                alt="Attached receipt preview"
                className="h-20 w-20 rounded-xl border border-border object-cover"
              />
              <button
                onClick={onRemoveImage}
                className="absolute -right-2 -top-2 flex h-6 w-6 items-center justify-center rounded-full border border-border bg-background text-muted-foreground shadow-sm hover:bg-accent"
                aria-label="Remove receipt"
              >
                <X className="size-3.5" />
              </button>
            </div>
          </div>
        )}

        <textarea
          ref={setRefs}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={handleKeyDown}
          rows={1}
          placeholder={
            pendingImage
              ? "Who had what? e.g. Alice had pasta, Bob had drinks; unassigned items go to you"
              : 'Ask anything'
          }
          aria-label="Message SplitWise"
          className="scrollbar-subtle max-h-[200px] w-full resize-none bg-transparent px-4 pb-1 pt-3.5 text-base leading-6 outline-none placeholder:text-muted-foreground"
        />

        {/* Bottom row: send / stop / voice actions */}
        <div className="flex items-center justify-end gap-1.5 px-2.5 pb-2.5 pt-1">
          {streaming ? (
            <button
              onClick={onStop}
              className="flex h-9 w-9 items-center justify-center rounded-full bg-primary text-primary-foreground transition-opacity hover:opacity-80"
              aria-label="Stop generating"
            >
              <Square className="size-4 fill-current" />
            </button>
          ) : value.trim() ? (
            <button
              onClick={submit}
              className="flex h-9 w-9 items-center justify-center rounded-full bg-primary text-primary-foreground transition-opacity hover:opacity-80"
              aria-label="Send message"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" aria-hidden>
                <path d="M12 19V5" />
                <path d="m5 12 7-7 7 7" />
              </svg>
            </button>
          ) : (
            <>
              <button
                onClick={() => toast({ description: 'Dictation is not available in this demo.' })}
                className="flex h-9 w-9 items-center justify-center rounded-full text-muted-foreground hover:bg-accent hover:text-foreground"
                aria-label="Dictate"
              >
                <Mic className="size-5" strokeWidth={1.8} />
              </button>
              <button
                onClick={() =>
                  toast({ description: 'Voice mode is not available in this demo.' })
                }
                className="flex h-9 w-9 items-center justify-center rounded-full bg-primary text-primary-foreground transition-opacity hover:opacity-80"
                aria-label="Open voice mode"
              >
                <AudioLines className="size-5" strokeWidth={1.8} />
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
})

'use client'

import { useTheme } from 'next-themes'
import { ArrowUp, ChevronDown, Ghost, Moon, Sun } from 'lucide-react'
import { useToast } from '@/hooks/use-toast'

interface HeaderProps {
  temporary: boolean
  onToggleTemporary: () => void
}

export function ChatHeader({ temporary, onToggleTemporary }: HeaderProps) {
  const { resolvedTheme, setTheme } = useTheme()
  const { toast } = useToast()

  const isDark = resolvedTheme === 'dark'

  return (
    <header className="flex h-13 items-center justify-between gap-2 px-3 py-2 md:px-4">
      {/* Left: application wordmark, styled like the classic model trigger */}
      <div className="flex min-w-0 items-center px-1">
        <span className="flex min-w-0 cursor-default items-center gap-1 rounded-lg px-2.5 py-1.5 text-base font-medium">
          <span className="truncate">SplitWise</span>
          <ChevronDown className="size-4 shrink-0 text-muted-foreground" aria-hidden />
        </span>
      </div>

      {/* Right: temporary chat, new chat (mobile), share, theme, avatar */}
      <div className="flex items-center gap-0.5">
        {/* Temporary chat: always-active floating ghost */}
        <button
          onClick={onToggleTemporary}
          className={`flex h-9 w-9 items-center justify-center rounded-lg text-foreground transition-colors hover:bg-accent ${
            temporary ? 'bg-accent/70' : ''
          }`}
          aria-label="Temporary chat"
          aria-pressed={temporary}
          title={temporary ? 'Temporary chat: on — chats are not saved' : 'Temporary chat: off — chats are saved'}
        >
          <Ghost className="ghost-float size-5" strokeWidth={1.8} />
        </button>
        <button
          onClick={() => {
            navigator.clipboard
              ?.writeText(window.location.href)
              .then(() =>
                toast({ description: 'A read-only link to this conversation was copied.' })
              )
              .catch(() => toast({ description: 'Could not copy link.' }))
          }}
          className="hidden h-9 items-center gap-1.5 rounded-full border border-border px-3 text-sm text-muted-foreground hover:bg-accent sm:flex"
          aria-label="Share conversation"
        >
          <ArrowUp className="size-4" strokeWidth={1.8} />
          Share
        </button>

        {/* Day/night toggle: one click switches theme */}
        <button
          onClick={() => setTheme(isDark ? 'light' : 'dark')}
          className="ml-1 flex h-9 w-9 items-center justify-center rounded-full border border-border text-sm hover:bg-accent"
          aria-label="Toggle theme"
          title="Toggle theme"
        >
          <Sun className="size-4 dark:hidden" />
          <Moon className="size-4 hidden dark:block" />
        </button>
      </div>
    </header>
  )
}

'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Check,
  Ellipsis,
  Images,
  PanelLeftClose,
  Pencil,
  PencilLine,
  Search,
  SquarePen,
  Trash2,
  User,
  Video,
  X,
} from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { useToast } from '@/hooks/use-toast'
import { useIsMobile } from '@/hooks/use-mobile'
import type { ConversationSummary } from './types'

interface SidebarProps {
  open: boolean
  conversations: ConversationSummary[]
  activeId: string | null
  onNewChat: () => void
  onSelect: (id: string) => void
  onRename: (id: string, title: string) => void
  onDelete: (id: string) => void
  onOpenSearch: () => void
  onCollapse: () => void
}

/* ── date grouping (Today / Yesterday / Previous 7 Days / …) ── */
function groupByDate(conversations: ConversationSummary[]) {
  const groups: { label: string; items: ConversationSummary[] }[] = []
  const now = new Date()
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
  const day = 86_400_000
  const startOfYesterday = startOfToday - day
  const startOf7 = startOfToday - 7 * day
  const startOf30 = startOfToday - 30 * day

  const push = (label: string, item: ConversationSummary) => {
    let g = groups.find((x) => x.label === label)
    if (!g) {
      g = { label, items: [] }
      groups.push(g)
    }
    g.items.push(item)
  }

  const monthNames = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December',
  ]

  for (const c of conversations) {
    const t = new Date(c.updatedAt).getTime()
    if (t >= startOfToday) push('Today', c)
    else if (t >= startOfYesterday) push('Yesterday', c)
    else if (t >= startOf7) push('Previous 7 Days', c)
    else if (t >= startOf30) push('Previous 30 Days', c)
    else {
      const d = new Date(c.updatedAt)
      push(`${monthNames[d.getMonth()]} ${d.getFullYear()}`, c)
    }
  }
  return groups
}

export function Sidebar({
  open,
  conversations,
  activeId,
  onNewChat,
  onSelect,
  onRename,
  onDelete,
  onOpenSearch,
  onCollapse,
}: SidebarProps) {
  const groups = useMemo(() => groupByDate(conversations), [conversations])
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState('')
  const [deleteTarget, setDeleteTarget] = useState<ConversationSummary | null>(null)
  const renameInputRef = useRef<HTMLInputElement>(null)
  const isMobile = useIsMobile()
  const { toast } = useToast()

  useEffect(() => {
    if (renamingId) {
      requestAnimationFrame(() => renameInputRef.current?.focus())
    }
  }, [renamingId])

  const startRename = (c: ConversationSummary) => {
    setRenamingId(c.id)
    setRenameValue(c.title)
  }

  const commitRename = () => {
    if (renamingId && renameValue.trim()) {
      onRename(renamingId, renameValue)
    }
    setRenamingId(null)
  }

  if (!open) return null

  return (
    <aside
      aria-label="Chat history"
      className={`${
        isMobile ? 'fixed inset-y-0 left-0 z-50 w-[80vw] max-w-[320px]' : 'w-[260px] shrink-0'
      } flex h-full flex-col bg-sidebar text-sidebar-foreground`}
    >
      {/* Top row: logo + collapse */}
      <div className="flex items-center justify-between px-3 pt-3">
        <button
          className="flex h-9 w-9 items-center justify-center rounded-lg hover:bg-accent"
          aria-label="ChatGPT"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
            <path d="M22.28 9.82a5.98 5.98 0 0 0-.52-4.91 6.05 6.05 0 0 0-6.51-2.9A5.98 5.98 0 0 0 10.74.02a6.05 6.05 0 0 0-5.67 4.21 5.98 5.98 0 0 0-4 2.9 6.05 6.05 0 0 0 .75 7.07 5.98 5.98 0 0 0 .51 4.91 6.05 6.05 0 0 0 6.51 2.9A5.98 5.98 0 0 0 13.26 24a6.05 6.05 0 0 0 5.67-4.21 5.98 5.98 0 0 0 4-2.9 6.05 6.05 0 0 0-.75-7.07zm-9.02 13.16a4.48 4.48 0 0 1-2.88-1.04l.14-.08 4.79-2.77a.78.78 0 0 0 .39-.68V11.9l2.02 1.17a.07.07 0 0 1 .04.06v5.6a4.5 4.5 0 0 1-4.5 4.25zm-9.67-4.13a4.47 4.47 0 0 1-.54-3.01l.14.09 4.8 2.77a.78.78 0 0 0 .78 0l5.85-3.38v2.34a.08.08 0 0 1-.03.06l-4.83 2.79a4.5 4.5 0 0 1-6.17-1.66zM2.34 7.9a4.48 4.48 0 0 1 2.34-1.97v5.7a.77.77 0 0 0 .39.68l5.83 3.37-2.02 1.17a.08.08 0 0 1-.07 0l-4.83-2.79a4.5 4.5 0 0 1-1.64-6.16zm16.6 3.86-5.85-3.4 2.02-1.16a.08.08 0 0 1 .07 0l4.83 2.79a4.49 4.49 0 0 1-.69 8.1v-5.7a.78.78 0 0 0-.38-.63zm2.01-3.02-.14-.09-4.8-2.79a.78.78 0 0 0-.78 0L9.38 9.24V6.9a.07.07 0 0 1 .03-.06l4.83-2.79a4.5 4.5 0 0 1 6.68 4.66zm-12.64 4.15-2.02-1.16a.08.08 0 0 1-.04-.06v-5.6a4.5 4.5 0 0 1 7.38-3.45l-.14.08-4.79 2.77a.78.78 0 0 0-.39.67zm1.1-2.37 2.6-1.5 2.61 1.5v3l-2.6 1.5-2.61-1.5z" />
          </svg>
        </button>
        <button
          className="flex h-9 w-9 items-center justify-center rounded-lg hover:bg-accent"
          onClick={onCollapse}
          aria-label="Close sidebar"
        >
          <PanelLeftClose className="size-5" strokeWidth={1.8} />
        </button>
      </div>

      {/* Nav rows */}
      <nav className="mt-2 flex flex-col gap-0.5 px-3 text-sm">
        <button
          onClick={onNewChat}
          className="flex items-center gap-2.5 rounded-lg px-2 py-2 hover:bg-accent transition-colors"
        >
          <SquarePen className="size-[18px]" strokeWidth={1.8} />
          <span className="font-medium">New chat</span>
        </button>
        <button
          onClick={onOpenSearch}
          className="flex items-center gap-2.5 rounded-lg px-2 py-2 hover:bg-accent transition-colors"
        >
          <Search className="size-[18px]" strokeWidth={1.8} />
          <span className="font-medium">Search chats</span>
        </button>
        <button
          onClick={() => toast({ description: 'Library is not available in this demo.' })}
          className="flex items-center gap-2.5 rounded-lg px-2 py-2 hover:bg-accent transition-colors"
        >
          <Images className="size-[18px]" strokeWidth={1.8} />
          <span className="font-medium">Library</span>
        </button>
        <button
          onClick={() => toast({ description: 'Sora is not available in this demo.' })}
          className="hidden items-center gap-2.5 rounded-lg px-2 py-2 hover:bg-accent transition-colors md:flex"
        >
          <Video className="size-[18px]" strokeWidth={1.8} />
          <span className="font-medium">Sora</span>
        </button>
      </nav>

      {/* History */}
      <div className="scrollbar-subtle mt-4 min-h-0 flex-1 overflow-y-auto px-3 pb-2">
        {groups.length === 0 && (
          <p className="px-2 py-1 text-xs text-muted-foreground">
            No chats yet. Start a conversation to see it here.
          </p>
        )}
        {groups.map((group) => (
          <div key={group.label} className="mb-2">
            <h3 className="px-2 pb-1 pt-3 text-xs font-medium text-muted-foreground">
              {group.label}
            </h3>
            <ul className="flex flex-col gap-0.5">
              {group.items.map((c) => {
                const active = c.id === activeId
                return (
                  <li key={c.id} className="group/item relative">
                    {renamingId === c.id ? (
                      <div className="flex items-center gap-1 rounded-lg bg-accent px-2 py-1.5">
                        <input
                          ref={renameInputRef}
                          value={renameValue}
                          onChange={(e) => setRenameValue(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') commitRename()
                            if (e.key === 'Escape') setRenamingId(null)
                          }}
                          className="min-w-0 flex-1 bg-transparent text-sm outline-none"
                          aria-label="Rename chat"
                        />
                        <button
                          onClick={commitRename}
                          className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md hover:bg-black/10 dark:hover:bg-white/10"
                          aria-label="Save title"
                        >
                          <Check className="size-3.5" />
                        </button>
                        <button
                          onClick={() => setRenamingId(null)}
                          className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md hover:bg-black/10 dark:hover:bg-white/10"
                          aria-label="Cancel rename"
                        >
                          <X className="size-3.5" />
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => onSelect(c.id)}
                        className={`flex w-full items-center rounded-lg pl-2 pr-7 py-2 text-left text-sm transition-colors ${
                          active
                            ? 'bg-sidebar-accent text-sidebar-accent-foreground'
                            : 'hover:bg-sidebar-accent/60'
                        }`}
                        title={c.title}
                      >
                        <span className="truncate">{c.title}</span>
                      </button>
                    )}
                    {renamingId !== c.id && (
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <button
                            className={`absolute right-1 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-md hover:bg-black/10 dark:hover:bg-white/10 ${
                              active ? 'opacity-100' : 'opacity-0 group-hover/item:opacity-100'
                            } focus-visible:opacity-100`}
                            aria-label="Chat options"
                          >
                            <Ellipsis className="size-4" />
                          </button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="start" side="right" className="w-44">
                          <DropdownMenuItem onClick={() => startRename(c)}>
                            <Pencil className="size-4" /> Rename
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            variant="destructive"
                            onClick={() => setDeleteTarget(c)}
                          >
                            <Trash2 className="size-4" /> Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    )}
                  </li>
                )
              })}
            </ul>
          </div>
        ))}
      </div>

      {/* Bottom: upgrade + account */}
      <div className="mt-auto px-3 pb-3 pt-1">
        <button
          onClick={() =>
            toast({ description: 'Plans are not available in this demo.' })
          }
          className="flex w-full items-center gap-3 rounded-lg px-2 py-2 text-sm hover:bg-accent transition-colors"
        >
          <span className="flex h-7 w-7 items-center justify-center rounded-full border border-border">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
              <path d="M20 12v10H4V12" />
              <path d="M2 7h20v5H2z" />
              <path d="M12 22V7" />
              <path d="M12 7H7.5a2.5 2.5 0 0 1 0-5C11 2 12 7 12 7z" />
              <path d="M12 7h4.5a2.5 2.5 0 0 0 0-5C13 2 12 7 12 7z" />
            </svg>
          </span>
          <span className="flex flex-col items-start leading-tight">
            <span className="font-medium">Upgrade plan</span>
            <span className="text-xs text-muted-foreground">More access to the best models</span>
          </span>
        </button>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="flex w-full items-center gap-3 rounded-lg px-2 py-2 text-sm hover:bg-accent transition-colors">
              <span className="flex h-8 w-8 items-center justify-center overflow-hidden rounded-full bg-[#7c3aed] text-white">
                <User className="size-4" />
              </span>
              <span className="flex flex-col items-start leading-tight">
                <span className="font-medium">You</span>
                <span className="text-xs text-muted-foreground">Free</span>
              </span>
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" side="top" className="w-56">
            <DropdownMenuItem
              onClick={() => toast({ description: 'Settings are not available in this demo.' })}
            >
              <PencilLine className="size-4" /> Settings
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={() => toast({ description: 'You are not signed in — this is a demo.' })}
            >
              Log out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Delete confirmation */}
      <Dialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Delete chat?</DialogTitle>
            <DialogDescription>
              This will delete{' '}
              <span className="font-medium text-foreground">
                {deleteTarget?.title?.length
                  ? deleteTarget.title.length > 40
                    ? `${deleteTarget.title.slice(0, 40)}…`
                    : deleteTarget.title
                  : 'this chat'}
              </span>
              . This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <button
              className="h-9 rounded-full border border-border px-4 text-sm hover:bg-accent"
              onClick={() => setDeleteTarget(null)}
            >
              Cancel
            </button>
            <button
              className="h-9 rounded-full bg-destructive px-4 text-sm font-medium text-white hover:opacity-90"
              onClick={() => {
                if (deleteTarget) onDelete(deleteTarget.id)
                setDeleteTarget(null)
              }}
            >
              Delete
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

    </aside>
  )
}

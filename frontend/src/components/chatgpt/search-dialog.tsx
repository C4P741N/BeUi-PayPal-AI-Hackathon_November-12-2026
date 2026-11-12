'use client'

import { useEffect, useMemo } from 'react'
import { MessageSquare, Search } from 'lucide-react'
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command'
import type { ConversationSummary } from './types'

interface SearchDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  conversations: ConversationSummary[]
  onSelect: (id: string) => void
}

export function SearchDialog({ open, onOpenChange, conversations, onSelect }: SearchDialogProps) {
  const groups = useMemo(() => {
    const now = new Date()
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
    const day = 86_400_000
    const buckets: { label: string; items: ConversationSummary[] }[] = [
      { label: 'Today', items: [] },
      { label: 'Yesterday', items: [] },
      { label: 'Previous 7 Days', items: [] },
      { label: 'Older', items: [] },
    ]
    for (const c of conversations) {
      const t = new Date(c.updatedAt).getTime()
      if (t >= startOfToday) buckets[0].items.push(c)
      else if (t >= startOfToday - day) buckets[1].items.push(c)
      else if (t >= startOfToday - 7 * day) buckets[2].items.push(c)
      else buckets[3].items.push(c)
    }
    return buckets.filter((b) => b.items.length > 0)
  }, [conversations])

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange}>
      <div className="flex items-center gap-2 border-b px-3">
        <Search className="size-4 shrink-0 text-muted-foreground" />
        <CommandInput
          placeholder="Search chats…"
          className="border-0 focus:ring-0 focus-visible:ring-0"
        />
      </div>
      <CommandList className="max-h-[400px]">
        <CommandEmpty>No chats found.</CommandEmpty>
        {groups.map((g) => (
          <CommandGroup key={g.label} heading={g.label}>
            {g.items.map((c) => (
              <CommandItem
                key={c.id}
                value={c.title}
                onSelect={() => {
                  onSelect(c.id)
                  onOpenChange(false)
                }}
                className="flex items-center gap-2.5"
              >
                <MessageSquare className="size-4 shrink-0 text-muted-foreground" />
                <span className="truncate">{c.title}</span>
              </CommandItem>
            ))}
          </CommandGroup>
        ))}
      </CommandList>
    </CommandDialog>
  )
}

export function useSearchShortcut(onOpen: () => void) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        onOpen()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onOpen])
}

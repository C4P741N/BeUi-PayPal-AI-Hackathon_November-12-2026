/**
 * In-memory data store — Prisma replacement.
 *
 * Conversations and messages live in module-level Maps cached on globalThis,
 * so they survive dev hot reloads within one server process. Nothing is
 * persisted to disk: restarting the server starts with a clean slate, which
 * is all the demo needs (no database, no ORM, no migrations).
 */

export interface MessageRecord {
  id: string
  conversationId: string
  role: string
  content: string
  /** JSON string of the processed receipt payload (assistant messages only) */
  receiptJson: string | null
  createdAt: Date
}

export interface ConversationRecord {
  id: string
  title: string
  createdAt: Date
  updatedAt: Date
  messages: MessageRecord[]
}

interface StoreShape {
  conversations: Map<string, ConversationRecord>
}

const globalForStore = globalThis as unknown as {
  __appStore: StoreShape | undefined
}

const store: StoreShape =
  globalForStore.__appStore ?? (globalForStore.__appStore = { conversations: new Map() })

const uid = (prefix: string): string =>
  `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`

export function getConversation(id: string): ConversationRecord | undefined {
  return store.conversations.get(id)
}

export function createConversation(title = 'New chat'): ConversationRecord {
  const now = new Date()
  const conversation: ConversationRecord = {
    id: uid('conv'),
    title: title.trim().slice(0, 80) || 'New chat',
    createdAt: now,
    updatedAt: now,
    messages: [],
  }
  store.conversations.set(conversation.id, conversation)
  return conversation
}

export function renameConversation(id: string, title: string): ConversationRecord | undefined {
  const conversation = store.conversations.get(id)
  if (!conversation) return undefined
  conversation.title = title.trim().slice(0, 80) || conversation.title
  return conversation
}

export function deleteConversation(id: string): boolean {
  return store.conversations.delete(id)
}

export function getMessage(id: string): MessageRecord | undefined {
  for (const conversation of store.conversations.values()) {
    const message = conversation.messages.find((m) => m.id === id)
    if (message) return message
  }
  return undefined
}

export function createMessage(input: {
  conversationId: string
  role: 'user' | 'assistant'
  content: string
  receiptJson?: string
}): MessageRecord | undefined {
  const conversation = store.conversations.get(input.conversationId)
  if (!conversation) return undefined
  const now = new Date()
  const message: MessageRecord = {
    id: uid('msg'),
    conversationId: input.conversationId,
    role: input.role,
    content: input.content,
    receiptJson: input.receiptJson ?? null,
    createdAt: now,
  }
  conversation.messages.push(message)
  conversation.updatedAt = now
  return message
}

export function getLastMessage(
  conversationId: string,
  role?: string
): MessageRecord | undefined {
  const messages = store.conversations.get(conversationId)?.messages ?? []
  for (let i = messages.length - 1; i >= 0; i--) {
    if (!role || messages[i].role === role) return messages[i]
  }
  return undefined
}

export function deleteMessage(id: string): boolean {
  for (const conversation of store.conversations.values()) {
    const idx = conversation.messages.findIndex((m) => m.id === id)
    if (idx >= 0) {
      conversation.messages.splice(idx, 1)
      return true
    }
  }
  return false
}

/**
 * Delete a message and every message that comes after it in the conversation.
 * Used by the "edit user message" flow: the client truncates history, then
 * re-sends the edited content as a new message.
 */
export function truncateMessagesFrom(conversationId: string, messageId: string): boolean {
  const conversation = store.conversations.get(conversationId)
  if (!conversation) return false
  const idx = conversation.messages.findIndex((m) => m.id === messageId)
  if (idx < 0) return false
  conversation.messages.splice(idx)
  return true
}

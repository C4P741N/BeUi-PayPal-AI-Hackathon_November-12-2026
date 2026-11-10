export interface ConversationSummary {
  id: string
  title: string
  createdAt: string
  updatedAt: string
  messageCount?: number
}

/** One line item on a processed receipt (backend payload shape) */
export interface ReceiptItem {
  id: string
  description: string
  purchased_for: string
  quantity: number
  tax_type: 'T' | 'N'
  total_price: number
  unit_price: number
}

/** Payload returned by the receipt-processing backend */
export interface ReceiptPayload {
  date_time: string
  items: ReceiptItem[]
  subtotal: number
  tax: number
  total: number
  transaction_number: string
}

export interface ChatMsg {
  id: string
  role: 'user' | 'assistant'
  content: string
  /** Attached image as a data URL (client-side only, not persisted on reload) */
  imageUrl?: string
  /** Structured receipt breakdown returned by the processing backend */
  receipt?: ReceiptPayload
  /** True while the placeholder is waiting for the receipt-processing backend */
  processingReceipt?: boolean
  streaming?: boolean
  error?: boolean
}

export interface ConversationDetail {
  id: string
  title: string
  createdAt: string
  updatedAt: string
  messages: ChatMsg[]
}

export type ModelId = 'default' | 'thinking' | 'legacy'

export interface ModelOption {
  id: ModelId
  name: string
  tagline: string
  description?: string
  badge?: string
}

export const MODEL_OPTIONS: ModelOption[] = [
  {
    id: 'default',
    name: 'ChatGPT 5.2',
    tagline: 'Great for everyday tasks',
  },
  {
    id: 'thinking',
    name: 'ChatGPT 5.2 Thinking',
    tagline: 'Thinks longer for better answers',
  },
  {
    id: 'legacy',
    name: 'ChatGPT 4o',
    tagline: 'Legacy model for daily tasks',
  },
]

export type ChatMode =
  | 'image'
  | 'search'
  | 'research'
  | 'code'
  | 'study'
  | null

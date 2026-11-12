import { NextRequest } from 'next/server'
import { deleteConversation, getConversation, renameConversation } from '@/lib/store'
import type { ReceiptPayload } from '@/components/chatgpt/types'

export const runtime = 'nodejs'

type Params = { params: Promise<{ id: string }> }

function safeParseReceipt(json: string): ReceiptPayload | null {
  try {
    const parsed: unknown = JSON.parse(json)
    if (parsed && typeof parsed === 'object' && Array.isArray((parsed as { items?: unknown }).items)) {
      return parsed as ReceiptPayload
    }
    return null
  } catch {
    return null
  }
}

export async function GET(_req: NextRequest, { params }: Params) {
  try {
    const { id } = await params
    const conversation = getConversation(id)
    if (!conversation) {
      return Response.json({ error: 'Conversation not found' }, { status: 404 })
    }
    return Response.json({
      id: conversation.id,
      title: conversation.title,
      createdAt: conversation.createdAt,
      updatedAt: conversation.updatedAt,
      messages: conversation.messages.map((m) => ({
        id: m.id,
        role: m.role,
        content: m.content,
        receipt: m.receiptJson ? safeParseReceipt(m.receiptJson) : null,
        createdAt: m.createdAt,
      })),
    })
  } catch (error) {
    console.error('Get conversation error:', error)
    return Response.json({ error: 'Failed to load conversation' }, { status: 500 })
  }
}

export async function PATCH(req: NextRequest, { params }: Params) {
  try {
    const { id } = await params
    const body = (await req.json()) as { title?: string }
    if (!body.title || !body.title.trim()) {
      return Response.json({ error: 'title is required' }, { status: 400 })
    }
    const conversation = renameConversation(id, body.title)
    if (!conversation) {
      return Response.json({ error: 'Conversation not found' }, { status: 404 })
    }
    return Response.json(conversation)
  } catch (error) {
    console.error('Update conversation error:', error)
    return Response.json({ error: 'Failed to update conversation' }, { status: 500 })
  }
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  try {
    const { id } = await params
    if (!deleteConversation(id)) {
      return Response.json({ error: 'Conversation not found' }, { status: 404 })
    }
    return Response.json({ ok: true })
  } catch (error) {
    console.error('Delete conversation error:', error)
    return Response.json({ error: 'Failed to delete conversation' }, { status: 500 })
  }
}

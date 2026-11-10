import { NextRequest } from 'next/server'
import { db } from '@/lib/db'

export const runtime = 'nodejs'

type Params = { params: Promise<{ id: string }> }

/**
 * Deletes a message and every message that comes after it in the conversation.
 * Used by the "edit user message" flow: the client truncates history, then
 * re-sends the edited content as a new message.
 */
export async function DELETE(req: NextRequest, { params }: Params) {
  try {
    const { id } = await params
    const body = (await req.json()) as { messageId?: string }
    if (!body.messageId) {
      return Response.json({ error: 'messageId is required' }, { status: 400 })
    }

    const anchor = await db.message.findUnique({ where: { id: body.messageId } })
    if (!anchor || anchor.conversationId !== id) {
      return Response.json({ error: 'Message not found' }, { status: 404 })
    }

    await db.message.deleteMany({
      where: {
        conversationId: id,
        createdAt: { gte: anchor.createdAt },
      },
    })

    return Response.json({ ok: true })
  } catch (error) {
    console.error('Truncate messages error:', error)
    return Response.json({ error: 'Failed to truncate messages' }, { status: 500 })
  }
}

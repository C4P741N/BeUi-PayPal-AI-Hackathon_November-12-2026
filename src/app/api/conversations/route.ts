import { NextRequest } from 'next/server'
import { db } from '@/lib/db'

export const runtime = 'nodejs'

export async function GET() {
  try {
    const conversations = await db.conversation.findMany({
      orderBy: { updatedAt: 'desc' },
      include: { _count: { select: { messages: true } } },
    })
    return Response.json(
      conversations.map((c) => ({
        id: c.id,
        title: c.title,
        createdAt: c.createdAt,
        updatedAt: c.updatedAt,
        messageCount: c._count.messages,
      }))
    )
  } catch (error) {
    console.error('List conversations error:', error)
    return Response.json({ error: 'Failed to list conversations' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as { title?: string }
    const title = body.title?.trim() || 'New chat'
    const conversation = await db.conversation.create({
      data: { title: title.slice(0, 80) },
    })
    return Response.json(conversation, { status: 201 })
  } catch (error) {
    console.error('Create conversation error:', error)
    return Response.json({ error: 'Failed to create conversation' }, { status: 500 })
  }
}

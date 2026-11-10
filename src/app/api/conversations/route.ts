import { NextRequest } from 'next/server'
import { createConversation } from '@/lib/store'

export const runtime = 'nodejs'

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as { title?: string }
    const title = body.title?.trim() || 'New chat'
    const conversation = createConversation(title)
    return Response.json(conversation, { status: 201 })
  } catch (error) {
    console.error('Create conversation error:', error)
    return Response.json({ error: 'Failed to create conversation' }, { status: 500 })
  }
}

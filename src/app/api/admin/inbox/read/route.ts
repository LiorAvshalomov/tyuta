import { NextResponse } from 'next/server'
import { requireAdminFromRequest } from '@/lib/admin/requireAdminFromRequest'

function getSystemUserId(): string | null {
  const value = process.env.NEXT_PUBLIC_SYSTEM_USER_ID
  if (typeof value === 'string' && value.trim()) return value.trim()
  const fallback = process.env.SYSTEM_USER_ID
  if (typeof fallback === 'string' && fallback.trim()) return fallback.trim()
  return null
}

type Body = {
  conversation_id?: string
}

export async function POST(req: Request) {
  const auth = await requireAdminFromRequest(req)
  if (!auth.ok) return auth.response

  const systemUserId = getSystemUserId()
  if (!systemUserId) {
    return NextResponse.json({ error: 'missing SYSTEM_USER_ID (NEXT_PUBLIC_SYSTEM_USER_ID)' }, { status: 500 })
  }

  const body = (await req.json().catch(() => ({}))) as Body
  const conversationId = String(body.conversation_id ?? '').trim()
  if (!conversationId) {
    return NextResponse.json({ error: 'missing conversation_id' }, { status: 400 })
  }

  const { error } = await auth.admin
    .from('messages')
    .update({ read_at: new Date().toISOString() } as never)
    .eq('conversation_id', conversationId)
    .is('read_at', null)
    .neq('sender_id', systemUserId)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}

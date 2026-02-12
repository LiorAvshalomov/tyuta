import { NextResponse } from 'next/server'
import { requireAdminFromRequest } from '@/lib/admin/requireAdminFromRequest'

function getSystemUserId(): string | null {
  const v = process.env.NEXT_PUBLIC_SYSTEM_USER_ID
  if (typeof v === 'string' && v.trim()) return v.trim()
  const v2 = process.env.SYSTEM_USER_ID
  if (typeof v2 === 'string' && v2.trim()) return v2.trim()
  return null
}

function getParam(req: Request, key: string): string {
  const url = new URL(req.url)
  return (url.searchParams.get(key) ?? '').trim()
}

export async function GET(req: Request) {
  const auth = await requireAdminFromRequest(req)
  if (!auth.ok) return auth.response

  const systemUserId = getSystemUserId()
  if (!systemUserId) {
    return NextResponse.json({ error: 'missing SYSTEM_USER_ID (NEXT_PUBLIC_SYSTEM_USER_ID)' }, { status: 500 })
  }

  const conversationId = getParam(req, 'conversation_id')
  if (!conversationId) {
    return NextResponse.json({ error: 'missing conversation_id' }, { status: 400 })
  }

  const { data, error } = await auth.admin
    .from('messages')
    .select('id, conversation_id, sender_id, body, created_at, read_at')
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: true })
    .limit(500)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Mark user->system messages as read (admin opened the thread)
  await auth.admin
    .from('messages')
    .update({ read_at: new Date().toISOString() } as never)
    .eq('conversation_id', conversationId)
    .is('read_at', null)
    .neq('sender_id', systemUserId)

  return NextResponse.json({ messages: data ?? [] })
}

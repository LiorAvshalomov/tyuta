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
  const before = getParam(req, 'before')
  const ids = getParam(req, 'ids')
  if (!conversationId) {
    if (!ids) {
      return NextResponse.json({ error: 'missing conversation_id' }, { status: 400 })
    }
  }

  if (ids) {
    const messageIds = ids
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean)
      .slice(0, 200)

    if (messageIds.length === 0) {
      return NextResponse.json({ references: [] })
    }

    const { data, error } = await auth.admin
      .from('messages')
      .select('id, body, sender_id')
      .in('id', messageIds)

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ references: data ?? [] })
  }

  let query = auth.admin
    .from('messages')
    .select('id, conversation_id, sender_id, body, created_at, read_at, reply_to_id, deleted_at')
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: false })
    .limit(75)

  if (before) {
    query = query.lt('created_at', before)
  }

  const { data, error } = await query

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // On initial load (no cursor): mark unread as read + log admin access with has_report flag
  if (!before) {
    const { count } = await auth.admin
      .from('user_reports')
      .select('id', { count: 'exact', head: true })
      .eq('conversation_id', conversationId)
      .eq('status', 'open')

    await Promise.all([
      auth.admin
        .from('messages')
        .update({ read_at: new Date().toISOString() } as never)
        .eq('conversation_id', conversationId)
        .is('read_at', null)
        .neq('sender_id', systemUserId),
      auth.admin
        .from('admin_inbox_reads')
        .insert({ admin_id: auth.user.id, conversation_id: conversationId, has_report: (count ?? 0) > 0 }),
    ])
  }

  const messages = Array.isArray(data) ? [...data].reverse() : []
  return NextResponse.json({ messages })
}

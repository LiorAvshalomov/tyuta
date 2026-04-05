import { NextResponse } from 'next/server'
import { requireAdminFromRequest } from '@/lib/admin/requireAdminFromRequest'

function getSystemUserId(): string | null {
  const value = process.env.NEXT_PUBLIC_SYSTEM_USER_ID
  if (typeof value === 'string' && value.trim()) return value.trim()
  const fallback = process.env.SYSTEM_USER_ID
  if (typeof fallback === 'string' && fallback.trim()) return fallback.trim()
  return null
}

function getParam(req: Request, key: string): string {
  const url = new URL(req.url)
  return (url.searchParams.get(key) ?? '').trim()
}

type Body = {
  message_id?: string
  emoji?: string
}

export async function GET(req: Request) {
  const auth = await requireAdminFromRequest(req)
  if (!auth.ok) return auth.response

  const ids = getParam(req, 'message_ids')
  const messageIds = ids
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean)
    .slice(0, 200)

  if (messageIds.length === 0) {
    return NextResponse.json({ reactions: [] })
  }

  const { data, error } = await auth.admin
    .from('message_reactions')
    .select('message_id, sender_id, emoji')
    .in('message_id', messageIds)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ reactions: data ?? [] })
}

export async function POST(req: Request) {
  const auth = await requireAdminFromRequest(req)
  if (!auth.ok) return auth.response

  const systemUserId = getSystemUserId()
  if (!systemUserId) {
    return NextResponse.json({ error: 'missing SYSTEM_USER_ID (NEXT_PUBLIC_SYSTEM_USER_ID)' }, { status: 500 })
  }

  const body = (await req.json().catch(() => ({}))) as Body
  const messageId = String(body.message_id ?? '').trim()
  const emoji = String(body.emoji ?? '').trim()

  if (!messageId) {
    return NextResponse.json({ error: 'missing message_id' }, { status: 400 })
  }
  if (!emoji) {
    return NextResponse.json({ error: 'missing emoji' }, { status: 400 })
  }

  const { data: existing, error: existingError } = await auth.admin
    .from('message_reactions')
    .select('emoji')
    .eq('message_id', messageId)
    .eq('sender_id', systemUserId)
    .maybeSingle()

  if (existingError) {
    return NextResponse.json({ error: existingError.message }, { status: 500 })
  }

  if (existing?.emoji === emoji) {
    const { error } = await auth.admin
      .from('message_reactions')
      .delete()
      .eq('message_id', messageId)
      .eq('sender_id', systemUserId)

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ ok: true, action: 'removed' })
  }

  const { error } = await auth.admin
    .from('message_reactions')
    .upsert({ message_id: messageId, sender_id: systemUserId, emoji } as never, { onConflict: 'message_id,sender_id' })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true, action: existing ? 'replaced' : 'added' })
}

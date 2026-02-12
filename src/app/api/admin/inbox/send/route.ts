import { NextResponse } from 'next/server'
import { requireAdminFromRequest } from '@/lib/admin/requireAdminFromRequest'

function getSystemUserId(): string | null {
  const v = process.env.NEXT_PUBLIC_SYSTEM_USER_ID
  if (typeof v === 'string' && v.trim()) return v.trim()
  const v2 = process.env.SYSTEM_USER_ID
  if (typeof v2 === 'string' && v2.trim()) return v2.trim()
  return null
}

type Body = {
  conversation_id?: string
  body?: string
}

export async function POST(req: Request) {
  const auth = await requireAdminFromRequest(req)
  if (!auth.ok) return auth.response

  const systemUserId = getSystemUserId()
  if (!systemUserId) {
    return NextResponse.json({ error: 'missing SYSTEM_USER_ID (NEXT_PUBLIC_SYSTEM_USER_ID)' }, { status: 500 })
  }

  const b = (await req.json().catch(() => ({}))) as Body
  const conversationId = String(b.conversation_id ?? '').trim()
  const text = String(b.body ?? '').trim()

  if (!conversationId) return NextResponse.json({ error: 'missing conversation_id' }, { status: 400 })
  if (text.length < 1) return NextResponse.json({ error: 'missing body' }, { status: 400 })

  // Ensure system is member of the conversation
  const { data: cm, error: cmErr } = await auth.admin
    .from('conversation_members')
    .select('conversation_id')
    .eq('conversation_id', conversationId)
    .eq('user_id', systemUserId)
    .maybeSingle()

  if (cmErr) return NextResponse.json({ error: cmErr.message }, { status: 500 })
  if (!cm) return NextResponse.json({ error: 'system user is not a member of this conversation' }, { status: 403 })

  const { data, error } = await auth.admin
    .from('messages')
    .insert({ conversation_id: conversationId, sender_id: systemUserId, body: text } as never)
    .select('id')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true, id: data?.id ?? null })
}

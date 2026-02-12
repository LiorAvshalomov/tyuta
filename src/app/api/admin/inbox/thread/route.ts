import { NextResponse } from 'next/server'
import { requireAdminFromRequest } from '@/lib/admin/requireAdminFromRequest'

function getSystemUserId(): string | null {
  const v = process.env.NEXT_PUBLIC_SYSTEM_USER_ID
  if (typeof v === 'string' && v.trim()) return v.trim()
  const v2 = process.env.SYSTEM_USER_ID
  if (typeof v2 === 'string' && v2.trim()) return v2.trim()
  return null
}

type Body = { user_id?: string }

export async function POST(req: Request) {
  const auth = await requireAdminFromRequest(req)
  if (!auth.ok) return auth.response

  const systemUserId = getSystemUserId()
  if (!systemUserId) {
    return NextResponse.json({ error: 'missing SYSTEM_USER_ID (NEXT_PUBLIC_SYSTEM_USER_ID)' }, { status: 500 })
  }

  const body = (await req.json().catch(() => ({}))) as Body
  const userId = String(body.user_id ?? '').trim()
  if (!userId) {
    return NextResponse.json({ error: 'missing user_id' }, { status: 400 })
  }
  if (userId === systemUserId) {
    return NextResponse.json({ error: 'cannot open thread with system user' }, { status: 400 })
  }

  // Find existing conversation between system and user (1:1)
  const { data: a, error: aErr } = await auth.admin
    .from('conversation_members')
    .select('conversation_id')
    .eq('user_id', systemUserId)
    .limit(500)

  if (aErr) return NextResponse.json({ error: aErr.message }, { status: 500 })

  const { data: b, error: bErr } = await auth.admin
    .from('conversation_members')
    .select('conversation_id')
    .eq('user_id', userId)
    .limit(500)

  if (bErr) return NextResponse.json({ error: bErr.message }, { status: 500 })

  const setA = new Set((a ?? []).map((r) => String((r as any).conversation_id)).filter(Boolean))
  const common = (b ?? [])
    .map((r) => String((r as any).conversation_id))
    .filter((cid) => cid && setA.has(cid))

  if (common.length > 0) {
    return NextResponse.json({ conversation_id: common[0] })
  }

  // Create new conversation + add 2 members
  const { data: conv, error: cErr } = await auth.admin.from('conversations').insert({} as never).select('id').single()
  if (cErr || !conv?.id) return NextResponse.json({ error: cErr?.message ?? 'failed to create conversation' }, { status: 500 })

  const conversationId = String((conv as any).id)

  const { error: mErr } = await auth.admin.from('conversation_members').insert([
    { conversation_id: conversationId, user_id: systemUserId },
    { conversation_id: conversationId, user_id: userId },
  ] as never)
  if (mErr) return NextResponse.json({ error: mErr.message }, { status: 500 })

  return NextResponse.json({ conversation_id: conversationId })
}

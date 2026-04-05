import { NextResponse } from 'next/server'
import { requireAdminFromRequest } from '@/lib/admin/requireAdminFromRequest'
import { rateLimit } from '@/lib/rateLimit'

const MAX_BROADCAST_USERS = 5000

function getSystemUserId(): string | null {
  const v = process.env.NEXT_PUBLIC_SYSTEM_USER_ID
  if (typeof v === 'string' && v.trim()) return v.trim()
  const v2 = process.env.SYSTEM_USER_ID
  if (typeof v2 === 'string' && v2.trim()) return v2.trim()
  return null
}

type ProfileRow = { id: string }
type MemberRow = { conversation_id: string; user_id: string }
type ConvRow = { id: string }

export async function POST(req: Request) {
  const auth = await requireAdminFromRequest(req)
  if (!auth.ok) return auth.response

  const systemUserId = getSystemUserId()
  if (!systemUserId) {
    return NextResponse.json({ error: 'missing SYSTEM_USER_ID (NEXT_PUBLIC_SYSTEM_USER_ID)' }, { status: 500 })
  }

  // Rate limit: 2 broadcasts per 10 minutes per admin
  const rl = await rateLimit(`admin_inbox_broadcast:${auth.user.id}`, { maxRequests: 2, windowMs: 600_000 })
  if (!rl.allowed) {
    return NextResponse.json({ error: 'rate limit exceeded - please try again in a few minutes' }, { status: 429 })
  }

  const b = (await req.json().catch(() => ({}))) as { body?: string }
  const text = String(b.body ?? '').trim()
  if (text.length < 1) return NextResponse.json({ error: 'missing body' }, { status: 400 })
  if (text.length > 4000) return NextResponse.json({ error: 'body too long (max 4000 chars)' }, { status: 400 })

  // 1. Get all user IDs (excluding system user)
  const { data: profiles, error: pErr } = await auth.admin
    .from('profiles')
    .select('id')
    .neq('id', systemUserId)
    .limit(MAX_BROADCAST_USERS)

  if (pErr) return NextResponse.json({ error: pErr.message }, { status: 500 })
  const allUserIds = ((profiles ?? []) as ProfileRow[]).map((p) => p.id)
  if (allUserIds.length === 0) return NextResponse.json({ ok: true, sent: 0 })

  // 2. Get all conversations the system user is already in
  const { data: sysMemberRows, error: smErr } = await auth.admin
    .from('conversation_members')
    .select('conversation_id')
    .eq('user_id', systemUserId)

  if (smErr) return NextResponse.json({ error: smErr.message }, { status: 500 })
  const sysConvIds = ((sysMemberRows ?? []) as MemberRow[]).map((r) => r.conversation_id)

  // 3. Map user_id to an existing conversation_id with the system user
  const userToConvId = new Map<string, string>()
  if (sysConvIds.length > 0) {
    const { data: otherMembers, error: omErr } = await auth.admin
      .from('conversation_members')
      .select('conversation_id, user_id')
      .in('conversation_id', sysConvIds)
      .neq('user_id', systemUserId)

    if (omErr) return NextResponse.json({ error: omErr.message }, { status: 500 })
    for (const row of (otherMembers ?? []) as MemberRow[]) {
      if (!userToConvId.has(row.user_id)) {
        userToConvId.set(row.user_id, row.conversation_id)
      }
    }
  }

  // 4. Create conversations for users who do not have one yet
  const usersWithoutConv = allUserIds.filter((uid) => !userToConvId.has(uid))
  if (usersWithoutConv.length > 0) {
    const { data: newConvs, error: ncErr } = await auth.admin
      .from('conversations')
      .insert(usersWithoutConv.map(() => ({} as never)))
      .select('id')

    if (ncErr || !newConvs) {
      return NextResponse.json({ error: ncErr?.message ?? 'failed to create conversations' }, { status: 500 })
    }

    const newConvList = newConvs as ConvRow[]
    const memberInserts: Array<{ conversation_id: string; user_id: string }> = []

    usersWithoutConv.forEach((userId, i) => {
      const convId = newConvList[i]?.id
      if (!convId) return
      userToConvId.set(userId, convId)
      memberInserts.push({ conversation_id: convId, user_id: systemUserId })
      memberInserts.push({ conversation_id: convId, user_id: userId })
    })

    if (memberInserts.length > 0) {
      const { error: miErr } = await auth.admin
        .from('conversation_members')
        .insert(memberInserts as never)
      if (miErr) return NextResponse.json({ error: miErr.message }, { status: 500 })
    }
  }

  // 5. Bulk insert messages into every conversation
  const seen = new Set<string>()
  const messageInserts = allUserIds
    .map((uid) => userToConvId.get(uid))
    .filter((cid): cid is string => {
      if (typeof cid !== 'string' || seen.has(cid)) return false
      seen.add(cid)
      return true
    })
    .map((convId) => ({ conversation_id: convId, sender_id: systemUserId, body: text }))

  if (messageInserts.length === 0) return NextResponse.json({ ok: true, sent: 0 })

  const { error: msgErr } = await auth.admin
    .from('messages')
    .insert(messageInserts as never)

  if (msgErr) return NextResponse.json({ error: msgErr.message }, { status: 500 })

  return NextResponse.json({ ok: true, sent: messageInserts.length })
}

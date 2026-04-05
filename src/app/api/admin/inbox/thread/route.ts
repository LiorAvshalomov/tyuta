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

type Thread = {
  conversation_id: string
  other_user_id: string
  other_username: string
  other_display_name: string | null
  other_avatar_url: string | null
  last_body: string | null
  last_created_at: string | null
  unread_count: number
}

function getQueryParam(req: Request, key: string): string {
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

  const conversationId = getQueryParam(req, 'conversation_id')
  if (!conversationId) {
    return NextResponse.json({ error: 'missing conversation_id' }, { status: 400 })
  }

  const { data: members, error: membersError } = await auth.admin
    .from('conversation_members')
    .select('conversation_id, user_id')
    .eq('conversation_id', conversationId)

  if (membersError) {
    return NextResponse.json({ error: membersError.message }, { status: 500 })
  }

  const memberRows = (members ?? []) as Array<{ conversation_id: string; user_id: string }>
  const hasSystemUser = memberRows.some((row) => row.user_id === systemUserId)
  if (!hasSystemUser) {
    return NextResponse.json({ error: 'system user is not a member of this conversation' }, { status: 403 })
  }

  const otherUserId = memberRows.find((row) => row.user_id !== systemUserId)?.user_id ?? null
  if (!otherUserId) {
    return NextResponse.json({ error: 'could not resolve other conversation member' }, { status: 404 })
  }

  const [{ data: profile, error: profileError }, { data: lastMessage, error: lastMessageError }, { data: unreadRows, error: unreadError }] = await Promise.all([
    auth.admin
      .from('profiles')
      .select('id, username, display_name, avatar_url')
      .eq('id', otherUserId)
      .maybeSingle(),
    auth.admin
      .from('messages')
      .select('conversation_id, body, created_at')
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
    auth.admin
      .from('messages')
      .select('conversation_id')
      .eq('conversation_id', conversationId)
      .is('read_at', null)
      .neq('sender_id', systemUserId)
      .limit(500),
  ])

  if (profileError) {
    return NextResponse.json({ error: profileError.message }, { status: 500 })
  }
  if (lastMessageError) {
    return NextResponse.json({ error: lastMessageError.message }, { status: 500 })
  }
  if (unreadError) {
    return NextResponse.json({ error: unreadError.message }, { status: 500 })
  }
  if (!profile) {
    return NextResponse.json({ error: 'profile not found' }, { status: 404 })
  }

  const thread: Thread = {
    conversation_id: conversationId,
    other_user_id: otherUserId,
    other_username: String(profile.username ?? ''),
    other_display_name: profile.display_name ?? null,
    other_avatar_url: profile.avatar_url ?? null,
    last_body: lastMessage?.body ?? null,
    last_created_at: lastMessage?.created_at ?? null,
    unread_count: Array.isArray(unreadRows) ? unreadRows.length : 0,
  }

  return NextResponse.json({ thread })
}

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

  type MemberRow = { conversation_id: string }
  const setA = new Set(((a ?? []) as MemberRow[]).map((r) => String(r.conversation_id)).filter(Boolean))
  const common = ((b ?? []) as MemberRow[])
    .map((r) => String(r.conversation_id))
    .filter((cid) => cid && setA.has(cid))

  if (common.length > 0) {
    return NextResponse.json({ conversation_id: common[0] })
  }

  // Create new conversation + add 2 members
  const { data: conv, error: cErr } = await auth.admin.from('conversations').insert({} as never).select('id').single()
  if (cErr || !conv?.id) return NextResponse.json({ error: cErr?.message ?? 'failed to create conversation' }, { status: 500 })

  const conversationId = String((conv as { id: string }).id)

  const { error: mErr } = await auth.admin.from('conversation_members').insert([
    { conversation_id: conversationId, user_id: systemUserId },
    { conversation_id: conversationId, user_id: userId },
  ] as never)
  if (mErr) return NextResponse.json({ error: mErr.message }, { status: 500 })

  return NextResponse.json({ conversation_id: conversationId })
}

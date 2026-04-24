import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requireUserFromRequest } from '@/lib/auth/requireUserFromRequest'
import { sendTelegramMessage, escapeHtml } from '@/lib/telegram'

const MAX_BODY = 4000

function getSystemUserId(): string | null {
  const v = process.env.NEXT_PUBLIC_SYSTEM_USER_ID
  if (typeof v === 'string' && v.trim()) return v.trim()
  const v2 = process.env.SYSTEM_USER_ID
  if (typeof v2 === 'string' && v2.trim()) return v2.trim()
  return null
}

export async function POST(req: Request) {
  const auth = await requireUserFromRequest(req)
  if (!auth.ok) return auth.response

  let conversationId: string, body: string, replyToId: string | null
  try {
    const parsed = await req.json()
    conversationId = String(parsed.conversation_id ?? '').trim()
    body = String(parsed.body ?? '').trim()
    replyToId = parsed.reply_to_id ? String(parsed.reply_to_id) : null
  } catch {
    return NextResponse.json({ error: 'invalid request body' }, { status: 400 })
  }

  if (!conversationId) return NextResponse.json({ error: 'missing conversation_id' }, { status: 400 })
  if (!body)           return NextResponse.json({ error: 'missing body' }, { status: 400 })
  if (body.length > MAX_BODY) {
    return NextResponse.json({ error: `הודעה ארוכה מדי (מקסימום ${MAX_BODY} תווים)` }, { status: 400 })
  }

  // RLS enforced — the user-scoped client validates membership before inserting
  const { data: messageId, error } = await auth.supabase.rpc('send_message', {
    p_conversation_id: conversationId,
    p_body: body,
    p_reply_to_id: replyToId,
  })

  if (error || !messageId) {
    return NextResponse.json({ error: error?.message ?? 'failed to send' }, { status: 400 })
  }

  void notifyTelegram(auth.user.id, conversationId, body)

  return NextResponse.json({ message_id: messageId as string })
}

async function notifyTelegram(senderId: string, conversationId: string, body: string): Promise<void> {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
    if (!supabaseUrl || !serviceKey) return

    const svc = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } })

    // Only notify for conversations that include the system user
    const systemUserId = getSystemUserId()
    if (systemUserId) {
      const { data: members } = await svc
        .from('conversation_members')
        .select('user_id')
        .eq('conversation_id', conversationId)
      const ids = ((members ?? []) as { user_id: string }[]).map(m => m.user_id)
      if (!ids.includes(systemUserId)) return
    }

    const { data: profile } = await svc
      .from('profiles')
      .select('display_name, username')
      .eq('id', senderId)
      .maybeSingle()

    const p = profile as { display_name: string | null; username: string | null } | null
    const displayName = escapeHtml(p?.display_name ?? '')
    const username    = escapeHtml(p?.username ?? '')
    const fromStr = displayName
      ? `${displayName}${username ? ` (@${username})` : ''}`
      : username ? `@${username}` : senderId.slice(0, 8)

    const PREVIEW = 800
    const escaped = escapeHtml(body)
    const msgBody = escaped.length > PREVIEW
      ? escaped.slice(0, PREVIEW) + `\n<i>… (${escaped.length - PREVIEW} תווים נוספים)</i>`
      : escaped

    await sendTelegramMessage(
      [
        '💬 <b>הודעה חדשה – Inbox</b>',
        '',
        `👤 <b>מאת:</b> ${fromStr}`,
        '',
        msgBody,
      ].join('\n'),
    )
  } catch {
    // never throw from notification
  }
}

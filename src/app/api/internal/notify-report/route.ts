import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requireUserFromRequest } from '@/lib/auth/requireUserFromRequest'
import { rateLimit } from '@/lib/rateLimit'
import { buildRateLimitResponse } from '@/lib/requestRateLimit'
import { sendTelegramMessage, escapeHtml } from '@/lib/telegram'

type Body = {
  type: 'inbox_message' | 'post' | 'comment'
  reported_user_id: string
  category?: string | null
  reason_code?: string | null
  details?: string | null
  message_excerpt?: string | null
  conversation_id?: string | null
}

const TYPE_LABEL: Record<string, string> = {
  inbox_message: '💬 דיווח על הודעה באינבוקס',
  post: '📄 דיווח על פוסט',
  comment: '💭 דיווח על תגובה',
}

const REASON_LABEL: Record<string, string> = {
  abusive_language: 'שפה פוגענית / הקנטה',
  spam_promo: 'ספאם / פרסום',
  hate_incitement: 'שנאה / הסתה',
  privacy_exposure: 'חשיפת מידע אישי',
  other: 'אחר',
}

function fmtProfile(display_name: string | null, username: string | null, id: string) {
  // display_name and username come from the DB (service role), not from the request body —
  // still escape defensively in case a user set a crafted display name.
  const name = escapeHtml(display_name || username || id.slice(0, 8))
  const sub = username ? ` (@${escapeHtml(username)})` : ''
  return `${name}${sub}`
}

export async function POST(req: NextRequest) {
  // Auth gate — must be a logged-in user.
  const gate = await requireUserFromRequest(req)
  if (!gate.ok) return gate.response

  // Rate limit: 10 reports per user per 10 minutes to prevent Telegram flood.
  const rl = await rateLimit(`notify-report:${gate.user.id}`, { maxRequests: 10, windowMs: 10 * 60_000 })
  if (!rl.allowed) {
    return buildRateLimitResponse('יותר מדי דיווחים. נסו שוב בעוד כמה דקות.', rl.retryAfterMs)
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!supabaseUrl || !serviceRole) {
    return NextResponse.json({ ok: true }) // silent fail — notification only
  }

  let body: Body
  try {
    body = (await req.json()) as Body
  } catch {
    return NextResponse.json({ ok: true })
  }

  // Use the authenticated user's ID as the reporter — never trust the request body for this.
  const reporterId = gate.user.id

  // Fire-and-forget — notification failure must never affect the caller.
  void (async () => {
    try {
      const service = createClient(supabaseUrl, serviceRole, { auth: { persistSession: false } })

      const ids = Array.from(new Set([reporterId, body.reported_user_id].filter(Boolean)))
      const { data: profiles } = await service
        .from('profiles')
        .select('id, display_name, username')
        .in('id', ids)

      type P = { id: string; display_name: string | null; username: string | null }
      const pm = new Map((profiles ?? []).map((p: P) => [p.id, p]))

      const reporter = pm.get(reporterId)
      const reported = pm.get(body.reported_user_id)

      const typeLabel = TYPE_LABEL[body.type] ?? '🚩 דיווח'
      // reason_code is used as a lookup key only; fallback shown escaped.
      const reasonLabel = body.reason_code
        ? (REASON_LABEL[body.reason_code] ?? escapeHtml(body.reason_code))
        : null

      const lines = [
        '🚨 <b>התראה חדשה – Tyuta</b>',
        '',
        typeLabel,
        `👤 <b>מדווח:</b> ${reporter ? fmtProfile(reporter.display_name, reporter.username, reporter.id) : reporterId.slice(0, 8)}`,
        `⚠️ <b>על:</b> ${reported ? fmtProfile(reported.display_name, reported.username, reported.id) : escapeHtml(body.reported_user_id).slice(0, 8)}`,
        reasonLabel ? `📌 <b>סיבה:</b> ${reasonLabel}` : null,
        body.category ? `🏷️ <b>קטגוריה:</b> ${escapeHtml(body.category)}` : null,
        body.message_excerpt
          ? `\n💬 <b>תוכן:</b>\n${escapeHtml(body.message_excerpt.slice(0, 400))}`
          : null,
      ].filter(Boolean).join('\n')

      await sendTelegramMessage(lines)
    } catch {
      // ignore — notification errors must not surface to the caller
    }
  })()

  return NextResponse.json({ ok: true })
}

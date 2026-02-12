import { NextResponse } from 'next/server'
import { requireAdminFromRequest } from '@/lib/admin/requireAdminFromRequest'

type Body = {
  user_id?: string
  is_banned?: boolean
  reason?: string | null
}

export async function POST(req: Request) {
  const auth = await requireAdminFromRequest(req)
  if (!auth.ok) return auth.response

  let body: Body = {}
  try {
    body = (await req.json()) as Body
  } catch {
    return NextResponse.json({ ok: false, error: 'invalid JSON' }, { status: 400 })
  }

  const userId = (body.user_id ?? '').trim()
  const isBanned = body.is_banned === true
  const reason = body.reason ?? null

  if (!userId) {
    return NextResponse.json({ ok: false, error: 'missing user_id' }, { status: 400 })
  }

  const nowIso = new Date().toISOString()

  const { error: upErr } = await auth.admin
    .from('user_moderation')
    .upsert(
      {
        user_id: userId,
        is_banned: isBanned,
        ban_reason: reason,
        banned_at: isBanned ? nowIso : null,
        banned_by: isBanned ? auth.user.id : null,
        // Banned is exclusive: clear any suspended state when banning.
        is_suspended: isBanned ? false : undefined,
        suspended_at: isBanned ? null : undefined,
        suspended_by: isBanned ? null : undefined,
        reason: isBanned ? null : undefined,
        updated_at: nowIso,
      } as never,
      { onConflict: 'user_id' }
    )

  if (upErr) {
    return NextResponse.json({ ok: false, error: upErr.message }, { status: 500 })
  }

  // Best-effort audit log
  await auth.admin.from('user_moderation_events').insert({
    user_id: userId,
    actor_id: auth.user.id,
    action: isBanned ? 'ban' : 'unban',
    reason: reason,
    created_at: nowIso,
  } as never)

  return NextResponse.json({ ok: true })
}

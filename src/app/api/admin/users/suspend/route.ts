import { NextResponse } from 'next/server'
import { requireAdminFromRequest } from '@/lib/admin/requireAdminFromRequest'

type Body = {
  user_id?: string
  is_suspended?: boolean
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
  const isSuspended = body.is_suspended === true
  const reason = (body.reason ?? null)

  if (!userId) {
    return NextResponse.json({ ok: false, error: 'missing user_id' }, { status: 400 })
  }

  const nowIso = new Date().toISOString()

  const { error: upErr } = await auth.admin
    .from('user_moderation')
    .upsert(
      {
        user_id: userId,
        is_suspended: isSuspended,
        reason: reason,
        suspended_at: isSuspended ? nowIso : null,
        suspended_by: isSuspended ? auth.user.id : null,
        is_banned: isSuspended ? false : undefined,
        ban_reason: isSuspended ? null : undefined,
        banned_at: isSuspended ? null : undefined,
        banned_by: isSuspended ? null : undefined,
        updated_at: nowIso,
      },
      { onConflict: 'user_id' }
    )

  if (upErr) {
    return NextResponse.json({ ok: false, error: upErr.message }, { status: 500 })
  }

  // Best-effort audit log (won't fail request if table doesn't exist yet)
  await auth.admin.from('user_moderation_events').insert({
    user_id: userId,
    actor_id: auth.user.id,
    action: isSuspended ? 'suspend' : 'unsuspend',
    reason: reason,
    created_at: nowIso,
  })

  return NextResponse.json({ ok: true })
}

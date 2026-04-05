import { NextResponse } from 'next/server'
import { requireAdminFromRequest } from '@/lib/admin/requireAdminFromRequest'
import {
  fetchUserProfileSnapshot,
  logUserModerationAction,
} from '@/lib/admin/logUserModerationAction'

type Body = {
  user_id?: string
  is_banned?: boolean
  reason?: string | null
}

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

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
  if (!UUID_REGEX.test(userId)) {
    return NextResponse.json({ error: 'INVALID_ID' }, { status: 400 })
  }

  try {
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
      if (upErr.code === '22P02' || upErr.code === '23503') {
        return NextResponse.json({ error: 'INVALID_ID' }, { status: 422 })
      }
      return NextResponse.json({ error: 'BAN_UPSERT_FAILED' }, { status: 500 })
    }

    // Best-effort audit log
    await auth.admin.from('user_moderation_events').insert({
      user_id: userId,
      actor_id: auth.user.id,
      action: isBanned ? 'ban' : 'unban',
      reason: reason,
      created_at: nowIso,
    } as never)

    const targetProfile = await fetchUserProfileSnapshot(auth.admin, userId)
    await logUserModerationAction({
      admin: auth.admin,
      actorId: auth.user.id,
      targetUserId: userId,
      action: isBanned ? 'user_ban' : 'user_unban',
      reason,
      metadata: {
        source: 'admin_users',
        target_profile: targetProfile,
        is_banned: isBanned,
      },
    })

    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ error: 'BAN_UPSERT_FAILED' }, { status: 500 })
  }
}

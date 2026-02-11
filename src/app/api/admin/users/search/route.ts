import { NextResponse } from 'next/server'
import { requireAdminFromRequest } from '@/lib/admin/requireAdminFromRequest'

export async function GET(req: Request) {
  const auth = await requireAdminFromRequest(req)
  if (!auth.ok) return auth.response

  const url = new URL(req.url)
  const q = (url.searchParams.get('q') ?? '').trim()

  if (q.length < 2) {
    return NextResponse.json({ ok: true, users: [] })
  }

  // Basic search in profiles by username or display_name
  const { data: profiles, error } = await auth.admin
    .from('profiles')
    .select('id, username, display_name, avatar_url, created_at')
    .or(`username.ilike.%${q}%,display_name.ilike.%${q}%`)
    .order('created_at', { ascending: false })
    .limit(25)

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  }

  const ids = (profiles ?? []).map((p) => p.id)

  let statusById = new Map<string, { is_suspended: boolean; reason: string | null; suspended_at: string | null; is_banned: boolean; ban_reason: string | null; banned_at: string | null }>()
  if (ids.length > 0) {
    const { data: mods } = await auth.admin
      .from('user_moderation')
      .select('user_id, is_suspended, reason, suspended_at, is_banned, ban_reason, banned_at')
      .in('user_id', ids)

    ;(mods ?? []).forEach((m) => {
      statusById.set(m.user_id as string, {
        is_suspended: Boolean(m.is_suspended),
        reason: (m.reason as string | null) ?? null,
        suspended_at: (m.suspended_at as string | null) ?? null,
        is_banned: Boolean((m as any).is_banned),
        ban_reason: ((m as any).ban_reason as string | null) ?? null,
        banned_at: ((m as any).banned_at as string | null) ?? null,
      })
    })
  }

  const users = (profiles ?? []).map((p) => {
    const s = statusById.get(p.id)
    return {
      id: p.id,
      username: p.username,
      display_name: p.display_name,
      avatar_url: p.avatar_url,
      created_at: p.created_at,
      moderation: s
        ? {
            is_suspended: s.is_suspended,
            reason: s.reason,
            suspended_at: s.suspended_at,
            is_banned: s.is_banned,
            ban_reason: s.ban_reason,
            banned_at: s.banned_at,
          }
        : { is_suspended: false, reason: null, suspended_at: null, is_banned: false, ban_reason: null, banned_at: null },
    }
  })

  return NextResponse.json({ ok: true, users })
}

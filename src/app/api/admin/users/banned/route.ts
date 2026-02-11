import { NextResponse } from 'next/server'
import { requireAdminFromRequest } from '@/lib/admin/requireAdminFromRequest'

export async function GET(req: Request) {
  const auth = await requireAdminFromRequest(req)
  if (!auth.ok) return auth.response

  const url = new URL(req.url)
  const limit = Math.min(Math.max(parseInt(url.searchParams.get('limit') ?? '50', 10) || 50, 1), 200)

  const { data: mods, error: mErr } = await auth.admin
    .from('user_moderation')
    .select('user_id, is_banned, ban_reason, banned_at, banned_by, is_suspended, reason, suspended_at, suspended_by')
    .eq('is_banned', true)
    .order('banned_at', { ascending: false })
    .limit(limit)

  if (mErr) {
    return NextResponse.json({ ok: false, error: mErr.message }, { status: 500 })
  }

  const ids = (mods ?? []).map((m) => m.user_id as string).filter(Boolean)
  if (ids.length === 0) return NextResponse.json({ ok: true, users: [] })

  const { data: profiles, error: pErr } = await auth.admin
    .from('profiles')
    .select('id, username, display_name, avatar_url, created_at')
    .in('id', ids)

  if (pErr) {
    return NextResponse.json({ ok: false, error: pErr.message }, { status: 500 })
  }

  const modById = new Map<string, any>()
  ;(mods ?? []).forEach((m) => modById.set(m.user_id as string, m))

  const users = (profiles ?? []).map((p) => {
    const m = modById.get(p.id)
    return {
      id: p.id,
      username: p.username,
      display_name: p.display_name,
      avatar_url: p.avatar_url,
      created_at: p.created_at,
      moderation: {
        is_suspended: Boolean(m?.is_suspended),
        reason: (m?.reason as string | null) ?? null,
        suspended_at: (m?.suspended_at as string | null) ?? null,
        suspended_by: (m?.suspended_by as string | null) ?? null,
        is_banned: true,
        ban_reason: (m?.ban_reason as string | null) ?? null,
        banned_at: (m?.banned_at as string | null) ?? null,
        banned_by: (m?.banned_by as string | null) ?? null,
      },
    }
  })

  users.sort((a, b) => {
    const at = new Date((a.moderation as any).banned_at ?? 0).getTime()
    const bt = new Date((b.moderation as any).banned_at ?? 0).getTime()
    return bt - at
  })

  return NextResponse.json({ ok: true, users })
}

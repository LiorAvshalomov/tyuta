import { NextResponse } from 'next/server'
import { requireAdminFromRequest } from '@/lib/admin/requireAdminFromRequest'

type Body = {
  user_id?: string
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
  const reason = body.reason ?? 'moderation'

  if (!userId) return NextResponse.json({ ok: false, error: 'missing user_id' }, { status: 400 })

  const nowIso = new Date().toISOString()

  // 1) Hide posts from public feeds (doesn't delete; keeps audit + allows later review)
  const { error: postsErr } = await auth.admin
    .from('posts')
    .update({
      status: 'banned',
      published_at: null,
      updated_at: nowIso,
      deleted_at: null,
      deleted_by: null,
      deleted_reason: reason,
    })
    .eq('author_id', userId)

  if (postsErr) {
    return NextResponse.json({ ok: false, error: postsErr.message }, { status: 500 })
  }

  // 2) Remove user's comments (best-effort). If you'd rather keep threads, we can replace content instead.
  await auth.admin.from('comments').delete().eq('author_id', userId)

  // Audit event (best-effort)
  await auth.admin.from('user_moderation_events').insert({
    user_id: userId,
    actor_id: auth.user.id,
    action: 'takedown',
    reason,
    created_at: nowIso,
  })

  return NextResponse.json({ ok: true })
}

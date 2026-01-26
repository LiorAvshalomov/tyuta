import { NextResponse, type NextRequest } from 'next/server'
import { requireAdminFromRequest } from '@/lib/admin/requireAdminFromRequest'

export async function POST(req: NextRequest) {
  const res = await requireAdminFromRequest(req)
  if (!res.ok) {
    return NextResponse.json({ ok: false, error: res.message }, { status: res.status })
  }

  const body = await req.json().catch(() => ({}))
  const postId = (body?.post_id ?? '').toString()
  const reason = (body?.reason ?? '').toString().trim()

  if (!postId) return NextResponse.json({ ok: false, error: 'Missing post_id' }, { status: 400 })
  if (!reason || reason.length < 3)
    return NextResponse.json({ ok: false, error: 'חייבים לציין סיבה (לפחות 3 תווים).' }, { status: 400 })

  // Load post (to know author + title)
  const { data: post, error: postErr } = await res.admin
    .from('posts')
    .select('id, author_id, title, slug, deleted_at')
    .eq('id', postId)
    .maybeSingle()

  if (postErr) return NextResponse.json({ ok: false, error: postErr.message }, { status: 500 })
  if (!post) return NextResponse.json({ ok: false, error: 'Post not found' }, { status: 404 })
  if (post.deleted_at)
    return NextResponse.json({ ok: false, error: 'הפוסט כבר נמחק (soft delete).' }, { status: 400 })

  const now = new Date().toISOString()

  // Soft delete
  const { error: updErr } = await res.admin
    .from('posts')
    .update({ deleted_at: now, deleted_by: res.user.id, deleted_reason: reason })
    .eq('id', postId)

  if (updErr) return NextResponse.json({ ok: false, error: updErr.message }, { status: 500 })

  // Notify post author
  const payload = {
    post_id: post.id,
    post_title: post.title,
    post_slug: post.slug,
    reason,
  }

  const { error: notifErr } = await res.admin.from('notifications').insert({
    user_id: post.author_id,
    actor_id: null,
    type: 'post_deleted',
    entity_type: 'post',
    entity_id: post.id,
    payload,
    is_read: false,
    created_at: now,
  })

  if (notifErr) {
    // Post was deleted already - but we want to surface the problem
    return NextResponse.json({ ok: true, warning: `Post deleted, but notification failed: ${notifErr.message}` })
  }

  // Audit log (optional table; safe if missing)
  try {
    await res.admin.from('moderation_actions').insert({
      actor_id: res.user.id,
      target_user_id: post.author_id,
      post_id: post.id,
      action: 'post_deleted',
      reason,
      created_at: now,
    })
  } catch {
    // ignore
  }

  return NextResponse.json({ ok: true })
}

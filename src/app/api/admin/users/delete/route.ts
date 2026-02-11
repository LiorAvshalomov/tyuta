import { NextResponse } from 'next/server'
import { requireAdminFromRequest } from '@/lib/admin/requireAdminFromRequest'

type Body = {
  user_id?: string
  confirm?: boolean
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
  if (!userId) return NextResponse.json({ ok: false, error: 'missing user_id' }, { status: 400 })
  if (body.confirm !== true) return NextResponse.json({ ok: false, error: 'missing confirm' }, { status: 400 })

  // Require suspended first (safety)
  const { data: mod, error: mErr } = await auth.admin
    .from('user_moderation')
    .select('is_suspended')
    .eq('user_id', userId)
    .maybeSingle()

  if (mErr) return NextResponse.json({ ok: false, error: mErr.message }, { status: 500 })
  if (!mod?.is_suspended) {
    return NextResponse.json({ ok: false, error: 'user must be suspended before delete' }, { status: 400 })
  }

  // Purge content authored by the user + their interactions that block profile deletion.
  // Best-effort: if some tables don't exist in a given environment, ignore those failures.
  const safeDelete = async (table: string, filter: Record<string, string>) => {
    try {
      // @ts-expect-error dynamic table
      await auth.admin.from(table).delete().match(filter)
    } catch {
      // ignore
    }
  }

  // Interactions that may have RESTRICT FKs
  await safeDelete('comment_likes', { user_id: userId })
  await safeDelete('post_reaction_votes', { voter_id: userId })
  await safeDelete('post_votes', { voter_id: userId })
  await safeDelete('post_bookmarks', { user_id: userId })
  await safeDelete('user_follows', { follower_id: userId })
  await safeDelete('user_follows', { following_id: userId })
  await safeDelete('reports', { reporter_id: userId })
  await safeDelete('reports', { reported_user_id: userId })

  // Authored content
  await safeDelete('comments', { author_id: userId })
  await safeDelete('posts', { author_id: userId })
  await safeDelete('community_notes', { user_id: userId })
  await safeDelete('notifications', { actor_id: userId })
  await safeDelete('notifications', { user_id: userId })

  // Messages & conversations are linked to profiles via cascades, but we can delete explicitly
  await safeDelete('messages', { sender_id: userId })
  await safeDelete('conversation_members', { user_id: userId })

  // Finally delete profile row
  await safeDelete('profiles', { id: userId })

  // Delete Auth user (requires service role; requireAdminFromRequest provides an admin client)
  try {
    const { error: delErr } = await auth.admin.auth.admin.deleteUser(userId)
    if (delErr) {
      return NextResponse.json({ ok: false, error: delErr.message }, { status: 500 })
    }
  } catch {
    // If deleteUser not available (older sdk), treat as server error
    return NextResponse.json({ ok: false, error: 'failed to delete auth user' }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}

import { NextResponse } from 'next/server'
import { requireAdminFromRequest } from '@/lib/admin/requireAdminFromRequest'

type Body = {
  user_id?: string
}

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size))
  return out
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

  const nowIso = new Date().toISOString()

  // Fetch post ids authored by the user
  const { data: posts, error: pErr } = await auth.admin.from('posts').select('id').eq('author_id', userId).limit(5000)
  if (pErr) return NextResponse.json({ ok: false, error: pErr.message }, { status: 500 })

  const postIds = (posts ?? []).map((p) => p.id as string).filter(Boolean)
  const postChunks = chunk(postIds, 200)

  // Delete dependent rows that reference post_id (best-effort order)
  const dependentTables = [
    'post_votes',
    'post_reaction_votes',
    'post_bookmarks',
    'post_tags',
    'posts_feed_stats',
    'post_engagement_posts',
    'post_engagement_summary',
    'post_medals_all_time',
    'post_reaction_summary',
    'moderation_actions',
  ] as const

  for (const ids of postChunks) {
    for (const table of dependentTables) {
      await auth.admin.from(table).delete().in('post_id', ids)
    }
    // Comments for those posts
    await auth.admin.from('comments').delete().in('post_id', ids)
  }

  // Delete user's comments everywhere (including other posts)
  await auth.admin.from('comments').delete().eq('author_id', userId)

  // Finally delete posts
  for (const ids of postChunks) {
    await auth.admin.from('posts').delete().in('id', ids)
  }

  // Audit (best-effort)
  await auth.admin.from('user_moderation_events').insert({
    user_id: userId,
    actor_id: auth.user.id,
    action: 'purge_content',
    reason: null,
    created_at: nowIso,
  })

  return NextResponse.json({ ok: true, deleted_posts: postIds.length })
}

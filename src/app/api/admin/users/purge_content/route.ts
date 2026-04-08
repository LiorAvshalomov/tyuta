import { NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { requireAdminFromRequest } from '@/lib/admin/requireAdminFromRequest'
import {
  fetchUserProfileSnapshot,
  logUserModerationAction,
} from '@/lib/admin/logUserModerationAction'
import { cleanupPostOwnedAssets } from '@/lib/storage/postAssetLifecycle'
import { revalidatePublicProfileForUserId } from '@/lib/revalidatePublicProfile'

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
  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
  if (!UUID_RE.test(userId)) return NextResponse.json({ ok: false, error: 'invalid user_id' }, { status: 400 })

  const nowIso = new Date().toISOString()
  const targetProfile = await fetchUserProfileSnapshot(auth.admin, userId)

  // Fetch post ids authored by the user
  const { data: posts, error: pErr } = await auth.admin
    .from('posts')
    .select('id, slug, title, cover_image_url, status, published_at, created_at, is_anonymous')
    .eq('author_id', userId)
    .limit(5000)
  if (pErr) return NextResponse.json({ ok: false, error: pErr.message }, { status: 500 })

  const postRows = (posts ?? [])
    .map((post) => ({
      id: typeof post.id === 'string' ? post.id : '',
      slug: typeof post.slug === 'string' ? post.slug : null,
      title: typeof (post as { title?: string | null }).title === 'string' ? (post as { title?: string | null }).title ?? null : null,
      cover_image_url: typeof post.cover_image_url === 'string' ? post.cover_image_url : null,
      status: typeof (post as { status?: string | null }).status === 'string' ? (post as { status?: string | null }).status ?? null : null,
      published_at: typeof (post as { published_at?: string | null }).published_at === 'string' ? (post as { published_at?: string | null }).published_at ?? null : null,
      created_at: typeof (post as { created_at?: string | null }).created_at === 'string' ? (post as { created_at?: string | null }).created_at ?? null : null,
      is_anonymous: typeof (post as { is_anonymous?: boolean | null }).is_anonymous === 'boolean' ? (post as { is_anonymous?: boolean | null }).is_anonymous ?? null : null,
    }))
    .filter((post) => post.id)
  const postIds = postRows.map((post) => post.id)
  const postChunks = chunk(postIds, 200)

  const storage = { postAssets: 0, postCovers: 0 }
  for (const post of postRows) {
    try {
      const counts = await cleanupPostOwnedAssets(auth.admin, {
        authorId: userId,
        postId: post.id,
        coverImageUrl: post.cover_image_url,
      })
      storage.postAssets += counts.postAssets
      storage.postCovers += counts.postCovers
    } catch (error) {
      return NextResponse.json(
        { ok: false, error: error instanceof Error ? error.message : 'storage cleanup failed' },
        { status: 500 },
      )
    }
  }

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
    await auth.admin.from('notifications').delete().eq('entity_type', 'post').in('entity_id', ids)
  }

  // Delete user's comments everywhere (including other posts)
  await auth.admin.from('comments').delete().eq('author_id', userId)

  if (postRows.length > 0) {
    try {
      for (const chunkRows of chunk(postRows, 100)) {
        await auth.admin.from('deletion_events').insert(
          chunkRows.map((post) => ({
            action: 'admin_hard_delete',
            actor_user_id: auth.user.id,
            actor_kind: 'admin',
            target_post_id: post.id,
            post_snapshot: {
              title: post.title,
              slug: post.slug,
              author_id: userId,
              status: post.status,
              published_at: post.published_at,
              is_anonymous: post.is_anonymous,
              created_at: post.created_at,
            },
            reason: 'admin purge_content',
            created_at: nowIso,
          })),
        )
      }
    } catch {
      // best effort
    }
  }

  // Finally delete posts
  for (const ids of postChunks) {
    await auth.admin.from('posts').delete().in('id', ids)
  }

  revalidatePath('/')
  revalidatePath('/c/release')
  revalidatePath('/c/stories')
  revalidatePath('/c/magazine')
  revalidatePath('/sitemap.xml')
  for (const post of postRows) {
    if (post.slug) revalidatePath(`/post/${post.slug}`)
  }
  await revalidatePublicProfileForUserId(auth.admin, userId)

  // Audit (best-effort)
  await auth.admin.from('user_moderation_events').insert({
    user_id: userId,
    actor_id: auth.user.id,
    action: 'purge_content',
    reason: null,
    created_at: nowIso,
  } as never)

  await logUserModerationAction({
    admin: auth.admin,
    actorId: auth.user.id,
    targetUserId: userId,
    action: 'user_purge_content',
    reason: null,
    metadata: {
      source: 'admin_users',
      target_profile: targetProfile,
      deleted_posts: postIds.length,
      storage,
    },
  })

  return NextResponse.json({ ok: true, deleted_posts: postIds.length, storage })
}

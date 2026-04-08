import { NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { requireAdminFromRequest } from '@/lib/admin/requireAdminFromRequest'
import {
  fetchUserProfileSnapshot,
  logUserModerationAction,
} from '@/lib/admin/logUserModerationAction'
import { copyPublicCoverToPrivate, removePostCoverPublicObject } from '@/lib/storage/postCoverLifecycle'
import { removePublishedPostInlineImages } from '@/lib/storage/postInlineLifecycle'
import { revalidatePublicProfileForUserId } from '@/lib/revalidatePublicProfile'

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
  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
  if (!UUID_RE.test(userId)) return NextResponse.json({ ok: false, error: 'invalid user_id' }, { status: 400 })

  const nowIso = new Date().toISOString()
  const targetProfile = await fetchUserProfileSnapshot(auth.admin, userId)

  const { data: posts, error: postListErr } = await auth.admin
    .from('posts')
    .select('id, author_id, slug, title, cover_image_url, content_json, status, published_at, prev_status, prev_published_at')
    .eq('author_id', userId)
    .eq('status', 'published')
    .is('deleted_at', null)

  if (postListErr) {
    return NextResponse.json({ ok: false, error: postListErr.message }, { status: 500 })
  }

  const postRows = (posts ?? []) as Array<{
    id?: string
    author_id?: string
    slug?: string | null
    title?: string | null
    cover_image_url?: string | null
    content_json?: unknown
    status?: string | null
    published_at?: string | null
    prev_status?: string | null
    prev_published_at?: string | null
  }>
  const postIds = postRows
    .map((post) => (typeof post.id === 'string' ? post.id : ''))
    .filter(Boolean)

  // Hide only currently public posts; drafts and trash remain untouched.
  const { error: postsErr } = postIds.length === 0
    ? { error: null }
    : await auth.admin
        .from('posts')
        .update({
          status: 'banned',
          published_at: null,
          updated_at: nowIso,
          deleted_reason: reason,
        } as never)
        .in('id', postIds)

  if (postsErr) {
    return NextResponse.json({ ok: false, error: postsErr.message }, { status: 500 })
  }

  const warnings: string[] = []
  let quarantined = 0
  let removedPublicInlineImages = 0
  revalidatePath('/')
  revalidatePath('/c/release')
  revalidatePath('/c/stories')
  revalidatePath('/c/magazine')
  revalidatePath('/sitemap.xml')
  await revalidatePublicProfileForUserId(auth.admin, userId)

  for (const row of postRows) {
    const postId = typeof row.id === 'string' ? row.id : ''
    const authorId = typeof row.author_id === 'string' ? row.author_id : ''
    if (!postId || !authorId) continue
    if (typeof row.slug === 'string' && row.slug) {
      revalidatePath(`/post/${row.slug}`)
    }

    try {
      const copied = await copyPublicCoverToPrivate(auth.admin, {
        authorId,
        postId,
        coverImageUrl: row.cover_image_url ?? null,
      })
      const originalStatus = typeof row.prev_status === 'string' && row.prev_status
        ? row.prev_status
        : (typeof row.status === 'string' && row.status ? row.status : 'published')
      const originalPublishedAt = typeof row.prev_published_at === 'string' && row.prev_published_at
        ? row.prev_published_at
        : (typeof row.published_at === 'string' ? row.published_at : null)

      const { error: updErr } = await auth.admin
        .from('posts')
        .update({
          cover_image_url: copied?.privatePath ?? row.cover_image_url ?? null,
          prev_status: originalStatus,
          prev_published_at: originalPublishedAt,
          updated_at: nowIso,
        } as never)
        .eq('id', postId)
        .eq('author_id', userId)

      if (updErr) {
        warnings.push(`${postId}: ${updErr.message}`)
        continue
      }

      if (copied) {
        try {
          await removePostCoverPublicObject(auth.admin, copied.publicPath)
          quarantined++
        } catch (error) {
          warnings.push(`${postId}: ${error instanceof Error ? error.message : 'public cover cleanup failed'}`)
        }
      }
    } catch (error) {
      warnings.push(`${postId}: ${error instanceof Error ? error.message : 'cover quarantine failed'}`)
    }

    try {
      removedPublicInlineImages += await removePublishedPostInlineImages(auth.admin, postId)
    } catch (error) {
      warnings.push(`${postId}: ${error instanceof Error ? error.message : 'public inline cleanup failed'}`)
    }
  }

  if (postRows.length > 0) {
    try {
      await auth.admin.from('deletion_events').insert(
        postRows
          .filter((post) => typeof post.id === 'string')
          .map((post) => ({
            action: 'admin_soft_hide',
            actor_user_id: auth.user.id,
            actor_kind: 'admin',
            target_post_id: post.id as string,
            post_snapshot: {
              title: typeof post.title === 'string' ? post.title : null,
              slug: typeof post.slug === 'string' ? post.slug : null,
              author_id: authorIdFromRow(post),
              status: typeof post.status === 'string' ? post.status : null,
              published_at: typeof post.published_at === 'string' ? post.published_at : null,
            },
            reason,
            created_at: nowIso,
          })),
      )
    } catch {
      // best effort
    }
  }

  // Audit event (best-effort)
  await auth.admin.from('user_moderation_events').insert({
    user_id: userId,
    actor_id: auth.user.id,
    action: 'takedown',
    reason,
    created_at: nowIso,
  } as never)

  await logUserModerationAction({
    admin: auth.admin,
    actorId: auth.user.id,
    targetUserId: userId,
    action: 'user_takedown',
    reason,
    metadata: {
      source: 'admin_users',
      target_profile: targetProfile,
      hidden_posts: postRows.length,
      quarantined_covers: quarantined,
      removed_public_inline_images: removedPublicInlineImages,
    },
  })

  return NextResponse.json({
    ok: true,
    hidden_posts: postRows.length,
    quarantined_covers: quarantined,
    removed_public_inline_images: removedPublicInlineImages,
    warnings,
  })
}

function authorIdFromRow(row: { author_id?: string | null }): string | null {
  return typeof row.author_id === 'string' ? row.author_id : null
}

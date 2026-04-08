import { NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { requireAdminFromRequest } from '@/lib/admin/requireAdminFromRequest'
import {
  fetchUserProfileSnapshot,
  logUserModerationAction,
} from '@/lib/admin/logUserModerationAction'
import { promotePrivateCoverToPublic, removePostAssetObject } from '@/lib/storage/postCoverLifecycle'
import {
  removePublishedPostInlineImages,
  syncPublishedPostInlineImages,
} from '@/lib/storage/postInlineLifecycle'
import { revalidatePublicProfileForUserId } from '@/lib/revalidatePublicProfile'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

type Body = {
  user_id?: string
}

type PostRow = {
  id: string
  author_id: string
  slug: string | null
  cover_image_url: string | null
  content_json: unknown
  status: string | null
  prev_status: string | null
  prev_published_at: string | null
  deleted_reason: string | null
}

function inferRestoreStatus(post: PostRow): 'draft' | 'published' | 'moderated' {
  if (post.prev_status === 'published' || post.prev_status === 'draft' || post.prev_status === 'moderated') {
    return post.prev_status
  }
  if (post.prev_published_at) return 'published'
  if (post.slug && UUID_RE.test(post.slug)) return 'draft'
  return 'published'
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
  if (!UUID_RE.test(userId)) return NextResponse.json({ ok: false, error: 'invalid user_id' }, { status: 400 })

  const nowIso = new Date().toISOString()
  const targetProfile = await fetchUserProfileSnapshot(auth.admin, userId)
  const { data, error } = await auth.admin
    .from('posts')
    .select('id, author_id, slug, cover_image_url, content_json, status, prev_status, prev_published_at, deleted_reason')
    .eq('author_id', userId)
    .eq('status', 'banned')
    .limit(5000)

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })

  const posts = (data ?? []) as PostRow[]
  if (posts.length === 0) {
    return NextResponse.json({ ok: true, restored_posts: 0, restored_public_inline_images: 0, warnings: [] })
  }

  const warnings: string[] = []
  let restoredPosts = 0
  let restoredPublicInlineImages = 0

  revalidatePath('/')
  revalidatePath('/c/release')
  revalidatePath('/c/stories')
  revalidatePath('/c/magazine')
  revalidatePath('/sitemap.xml')
  await revalidatePublicProfileForUserId(auth.admin, userId)

  for (const post of posts) {
    const restoredStatus = inferRestoreStatus(post)
    const shouldBePublic = restoredStatus === 'published'
    const publishedAt = shouldBePublic ? (post.prev_published_at ?? nowIso) : null
    const privateCoverPath =
      shouldBePublic &&
      typeof post.cover_image_url === 'string' &&
      post.cover_image_url &&
      !/^https?:\/\//i.test(post.cover_image_url)
        ? post.cover_image_url
        : null

    let restoredCoverUrl = post.cover_image_url
    if (privateCoverPath) {
      try {
        const promoted = await promotePrivateCoverToPublic(auth.admin, {
          postId: post.id,
          sourcePath: privateCoverPath,
          removeSource: false,
        })
        if (!promoted.publicUrl) {
          warnings.push(`${post.id}: cover restore failed`)
          continue
        }
        restoredCoverUrl = promoted.publicUrl
      } catch (err) {
        warnings.push(`${post.id}: ${err instanceof Error ? err.message : 'cover restore failed'}`)
        continue
      }
    }

    const { error: updErr } = await auth.admin
      .from('posts')
      .update({
        status: restoredStatus,
        published_at: publishedAt,
        cover_image_url: restoredCoverUrl,
        deleted_reason: null,
        prev_status: null,
        prev_published_at: null,
        updated_at: nowIso,
      } as never)
      .eq('id', post.id)
      .eq('author_id', userId)

    if (updErr) {
      warnings.push(`${post.id}: ${updErr.message}`)
      continue
    }

    if (privateCoverPath) {
      try {
        await removePostAssetObject(auth.admin, privateCoverPath)
      } catch {
        // best effort
      }
    }

    try {
      const inline = shouldBePublic
        ? await syncPublishedPostInlineImages(auth.admin, {
            authorId: post.author_id,
            postId: post.id,
            content: post.content_json,
          })
        : {
            uploaded: 0,
            removed: await removePublishedPostInlineImages(auth.admin, post.id),
            retained: 0,
          }

      restoredPublicInlineImages += inline.uploaded
    } catch (err) {
      warnings.push(`${post.id}: ${err instanceof Error ? err.message : 'public inline restore failed'}`)
    }

    if (post.slug) revalidatePath(`/post/${post.slug}`)
    restoredPosts++
  }

  await logUserModerationAction({
    admin: auth.admin,
    actorId: auth.user.id,
    targetUserId: userId,
    action: 'user_restore_content',
    reason: null,
    metadata: {
      source: 'admin_users',
      target_profile: targetProfile,
      restored_posts: restoredPosts,
      restored_public_inline_images: restoredPublicInlineImages,
      warnings_count: warnings.length,
    },
  })

  return NextResponse.json({
    ok: true,
    restored_posts: restoredPosts,
    restored_public_inline_images: restoredPublicInlineImages,
    warnings,
  })
}

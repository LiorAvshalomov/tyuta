import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { revalidatePath } from 'next/cache'
import { requireUserFromRequest } from '@/lib/auth/requireUserFromRequest'
import { rateLimit } from '@/lib/rateLimit'
import { promotePrivateCoverToPublic, removePostAssetObject } from '@/lib/storage/postCoverLifecycle'
import {
  removePublishedPostInlineImages,
  syncPublishedPostInlineImages,
} from '@/lib/storage/postInlineLifecycle'
import { revalidatePublicProfileForUserId } from '@/lib/revalidatePublicProfile'
import { revalidateAuthorSidebars } from '@/lib/revalidateAuthorSidebars'

const RESTORE_WINDOW_DAYS = 14

function serviceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return null
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireUserFromRequest(req)
  if (!auth.ok) return auth.response

  const rl = await rateLimit(`post-trash:${auth.user.id}`, { maxRequests: 30, windowMs: 60_000 })
  if (!rl.allowed) {
    return NextResponse.json(
      { error: { code: 'rate_limited', message: 'Too many requests' } },
      { status: 429, headers: { 'Retry-After': String(Math.ceil(rl.retryAfterMs / 1000)) } },
    )
  }

  const { id } = await ctx.params
  const postId = (id ?? '').toString().trim()
  if (!postId) {
    return NextResponse.json({ error: { code: 'bad_request', message: 'missing post id' } }, { status: 400 })
  }

  const { data: post, error: postErr } = await auth.supabase
    .from('posts')
    .select('id, author_id, slug, status, deleted_at, cover_image_url, content_json')
    .eq('id', postId)
    .maybeSingle()

  if (postErr) return NextResponse.json({ error: { code: 'db_error', message: postErr.message } }, { status: 500 })
  if (!post) return NextResponse.json({ error: { code: 'not_found', message: 'post not found' } }, { status: 404 })
  if (post.author_id !== auth.user.id) {
    return NextResponse.json({ error: { code: 'forbidden', message: 'not your post' } }, { status: 403 })
  }
  if (!post.deleted_at) {
    return NextResponse.json({ error: { code: 'bad_request', message: 'post is not deleted' } }, { status: 400 })
  }

  const svc = serviceClient()
  if (!svc) {
    return NextResponse.json({ error: { code: 'server_error', message: 'storage not configured' } }, { status: 500 })
  }

  // Enforce restore window
  const deletedAt = new Date(post.deleted_at)
  const maxRestore = new Date(Date.now() - RESTORE_WINDOW_DAYS * 24 * 60 * 60 * 1000)
  if (deletedAt < maxRestore) {
    return NextResponse.json(
      { error: { code: 'restore_window_expired', message: 'חלון השחזור עבר (14 יום). הפוסט יימחק לצמיתות.' } },
      { status: 400 }
    )
  }

  const shouldBePublic = post.status === 'published'
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
      const promoted = await promotePrivateCoverToPublic(svc, {
        postId,
        sourcePath: privateCoverPath,
        removeSource: false,
      })
      if (!promoted.publicUrl) {
        return NextResponse.json(
          { error: { code: 'cover_restore_failed', message: 'cover restore failed' } },
          { status: 500 },
        )
      }
      restoredCoverUrl = promoted.publicUrl
    } catch (error) {
      return NextResponse.json(
        {
          error: {
            code: 'cover_restore_failed',
            message: error instanceof Error ? error.message : 'cover restore failed',
          },
        },
        { status: 500 },
      )
    }
  }

  const { error: updErr } = await auth.supabase
    .from('posts')
    .update({ deleted_at: null, cover_image_url: restoredCoverUrl })
    .eq('id', postId)
  if (updErr) return NextResponse.json({ error: { code: 'db_error', message: updErr.message } }, { status: 500 })

  const warnings: string[] = []
  let publicInline = { uploaded: 0, removed: 0, retained: 0 }

  if (privateCoverPath) {
    try {
      await removePostAssetObject(svc, privateCoverPath)
    } catch {
      // best effort
    }
  }

  try {
    publicInline = shouldBePublic
      ? await syncPublishedPostInlineImages(svc, {
          authorId: auth.user.id,
          postId,
          content: post.content_json,
        })
      : {
          uploaded: 0,
          removed: await removePublishedPostInlineImages(svc, postId),
          retained: 0,
        }
  } catch (error) {
    warnings.push(error instanceof Error ? error.message : 'public inline sync failed')
  }

  revalidatePath('/')
  revalidatePath('/c/release')
  revalidatePath('/c/stories')
  revalidatePath('/c/magazine')
  revalidatePath('/sitemap.xml')
  if (typeof post.slug === 'string' && post.slug) {
    revalidatePath(`/post/${post.slug}`)
  }
  await revalidateAuthorSidebars(auth.user.id, typeof post.slug === 'string' ? post.slug : undefined)
  await revalidatePublicProfileForUserId(svc, auth.user.id)

  return NextResponse.json({
    ok: true,
    public_inline: publicInline,
    ...(warnings.length > 0 ? { warning: warnings.join(' | ') } : {}),
  })
}

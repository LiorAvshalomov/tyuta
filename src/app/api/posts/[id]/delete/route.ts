import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { revalidatePath } from 'next/cache'
import { requireUserFromRequest } from '@/lib/auth/requireUserFromRequest'
import { rateLimit } from '@/lib/rateLimit'
import { copyPublicCoverToPrivate, removePostCoverPublicObject } from '@/lib/storage/postCoverLifecycle'
import { removePublishedPostInlineImages } from '@/lib/storage/postInlineLifecycle'
import { revalidatePublicProfileForUserId } from '@/lib/revalidatePublicProfile'
import { revalidateAuthorSidebars } from '@/lib/revalidateAuthorSidebars'

const POST_ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

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
  if (!POST_ID_RE.test(postId)) {
    return NextResponse.json({ error: { code: 'bad_request', message: 'invalid post id' } }, { status: 400 })
  }

  // Ensure the post exists and is owned by the requester
  const { data: post, error: postErr } = await auth.supabase
    .from('posts')
    .select('id, author_id, title, slug, deleted_at, status, published_at, created_at, is_anonymous, cover_image_url')
    .eq('id', postId)
    .maybeSingle()

  if (postErr) {
    return NextResponse.json({ error: { code: 'db_error', message: postErr.message } }, { status: 500 })
  }
  if (!post) {
    return NextResponse.json({ error: { code: 'not_found', message: 'post not found' } }, { status: 404 })
  }
  if (post.author_id !== auth.user.id) {
    return NextResponse.json({ error: { code: 'forbidden', message: 'not your post' } }, { status: 403 })
  }
  if (post.deleted_at) {
    return NextResponse.json({ error: { code: 'bad_request', message: 'post already deleted' } }, { status: 400 })
  }

  const svc = serviceClient()
  if (!svc) {
    return NextResponse.json({ error: { code: 'server_error', message: 'storage not configured' } }, { status: 500 })
  }

  let quarantinedCover: Awaited<ReturnType<typeof copyPublicCoverToPrivate>> = null
  try {
    quarantinedCover = await copyPublicCoverToPrivate(svc, {
      authorId: auth.user.id,
      postId,
      coverImageUrl: typeof post.cover_image_url === 'string' ? post.cover_image_url : null,
    })
  } catch (error) {
    return NextResponse.json(
      {
        error: {
          code: 'cover_quarantine_failed',
          message: error instanceof Error ? error.message : 'cover quarantine failed',
        },
      },
      { status: 500 },
    )
  }

  const now = new Date().toISOString()
  const { error: updErr } = await auth.supabase
    .from('posts')
    .update({
      deleted_at: now,
      cover_image_url: quarantinedCover?.privatePath ?? post.cover_image_url ?? null,
    })
    .eq('id', postId)

  if (updErr) {
    return NextResponse.json({ error: { code: 'db_error', message: updErr.message } }, { status: 500 })
  }

  try {
    await svc.from('deletion_events').insert({
      action: 'soft_delete',
      actor_user_id: auth.user.id,
      actor_kind: 'user',
      target_post_id: post.id,
      post_snapshot: {
        title: post.title,
        slug: post.slug,
        author_id: post.author_id,
        status: post.status,
        published_at: post.published_at,
        created_at: post.created_at,
        is_anonymous: post.is_anonymous,
      },
      reason: null,
      created_at: now,
    })
  } catch {
    // best effort
  }

  // Invalidate ISR cache for all public post lists immediately.
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

  const warnings: string[] = []
  let removedPublicInlineImages = 0

  if (quarantinedCover) {
    try {
      await removePostCoverPublicObject(svc, quarantinedCover.publicPath)
    } catch (error) {
      warnings.push(error instanceof Error ? error.message : 'public cover cleanup failed')
    }
  }

  try {
    removedPublicInlineImages = await removePublishedPostInlineImages(svc, postId)
  } catch (error) {
    warnings.push(error instanceof Error ? error.message : 'public inline cleanup failed')
  }

  // Soft delete should hide post-related notifications without losing them,
  // so a later restore can bring them back as-is.
  try {
    await svc.rpc('archive_post_notifications', { p_post_id: postId })
  } catch {
    // non-fatal
  }

  return NextResponse.json({
    ok: true,
    removed_public_inline_images: removedPublicInlineImages,
    ...(warnings.length > 0 ? { warning: warnings.join(' | ') } : {}),
  })
}

import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { revalidatePath } from 'next/cache'
import { requireUserFromRequest } from '@/lib/auth/requireUserFromRequest'
import { copyPublicCoverToPrivate, removePostCoverPublicObject } from '@/lib/storage/postCoverLifecycle'
import { removePublishedPostInlineImages } from '@/lib/storage/postInlineLifecycle'
import { revalidatePublicProfileForUserId } from '@/lib/revalidatePublicProfile'

function serviceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return null
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireUserFromRequest(req)
  if (!auth.ok) return auth.response

  const { id } = await ctx.params
  const postId = (id ?? '').toString().trim()
  if (!postId) {
    return NextResponse.json({ error: { code: 'bad_request', message: 'missing post id' } }, { status: 400 })
  }

  // Ensure the post exists and is owned by the requester
  const { data: post, error: postErr } = await auth.supabase
    .from('posts')
    .select('id, author_id, slug, deleted_at, status, cover_image_url')
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

  // Invalidate ISR cache for all public post lists immediately.
  revalidatePath('/')
  revalidatePath('/c/release')
  revalidatePath('/c/stories')
  revalidatePath('/c/magazine')
  if (typeof post.slug === 'string' && post.slug) {
    revalidatePath(`/post/${post.slug}`)
  }
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

  // Remove notifications that point to this post (they become dead links otherwise).
  // Needs Service Role because notifications belong to other users.
  try {
    await svc.from('notifications').delete().eq('entity_type', 'post').eq('entity_id', postId)
  } catch {
    // non-fatal
  }

  return NextResponse.json({
    ok: true,
    removed_public_inline_images: removedPublicInlineImages,
    ...(warnings.length > 0 ? { warning: warnings.join(' | ') } : {}),
  })
}

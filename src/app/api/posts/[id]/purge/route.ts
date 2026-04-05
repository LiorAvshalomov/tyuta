import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { revalidatePath } from 'next/cache'
import { requireUserFromRequest } from '@/lib/auth/requireUserFromRequest'
import { cleanupPostOwnedAssets } from '@/lib/storage/postAssetLifecycle'
import { revalidatePublicProfileForUserId } from '@/lib/revalidatePublicProfile'

function serviceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return null
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
}

type PostRow = {
  id: string
  author_id: string
  slug: string | null
  title: string | null
  deleted_at: string | null
  cover_image_url: string | null
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireUserFromRequest(req)
  if (!auth.ok) return auth.response

  const { id } = await ctx.params
  const postId = (id ?? '').toString().trim()
  if (!postId) {
    return NextResponse.json({ error: { code: 'bad_request', message: 'missing post id' } }, { status: 400 })
  }

  const { data, error: postErr } = await auth.supabase
    .from('posts')
    .select('id, author_id, slug, title, deleted_at, cover_image_url')
    .eq('id', postId)
    .maybeSingle<PostRow>()

  if (postErr) {
    return NextResponse.json({ error: { code: 'db_error', message: postErr.message } }, { status: 500 })
  }

  const post = data ?? null
  if (!post) {
    return NextResponse.json({ error: { code: 'not_found', message: 'post not found' } }, { status: 404 })
  }
  if (post.author_id !== auth.user.id) {
    return NextResponse.json({ error: { code: 'forbidden', message: 'not your post' } }, { status: 403 })
  }
  if (!post.deleted_at) {
    return NextResponse.json({ error: { code: 'bad_request', message: 'post must be deleted first' } }, { status: 400 })
  }

  const svc = serviceClient()
  if (!svc) {
    return NextResponse.json({ error: { code: 'server_error', message: 'storage not configured' } }, { status: 500 })
  }

  let storage: { postAssets: number; postCovers: number }
  try {
    storage = await cleanupPostOwnedAssets(svc, {
      authorId: auth.user.id,
      postId,
      coverImageUrl: post.cover_image_url,
    })
  } catch (error) {
    return NextResponse.json(
      {
        error: {
          code: 'storage_cleanup_failed',
          message: error instanceof Error ? error.message : 'storage cleanup failed',
        },
      },
      { status: 500 },
    )
  }

  await Promise.allSettled([
    Promise.resolve(svc.from('comments').delete().eq('post_id', postId)),
    Promise.resolve(svc.from('post_bookmarks').delete().eq('post_id', postId)),
    Promise.resolve(svc.from('post_reaction_votes').delete().eq('post_id', postId)),
    Promise.resolve(svc.from('post_votes').delete().eq('post_id', postId)),
    Promise.resolve(svc.from('post_tags').delete().eq('post_id', postId)),
    Promise.resolve(svc.from('moderation_actions').delete().eq('post_id', postId)),
    Promise.resolve(svc.from('notifications').delete().eq('entity_type', 'post').eq('entity_id', postId)),
  ])

  try {
      await svc.from('deletion_events').insert({
        action: 'hard_delete',
      actor_user_id: auth.user.id,
      actor_kind: 'user',
      target_post_id: post.id,
      post_snapshot: {
        title: post.title,
        slug: post.slug,
        author_id: post.author_id,
      },
      reason: 'user purge',
      created_at: new Date().toISOString(),
    })
  } catch {
    // best effort
  }

  const { error: delErr } = await svc.from('posts').delete().eq('id', postId).eq('author_id', auth.user.id)
  if (delErr) {
    return NextResponse.json({ error: { code: 'db_error', message: delErr.message } }, { status: 500 })
  }

  revalidatePath('/')
  revalidatePath('/c/release')
  revalidatePath('/c/stories')
  revalidatePath('/c/magazine')
  if (post.slug) revalidatePath(`/post/${post.slug}`)
  await revalidatePublicProfileForUserId(svc, auth.user.id)

  return NextResponse.json({ ok: true, storage })
}

import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requireUserFromRequest } from '@/lib/auth/requireUserFromRequest'
import {
  extractReferencedPostImagePaths,
  normalizeOwnedPrivatePostAssetPath,
  pruneUnusedPostPrivateAssets,
} from '@/lib/storage/postAssetLifecycle'
import {
  removePublishedPostInlineImages,
  syncPublishedPostInlineImages,
} from '@/lib/storage/postInlineLifecycle'

export const runtime = 'nodejs'

type PostRow = {
  id: string
  author_id: string
  content_json: unknown
  cover_image_url: string | null
  status: string | null
  deleted_at: string | null
  moderated_at: string | null
}

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireUserFromRequest(req)
  if (!auth.ok) return auth.response

  const { id } = await ctx.params
  const postId = (id ?? '').toString().trim()
  if (!postId) {
    return NextResponse.json({ error: { code: 'bad_request', message: 'missing post id' } }, { status: 400 })
  }

  const { data: post, error: postErr } = await auth.supabase
    .from('posts')
    .select('id, author_id, content_json, cover_image_url, status, deleted_at, moderated_at')
    .eq('id', postId)
    .maybeSingle<PostRow>()

  if (postErr) {
    return NextResponse.json({ error: { code: 'db_error', message: postErr.message } }, { status: 500 })
  }
  if (!post) {
    return NextResponse.json({ error: { code: 'not_found', message: 'post not found' } }, { status: 404 })
  }
  if (post.author_id !== auth.user.id) {
    return NextResponse.json({ error: { code: 'forbidden', message: 'not your post' } }, { status: 403 })
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !serviceKey) {
    return NextResponse.json({ error: { code: 'server_error', message: 'storage not configured' } }, { status: 500 })
  }

  const service = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  const contentPaths = extractReferencedPostImagePaths(post.content_json)
    .map((path) => normalizeOwnedPrivatePostAssetPath(path, auth.user.id, postId))
    .filter((path): path is string => Boolean(path))

  const privateCoverPath = normalizeOwnedPrivatePostAssetPath(post.cover_image_url, auth.user.id, postId)
  const keepPaths = privateCoverPath ? [...contentPaths, privateCoverPath] : contentPaths

  try {
    const removedPrivate = await pruneUnusedPostPrivateAssets(service, {
      authorId: auth.user.id,
      postId,
      keepPaths,
    })

    const isPubliclyVisible =
      post.status === 'published' &&
      post.deleted_at == null &&
      post.moderated_at == null

    const publicInline = isPubliclyVisible
      ? await syncPublishedPostInlineImages(service, {
          authorId: auth.user.id,
          postId,
          content: post.content_json,
        })
      : {
          uploaded: 0,
          removed: await removePublishedPostInlineImages(service, postId),
          retained: 0,
        }

    return NextResponse.json({ ok: true, removedPrivate, publicInline })
  } catch (error: unknown) {
    return NextResponse.json(
      { error: { code: 'storage_cleanup_failed', message: error instanceof Error ? error.message : 'storage cleanup failed' } },
      { status: 500 },
    )
  }
}

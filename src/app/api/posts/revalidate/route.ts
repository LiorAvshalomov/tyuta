/**
 * POST /api/posts/revalidate
 *
 * Lightweight endpoint for the write page to call after publishing or updating a post.
 * Triggers on-demand ISR revalidation so the home feed and channel pages reflect the
 * new post without waiting for the 60-second ISR window.
 *
 * Authentication is required (any logged-in user can revalidate — no data is exposed).
 * The supplied slug is verified against the caller before cache invalidation.
 */

import { NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { requireUserFromRequest } from '@/lib/auth/requireUserFromRequest'
import { revalidateAuthorSidebars } from '@/lib/revalidateAuthorSidebars'
import { rateLimit } from '@/lib/rateLimit'
import { rejectLargeRequestBody } from '@/lib/requestBodyLimit'

const MAX_REQUEST_BODY_BYTES = 4 * 1024

type PostOwnerRow = {
  id: string
  slug: string | null
  author_id: string
}

export async function POST(req: Request) {
  const auth = await requireUserFromRequest(req)
  if (!auth.ok) return auth.response

  const tooLarge = rejectLargeRequestBody(req, MAX_REQUEST_BODY_BYTES)
  if (tooLarge) return tooLarge

  // Prevent abuse: revalidating triggers a DB query via revalidateAuthorSidebars.
  // 10 calls per minute per user is well above any legitimate publish cadence.
  const rl = await rateLimit(`revalidate:${auth.user.id}`, { maxRequests: 10, windowMs: 60_000 })
  if (!rl.allowed) {
    return NextResponse.json(
      { error: 'יותר מדי בקשות. נסה שוב עוד רגע.' },
      { status: 429, headers: { 'Retry-After': String(Math.ceil(rl.retryAfterMs / 1000)) } },
    )
  }

  const body = await req.json().catch(() => ({})) as { slug?: unknown }
  const slug = typeof body.slug === 'string' && body.slug ? body.slug : null

  if (!slug) {
    return NextResponse.json(
      { error: { code: 'missing_slug', message: 'missing slug' } },
      { status: 400 },
    )
  }

  const { data: post, error: postError } = await auth.supabase
    .from('posts')
    .select('id, slug, author_id')
    .eq('slug', slug)
    .maybeSingle<PostOwnerRow>()

  if (postError) {
    return NextResponse.json(
      { error: { code: 'post_lookup_failed', message: 'post lookup failed' } },
      { status: 500 },
    )
  }

  if (!post || post.author_id !== auth.user.id) {
    return NextResponse.json(
      { error: { code: 'forbidden', message: 'not your post' } },
      { status: 403 },
    )
  }

  revalidatePath('/')
  revalidatePath('/c/release')
  revalidatePath('/c/stories')
  revalidatePath('/c/magazine')
  revalidatePath('/search')
  revalidatePath('/sitemap.xml')
  revalidatePath(`/post/${post.slug ?? slug}`)

  // Revalidate the author's other post pages so their "More from author"
  // sidebars reflect the newly published / edited post immediately.
  await revalidateAuthorSidebars(auth.user.id, post.slug ?? slug)

  return NextResponse.json({ ok: true })
}

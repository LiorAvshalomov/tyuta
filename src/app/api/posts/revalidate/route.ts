/**
 * POST /api/posts/revalidate
 *
 * Lightweight endpoint for the write page to call after publishing or updating a post.
 * Triggers on-demand ISR revalidation so the home feed and channel pages reflect the
 * new post without waiting for the 60-second ISR window.
 *
 * Authentication is required (any logged-in user can revalidate — no data is exposed).
 */

import { NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { requireUserFromRequest } from '@/lib/auth/requireUserFromRequest'
import { revalidateAuthorSidebars } from '@/lib/revalidateAuthorSidebars'
import { rateLimit } from '@/lib/rateLimit'

export async function POST(req: Request) {
  const auth = await requireUserFromRequest(req)
  if (!auth.ok) return auth.response

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

  revalidatePath('/')
  revalidatePath('/c/release')
  revalidatePath('/c/stories')
  revalidatePath('/c/magazine')
  revalidatePath('/search')
  revalidatePath('/sitemap.xml')
  if (slug) revalidatePath(`/post/${slug}`)

  // Revalidate the author's other post pages so their "More from author"
  // sidebars reflect the newly published / edited post immediately.
  await revalidateAuthorSidebars(auth.user.id, slug ?? undefined)

  return NextResponse.json({ ok: true })
}

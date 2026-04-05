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

export async function POST(req: Request) {
  const auth = await requireUserFromRequest(req)
  if (!auth.ok) return auth.response

  const body = await req.json().catch(() => ({})) as { slug?: unknown }
  const slug = typeof body.slug === 'string' && body.slug ? body.slug : null

  revalidatePath('/')
  revalidatePath('/c/release')
  revalidatePath('/c/stories')
  revalidatePath('/c/magazine')
  revalidatePath('/search')
  if (slug) revalidatePath(`/post/${slug}`)

  return NextResponse.json({ ok: true })
}

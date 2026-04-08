import { NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'

import { requireUserFromRequest } from '@/lib/auth/requireUserFromRequest'
import { rateLimit } from '@/lib/rateLimit'

type RevalidateBody = {
  previousUsername?: unknown
  nextUsername?: unknown
}

type ProfileUsernameRow = {
  username: string | null
}

type PostSlugRow = {
  slug: string
}

function normalizeUsername(value: unknown) {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed ? trimmed : null
}

function revalidateUserProfilePaths(username: string | null) {
  if (!username) return
  revalidatePath(`/u/${username}`)
  revalidatePath(`/u/${username}/followers`)
  revalidatePath(`/u/${username}/following`)
}

export async function POST(req: Request) {
  const auth = await requireUserFromRequest(req)
  if (!auth.ok) return auth.response

  const rl = await rateLimit(`profile-revalidate:${auth.user.id}`, { maxRequests: 15, windowMs: 5 * 60_000 })
  if (!rl.allowed) {
    return NextResponse.json(
      { ok: false, error: 'Too many requests' },
      { status: 429, headers: { 'Retry-After': String(Math.ceil(rl.retryAfterMs / 1000)) } },
    )
  }

  const body = await req.json().catch(() => ({})) as RevalidateBody

  const previousUsername = normalizeUsername(body.previousUsername)
  let nextUsername = normalizeUsername(body.nextUsername)

  if (!nextUsername) {
    const { data: profile } = await auth.supabase
      .from('profiles')
      .select('username')
      .eq('id', auth.user.id)
      .maybeSingle<ProfileUsernameRow>()

    nextUsername = normalizeUsername(profile?.username)
  }

  revalidatePath('/')
  revalidatePath('/c/release')
  revalidatePath('/c/stories')
  revalidatePath('/c/magazine')
  revalidatePath('/search')

  revalidateUserProfilePaths(previousUsername)
  revalidateUserProfilePaths(nextUsername)

  const { data: posts } = await auth.supabase
    .from('posts')
    .select('slug')
    .eq('author_id', auth.user.id)
    .eq('status', 'published')
    .is('deleted_at', null)
    .limit(500)

  for (const row of (posts ?? []) as PostSlugRow[]) {
    if (!row.slug) continue
    revalidatePath(`/post/${encodeURIComponent(row.slug)}`)
  }

  return NextResponse.json({
    ok: true,
    revalidatedPosts: (posts ?? []).length,
  })
}

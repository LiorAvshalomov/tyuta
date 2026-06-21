import { NextResponse } from 'next/server'
import { requireAdminFromRequest } from '@/lib/admin/requireAdminFromRequest'

type ContentViewRow = {
  resource_id: string | null
}

type PostWithCountsRow = {
  id: string
  title: string | null
  slug: string | null
  author_id: string | null
  published_at: string | null
  comments_count: number | string | null
  reactions_count: number | string | null
}

type ProfileRow = {
  id: string
  username: string | null
}

function mustISO(raw: string | null, fallback: Date): string {
  if (!raw) return fallback.toISOString()
  const parsed = new Date(raw)
  return Number.isNaN(parsed.getTime()) ? fallback.toISOString() : parsed.toISOString()
}

function toCount(value: number | string | null): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string') {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : 0
  }
  return 0
}

export async function GET(req: Request) {
  const gate = await requireAdminFromRequest(req)
  if (!gate.ok) return gate.response

  const url = new URL(req.url)
  const now = new Date()
  const startFallback = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)

  const start = mustISO(url.searchParams.get('start'), startFallback)
  const end   = mustISO(url.searchParams.get('end'),   now)
  const limit = Math.min(Math.max(parseInt(url.searchParams.get('limit') ?? '20', 10) || 20, 1), 100)

  const { data: viewRows, error: viewsError } = await gate.admin
    .from('content_view_events')
    .select('resource_id')
    .eq('resource_type', 'post')
    .gte('first_seen_at', start)
    .lt('first_seen_at', end)
    .order('first_seen_at', { ascending: false })
    .limit(100_000)

  if (viewsError) {
    return NextResponse.json({ error: viewsError.message }, { status: 500 })
  }

  const viewCounts = new Map<string, number>()
  for (const row of (viewRows ?? []) as ContentViewRow[]) {
    if (!row.resource_id) continue
    viewCounts.set(row.resource_id, (viewCounts.get(row.resource_id) ?? 0) + 1)
  }

  const rankedPostIds = [...viewCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([postId]) => postId)

  if (rankedPostIds.length === 0) {
    return NextResponse.json([], { headers: { 'Cache-Control': 'no-store' } })
  }

  const candidatePostIds = rankedPostIds.slice(0, Math.min(Math.max(limit * 10, 100), 1000))
  const { data: posts, error: postsError } = await gate.admin
    .from('posts_with_counts')
    .select('id,title,slug,author_id,published_at,comments_count,reactions_count')
    .in('id', candidatePostIds)
    .eq('status', 'published')

  if (postsError) {
    return NextResponse.json({ error: postsError.message }, { status: 500 })
  }

  const postRows = (posts ?? []) as PostWithCountsRow[]
  const authorIds = [...new Set(postRows.map((post) => post.author_id).filter((id): id is string => Boolean(id)))]
  const { data: profiles } = authorIds.length > 0
    ? await gate.admin.from('profiles').select('id,username').in('id', authorIds)
    : { data: [] as ProfileRow[] }

  const usernameById = new Map(
    ((profiles ?? []) as ProfileRow[]).map((profile) => [profile.id, profile.username]),
  )
  const postById = new Map(postRows.map((post) => [post.id, post]))

  const rows = rankedPostIds
    .map((postId) => {
      const post = postById.get(postId)
      if (!post?.slug) return null

      return {
        post_id: post.id,
        title: post.title ?? '',
        slug: post.slug,
        author_id: post.author_id,
        author_username: post.author_id ? (usernameById.get(post.author_id) ?? null) : null,
        published_at: post.published_at,
        views: viewCounts.get(postId) ?? 0,
        comments: toCount(post.comments_count),
        reactions: toCount(post.reactions_count),
      }
    })
    .filter((row): row is NonNullable<typeof row> => Boolean(row))
    .slice(0, limit)

  return NextResponse.json(rows, { headers: { 'Cache-Control': 'no-store' } })
}

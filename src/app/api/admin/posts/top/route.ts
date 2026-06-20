import { NextResponse } from 'next/server'
import { requireAdminFromRequest } from '@/lib/admin/requireAdminFromRequest'

type PageviewPathRow = {
  path: string | null
  session_id: string | null
  user_id: string | null
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

function postSlugFromPath(path: string | null): string | null {
  if (!path?.startsWith('/post/')) return null

  const barePath = path.split(/[?#]/, 1)[0] ?? ''
  const rawSlug = barePath.slice('/post/'.length).replace(/\/+$/, '')
  if (!rawSlug || rawSlug.includes('/')) return null

  try {
    return decodeURIComponent(rawSlug)
  } catch {
    return rawSlug
  }
}

function readerKey(row: PageviewPathRow): string | null {
  if (row.user_id) return `user:${row.user_id}`
  if (row.session_id) return `session:${row.session_id}`
  return null
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

  // Count post paths in the selected window. We aggregate in the route so encoded
  // Hebrew slugs in older analytics rows still match the decoded DB slug.
  const { data: pageviews, error: pageviewsError } = await gate.admin
    .from('analytics_pageviews')
    .select('path,session_id,user_id')
    .like('path', '/post/%')
    .gte('created_at', start)
    .lt('created_at', end)
    .order('created_at', { ascending: false })
    .limit(100_000)

  if (pageviewsError) {
    return NextResponse.json({ error: pageviewsError.message }, { status: 500 })
  }

  const viewMap = new Map<string, Set<string>>()
  for (const row of (pageviews ?? []) as PageviewPathRow[]) {
    const slug = postSlugFromPath(row.path)
    const reader = readerKey(row)
    if (!slug || !reader) continue
    const readers = viewMap.get(slug) ?? new Set<string>()
    readers.add(reader)
    viewMap.set(slug, readers)
  }

  const viewCounts = new Map<string, number>()
  for (const [slug, readers] of viewMap.entries()) {
    viewCounts.set(slug, readers.size)
  }

  const rankedSlugs = [...viewCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([slug]) => slug)

  if (rankedSlugs.length === 0) {
    return NextResponse.json([], { headers: { 'Cache-Control': 'no-store' } })
  }

  const candidateSlugs = rankedSlugs.slice(0, Math.min(Math.max(limit * 10, 100), 1000))
  const { data: posts, error: postsError } = await gate.admin
    .from('posts_with_counts')
    .select('id,title,slug,author_id,published_at,comments_count,reactions_count')
    .in('slug', candidateSlugs)
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
  const postBySlug = new Map(postRows.map((post) => [post.slug, post]))

  const rows = rankedSlugs
    .map((slug) => {
      const post = postBySlug.get(slug)
      if (!post?.slug) return null

      return {
        post_id: post.id,
        title: post.title ?? '',
        slug: post.slug,
        author_id: post.author_id,
        author_username: post.author_id ? (usernameById.get(post.author_id) ?? null) : null,
        published_at: post.published_at,
        views: viewCounts.get(slug) ?? 0,
        comments: toCount(post.comments_count),
        reactions: toCount(post.reactions_count),
      }
    })
    .filter((row): row is NonNullable<typeof row> => Boolean(row))
    .slice(0, limit)

  return NextResponse.json(rows, { headers: { 'Cache-Control': 'no-store' } })
}

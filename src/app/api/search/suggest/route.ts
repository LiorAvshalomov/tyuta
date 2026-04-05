/**
 * GET /api/search/suggest?q=<query>
 *
 * Returns up to 3 published-post suggestions for autocomplete.
 * Ranking: reactions_count DESC (popularity), published_at DESC (recency tie-break).
 *
 * Two fast queries:
 *  1. posts_with_counts — ILIKE filter on title/excerpt, reactions_count already computed.
 *  2. profiles IN (≤3 ids) — author display names.
 *
 * Rate-limited: 40 req/min per IP.
 * CDN-cacheable: 10 s max-age, 30 s stale-while-revalidate (all 200 responses).
 */

import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { rateLimit } from '@/lib/rateLimit'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''

function serviceClient() {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) return null
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, { auth: { persistSession: false } })
}

function clientIp(req: NextRequest): string {
  const xff = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
  if (xff) return xff
  return req.headers.get('x-real-ip')?.trim() ?? 'unknown'
}

const MIN_CHARS = 2
const MAX_CHARS = 80 // 400 if exceeded

// Applied to every 200 response so CDN/browser caches autocomplete results.
const CACHE_HEADERS = { 'Cache-Control': 'public, max-age=10, stale-while-revalidate=30' }

const empty200 = NextResponse.json({ suggestions: [] }, { headers: CACHE_HEADERS })

export async function GET(req: NextRequest): Promise<NextResponse> {
  // ── rate limit ───────────────────────────────────────────────────────────
  const rl = await rateLimit(`suggest:${clientIp(req)}`, { maxRequests: 40, windowMs: 60_000 })
  if (!rl.allowed) {
    return NextResponse.json({ suggestions: [] }, { status: 429 })
  }

  // ── validate + normalize query ───────────────────────────────────────────
  // trim() + collapse internal whitespace runs to a single space
  const raw = (req.nextUrl.searchParams.get('q') ?? '').trim().replace(/\s+/g, ' ')

  if (raw.length < MIN_CHARS) return empty200
  if (raw.length > MAX_CHARS) {
    return NextResponse.json({ error: 'query_too_long' }, { status: 400 })
  }

  // Escape ILIKE metacharacters (%, _, \) so they match literally.
  // Strip commas to prevent .or() filter-string injection.
  const q = raw.replace(/[%_\\]/g, '\\$&').replace(/,/g, '')

  const supabase = serviceClient()
  if (!supabase) {
    return NextResponse.json({ error: 'not_configured' }, { status: 500 })
  }

  // ── query 1: posts ───────────────────────────────────────────────────────
  // Fetch 9 candidates so JS can re-rank by title match quality.
  // posts_with_counts computes reactions_count via correlated subquery —
  // acceptable cost for LIMIT 9 after an ILIKE filter on a small result set.
  // Filter: published only. The view already excludes soft-deleted rows.
  const { data: posts, error } = await supabase
    .from('posts_with_counts')
    .select('id, slug, title, cover_image_url, reactions_count, published_at, author_id')
    .eq('status', 'published')
    .or(`title.ilike.%${q}%,excerpt.ilike.%${q}%`)
    .order('reactions_count', { ascending: false })
    .order('published_at', { ascending: false, nullsFirst: false })
    .limit(9)

  if (error) {
    console.error('[suggest] db error:', error.message)
    return NextResponse.json({ suggestions: [] }, { status: 500 })
  }

  if (!posts || posts.length === 0) return empty200

  // ── query 2: author names ─────────────────────────────────────────────
  const authorIds = [...new Set(posts.map(p => p.author_id as string).filter(Boolean))]
  const { data: profiles } = await supabase
    .from('profiles')
    .select('id, display_name, username')
    .in('id', authorIds)

  type ProfileRow = { id: string; display_name: string | null; username: string | null }
  const profileMap = new Map<string, ProfileRow>(
    (profiles as ProfileRow[] | null ?? []).map(p => [p.id, p])
  )

  // ── re-rank by title match quality, then take top 3 ─────────────────────
  // Score: 3=exact  2=starts-with  1=contains  0=excerpt-only
  // Tiebreak: reactions_count DESC → published_at DESC
  const needle = raw.toLowerCase()
  function titleScore(title: string): number {
    const t = (title ?? '').toLowerCase()
    if (t === needle) return 3
    if (t.startsWith(needle)) return 2
    if (t.includes(needle)) return 1
    return 0
  }

  const ranked = [...posts]
    .map(row => ({ row, score: titleScore(row.title as string) }))
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score
      const rd = Number(b.row.reactions_count ?? 0) - Number(a.row.reactions_count ?? 0)
      if (rd !== 0) return rd
      return ((b.row.published_at as string | null) ?? '').localeCompare(
        (a.row.published_at as string | null) ?? ''
      )
    })
    .slice(0, 3)
    .map(({ row }) => row)

  // ── build response ────────────────────────────────────────────────────
  const suggestions = ranked.map(row => {
    const profile = profileMap.get(row.author_id as string)
    return {
      id: row.id as string,
      slug: row.slug as string,
      title: row.title as string,
      cover_image_url: (row.cover_image_url as string | null) ?? null,
      author_name: profile?.display_name ?? profile?.username ?? null,
      reactions_count: Number(row.reactions_count ?? 0),
      published_at: (row.published_at as string | null) ?? null,
    }
  })

  return NextResponse.json({ suggestions }, { headers: CACHE_HEADERS })
}

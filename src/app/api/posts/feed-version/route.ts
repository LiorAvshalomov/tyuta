import { NextResponse } from 'next/server'
import { getFeedVersionForPath, type FeedPath } from '@/lib/freshness/serverVersions'
import { rateLimit } from '@/lib/rateLimit'

export const dynamic = 'force-dynamic'
export const revalidate = 0

const FEED_PATHS = new Set<FeedPath>(['/', '/c/release', '/c/stories', '/c/magazine'])

function parseFeedPath(path: string | null): FeedPath | null {
  if (!path) return null
  return FEED_PATHS.has(path as FeedPath) ? (path as FeedPath) : null
}

export async function GET(req: Request) {
  const ip =
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    req.headers.get('x-real-ip') ||
    'unknown'
  const rl = await rateLimit(`feed-version:${ip}`, { maxRequests: 180, windowMs: 60_000 })
  if (!rl.allowed) {
    return NextResponse.json(
      { error: 'Too many requests' },
      { status: 429, headers: { 'Retry-After': String(Math.ceil(rl.retryAfterMs / 1000)) } },
    )
  }

  const url = new URL(req.url)
  const path = parseFeedPath(url.searchParams.get('path'))

  if (!path) {
    return NextResponse.json(
      { error: { code: 'invalid_path', message: 'invalid path' } },
      {
        status: 400,
        headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate' },
      },
    )
  }

  const version = await getFeedVersionForPath(path)

  return NextResponse.json({
    ok: true,
    version,
  }, {
    headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate' },
  })
}

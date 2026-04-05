import { NextResponse } from 'next/server'
import { getFeedVersionForPath, type FeedPath } from '@/lib/freshness/serverVersions'

export const dynamic = 'force-dynamic'
export const revalidate = 0

const FEED_PATHS = new Set<FeedPath>(['/', '/c/release', '/c/stories', '/c/magazine'])

function parseFeedPath(path: string | null): FeedPath | null {
  if (!path) return null
  return FEED_PATHS.has(path as FeedPath) ? (path as FeedPath) : null
}

export async function GET(req: Request) {
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

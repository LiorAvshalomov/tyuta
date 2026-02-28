import { NextRequest, NextResponse } from 'next/server'

/**
 * GET /api/media/cover?path=post-covers/<...>/cover.jpg
 *
 * Server-side proxy for Supabase public cover images.
 * Re-serves the upstream file with a 1-year Cache-Control header so that
 * Next.js Image Optimization caches the transformed variant for a full year
 * (Supabase storage otherwise returns max-age=3600, causing constant re-transforms).
 *
 * Security guards:
 *  - path must start with "post-covers/"
 *  - no ".." or "//" (traversal)
 *  - Content-Length / body checked against a 10 MB cap
 */

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''
const MAX_BYTES = 10 * 1024 * 1024 // 10 MB

// ── per-IP rate limit ────────────────────────────────────────────────────────
const WINDOW_MS = 60_000  // 1 minute
const MAX_RPS   = 200     // requests per window per IP

type RateEntry = { count: number; windowStart: number }
const rateMap = new Map<string, RateEntry>()

function isAllowed(ip: string): boolean {
  const now = Date.now()
  // Opportunistic cleanup: evict windows that have fully expired.
  // Keeps the Map bounded to the number of distinct IPs active in the last minute.
  for (const [key, entry] of rateMap) {
    if (now - entry.windowStart > WINDOW_MS) rateMap.delete(key)
  }
  const entry = rateMap.get(ip)
  if (!entry) {
    rateMap.set(ip, { count: 1, windowStart: now })
    return true
  }
  entry.count++
  return entry.count <= MAX_RPS
}

function clientIp(req: NextRequest): string {
  // x-forwarded-for is safe on Vercel: their edge always overwrites it before
  // the request reaches the route handler, so clients cannot spoof it.
  const xff = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
  if (xff) return xff
  const xri = req.headers.get('x-real-ip')?.trim()
  if (xri) return xri
  return 'unknown'
}
// ────────────────────────────────────────────────────────────────────────────

export async function GET(req: NextRequest): Promise<NextResponse> {
  const path = req.nextUrl.searchParams.get('path') ?? ''

  // ── validation ──────────────────────────────────────────────────────────
  if (!path.startsWith('post-covers/')) {
    return new NextResponse('Invalid path', { status: 400 })
  }
  if (path.includes('..') || path.includes('//')) {
    return new NextResponse('Invalid path', { status: 400 })
  }
  if (!SUPABASE_URL) {
    return new NextResponse('Storage not configured', { status: 500 })
  }

  // ── rate limit ───────────────────────────────────────────────────────────
  if (!isAllowed(clientIp(req))) {
    return new NextResponse('Too many requests', { status: 429 })
  }

  // ── fetch from Supabase storage ──────────────────────────────────────────
  const storageUrl = `${SUPABASE_URL}/storage/v1/object/public/${path}`

  let upstream: Response
  try {
    upstream = await fetch(storageUrl, { cache: 'no-store' })
  } catch {
    return new NextResponse('Upstream unavailable', { status: 502 })
  }

  if (!upstream.ok) {
    return new NextResponse('Not found', { status: upstream.status === 404 ? 404 : 502 })
  }

  // ── size guard (header) ──────────────────────────────────────────────────
  const cl = upstream.headers.get('content-length')
  if (cl !== null && parseInt(cl, 10) > MAX_BYTES) {
    return new NextResponse('Payload too large', { status: 413 })
  }

  const contentType = upstream.headers.get('content-type') ?? 'image/jpeg'
  const etag = upstream.headers.get('etag')

  // ── read body + size guard (actual bytes) ────────────────────────────────
  const body = await upstream.arrayBuffer()
  if (body.byteLength > MAX_BYTES) {
    return new NextResponse('Payload too large', { status: 413 })
  }

  // ── respond with long TTL ────────────────────────────────────────────────
  const headers: Record<string, string> = {
    'Content-Type': contentType,
    'Cache-Control': 'public, max-age=31536000, immutable',
  }
  if (etag) headers['ETag'] = etag

  return new NextResponse(body, { status: 200, headers })
}

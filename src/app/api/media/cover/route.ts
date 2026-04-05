import { NextRequest, NextResponse } from 'next/server'
import { validateImageBuffer } from '@/lib/validateImage'

/**
 * GET /api/media/cover?path=post-covers/<...>/cover.jpg
 *
 * Server-side proxy for Supabase public cover images.
 * Re-serves the upstream file with a 1-year Cache-Control header so that
 * browsers and CDNs cache covers for a full year
 * (Supabase storage otherwise returns max-age=3600).
 * Covers are NOT transformed — `<Image unoptimized>` is used at call sites.
 *
 * Security guards:
 *  - path must start with "post-covers/"
 *  - no ".." or "//" (traversal)
 *  - Content-Length / body checked against a 10 MB cap
 */

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''
const MAX_BYTES = 10 * 1024 * 1024 // 10 MB

// Only serve known-safe image types — reject SVG and anything else
const ALLOWED_SERVE_TYPES = new Set(['image/jpeg', 'image/png', 'image/gif', 'image/webp'])

// ── per-IP rate limit ────────────────────────────────────────────────────────
const WINDOW_MS = 60_000  // 1 minute
const MAX_RPS   = 200     // requests per window per IP

type RateEntry = { count: number; windowStart: number }
const rateMap = new Map<string, RateEntry>()

function isAllowed(ip: string): boolean {
  const now = Date.now()
  // Probabilistic cleanup (1% of requests): evict stale windows without
  // paying O(n) on every request. Map stays bounded to ~100 active IPs.
  if (Math.random() < 0.01) {
    for (const [key, entry] of rateMap) {
      if (now - entry.windowStart > WINDOW_MS) rateMap.delete(key)
    }
  }
  const entry = rateMap.get(ip)
  if (!entry || now - entry.windowStart > WINDOW_MS) {
    // No entry, or the previous window has fully elapsed — start a fresh window.
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

  const rawContentType = upstream.headers.get('content-type') ?? 'image/jpeg'
  const contentType = rawContentType.split(';')[0].trim().toLowerCase()

  if (!ALLOWED_SERVE_TYPES.has(contentType)) {
    return new NextResponse('Unsupported media type', { status: 415 })
  }

  const etag = upstream.headers.get('etag')

  // ── read body + size guard (actual bytes) ────────────────────────────────
  const body = await upstream.arrayBuffer()
  if (body.byteLength > MAX_BYTES) {
    return new NextResponse('Payload too large', { status: 413 })
  }

  // ── magic byte validation (defense-in-depth) ─────────────────────────────
  // Re-validates actual file content regardless of the upstream Content-Type
  // header, so files that bypassed upload validation (e.g. via a future admin
  // tool or direct storage write) are never served through this proxy.
  const byteCheck = validateImageBuffer(Buffer.from(body))
  if (!byteCheck.ok) {
    return new NextResponse('Invalid image content', { status: 415 })
  }

  // ── respond with long TTL ────────────────────────────────────────────────
  const headers: Record<string, string> = {
    'Content-Type': contentType,
    'Cache-Control': 'public, max-age=31536000, immutable',
    // Keep browser behavior unchanged, but make Vercel and intermediary CDNs
    // cache the proxy response explicitly instead of invoking compute on misses.
    'CDN-Cache-Control': 'public, max-age=86400, stale-while-revalidate=604800',
    'Vercel-CDN-Cache-Control': 'public, max-age=86400, stale-while-revalidate=604800',
    'X-Content-Type-Options': 'nosniff',
  }
  if (etag) headers['ETag'] = etag

  return new NextResponse(body, { status: 200, headers })
}

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
 *  - Content-Length / body checked against a 6 MB cap
 */

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''
const MAX_BYTES = 6 * 1024 * 1024 // 6 MB

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

import { NextRequest, NextResponse } from 'next/server'
import { enforceIpRateLimit } from '@/lib/requestRateLimit'
import { validateImageBuffer } from '@/lib/validateImage'

/**
 * GET /api/media/cover?path=post-covers/<...>/cover.jpg
 *
 * Server-side proxy for Supabase public cover images.
 * Re-serves the upstream file with a 1-year Cache-Control header so that
 * browsers and CDNs cache covers for a full year
 * (Supabase storage otherwise returns max-age=3600).
 * Covers are NOT transformed - `<Image unoptimized>` is used at call sites.
 *
 * Security guards:
 *  - path must start with "post-covers/"
 *  - no ".." or "//" (traversal)
 *  - Content-Length / body checked against a 10 MB cap
 */

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''
const MAX_BYTES = 10 * 1024 * 1024 // 10 MB

// Only serve known-safe image types - reject SVG and anything else
const ALLOWED_SERVE_TYPES = new Set(['image/jpeg', 'image/png', 'image/gif', 'image/webp'])

export async function GET(req: NextRequest): Promise<NextResponse> {
  const path = req.nextUrl.searchParams.get('path') ?? ''
  const noindex = req.nextUrl.searchParams.get('noindex') === '1'

  if (!path.startsWith('post-covers/')) {
    return new NextResponse('Invalid path', { status: 400 })
  }
  if (path.includes('..') || path.includes('//') || /[?#\s]/.test(path)) {
    return new NextResponse('Invalid path', { status: 400 })
  }
  if (!SUPABASE_URL) {
    return new NextResponse('Storage not configured', { status: 500 })
  }

  const rateLimitResponse = await enforceIpRateLimit(req, {
    scope: 'media_cover_read',
    maxRequests: 200,
    windowMs: 60_000,
    message: 'יותר מדי טעינות קאבר בזמן קצר. נסו שוב בעוד רגע.',
  })
  if (rateLimitResponse) {
    return rateLimitResponse
  }

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

  const body = await upstream.arrayBuffer()
  if (body.byteLength > MAX_BYTES) {
    return new NextResponse('Payload too large', { status: 413 })
  }

  // Re-validate actual file bytes so unsafe content never leaves the proxy.
  const byteCheck = validateImageBuffer(Buffer.from(body))
  if (!byteCheck.ok) {
    return new NextResponse('Invalid image content', { status: 415 })
  }

  const headers: Record<string, string> = {
    'Content-Type': byteCheck.mimeType,
    'Cache-Control': 'public, max-age=31536000, immutable',
    'CDN-Cache-Control': 'public, max-age=86400, stale-while-revalidate=604800',
    'Vercel-CDN-Cache-Control': 'public, max-age=86400, stale-while-revalidate=604800',
    'X-Content-Type-Options': 'nosniff',
  }
  if (noindex) headers['X-Robots-Tag'] = 'noindex, noimageindex'
  if (etag) headers['ETag'] = etag

  return new NextResponse(body, { status: 200, headers })
}

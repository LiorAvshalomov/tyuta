import { NextRequest, NextResponse } from 'next/server'
import { validateImageBuffer } from '@/lib/validateImage'

/**
 * GET /api/media/avatar?path=avatars/<user-id>/profile.jpg
 *
 * Server-side proxy for Supabase public avatar images.
 * Re-serves the upstream file with a long-lived cache header so the browser
 * and local image optimizer avoid repeated hits to Supabase storage.
 *
 * Security guards:
 *  - path must start with "avatars/"
 *  - no ".." or "//" (traversal)
 *  - Content-Length / body checked against a conservative cap
 *  - MIME type allowlist (blocks SVG and unknown types)
 *  - Magic-byte validation (never trusts upstream Content-Type)
 *  - X-Content-Type-Options: nosniff
 */

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''
const MAX_BYTES = 5 * 1024 * 1024 // 5 MB
const ALLOWED_CONTENT_TYPES = new Set(['image/jpeg', 'image/png', 'image/gif', 'image/webp'])

export async function GET(req: NextRequest): Promise<NextResponse> {
  const path = req.nextUrl.searchParams.get('path') ?? ''

  if (!path.startsWith('avatars/')) {
    return new NextResponse('Invalid path', { status: 400 })
  }
  if (path.includes('..') || path.includes('//')) {
    return new NextResponse('Invalid path', { status: 400 })
  }
  if (!SUPABASE_URL) {
    return new NextResponse('Storage not configured', { status: 500 })
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

  const rawContentType = (upstream.headers.get('content-type') ?? '').split(';')[0].trim().toLowerCase()
  const etag = upstream.headers.get('etag')
  const body = await upstream.arrayBuffer()

  if (body.byteLength > MAX_BYTES) {
    return new NextResponse('Payload too large', { status: 413 })
  }

  // Validate actual image bytes — never trust Content-Type from upstream
  const imageCheck = validateImageBuffer(Buffer.from(body))
  if (!imageCheck.ok) {
    return new NextResponse('Invalid image', { status: 415 })
  }

  // Block SVG and any MIME type not on the allowlist
  if (!ALLOWED_CONTENT_TYPES.has(imageCheck.mimeType)) {
    return new NextResponse('Unsupported media type', { status: 415 })
  }

  // Prefer the magic-byte-derived MIME type over the upstream header
  const contentType = ALLOWED_CONTENT_TYPES.has(rawContentType) ? rawContentType : imageCheck.mimeType

  const headers: Record<string, string> = {
    'Content-Type': contentType,
    'Cache-Control': 'public, max-age=31536000, immutable',
    'CDN-Cache-Control': 'public, max-age=31536000, immutable',
    'Vercel-CDN-Cache-Control': 'public, max-age=31536000, immutable',
    'X-Content-Type-Options': 'nosniff',
  }
  if (etag) headers['ETag'] = etag

  return new NextResponse(body, { status: 200, headers })
}

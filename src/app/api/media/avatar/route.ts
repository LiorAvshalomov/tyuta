import { NextRequest, NextResponse } from 'next/server'

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
 */

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''
const MAX_BYTES = 5 * 1024 * 1024 // 5 MB

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

  const contentType = upstream.headers.get('content-type') ?? 'image/jpeg'
  const etag = upstream.headers.get('etag')
  const body = await upstream.arrayBuffer()

  if (body.byteLength > MAX_BYTES) {
    return new NextResponse('Payload too large', { status: 413 })
  }

  const headers: Record<string, string> = {
    'Content-Type': contentType,
    'Cache-Control': 'public, max-age=31536000, immutable',
  }
  if (etag) headers['ETag'] = etag

  return new NextResponse(body, { status: 200, headers })
}

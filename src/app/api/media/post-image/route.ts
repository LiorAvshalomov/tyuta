import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { postImageStoragePath } from '@/lib/postImageUrl'
import { validateImageBuffer } from '@/lib/validateImage'

export const runtime = 'nodejs'

/**
 * GET /api/media/post-image?postId=<uuid>&path=<user-id>/<post-id>/<file>
 *
 * Server-side proxy for inline post images stored in the private `post-assets`
 * bucket. Access is allowed only for images that are referenced by a published
 * post, so expired signed URLs do not break old posts.
 */

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''
const MAX_BYTES = 10 * 1024 * 1024 // 10 MB
const POST_ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const WINDOW_MS = 60_000
const MAX_RPS = 120

type RateEntry = { count: number; windowStart: number }
const rateMap = new Map<string, RateEntry>()

type PublishedPostRow = {
  id: string
  content_json: unknown
}

function isAllowed(ip: string): boolean {
  const now = Date.now()

  if (Math.random() < 0.01) {
    for (const [key, entry] of rateMap) {
      if (now - entry.windowStart > WINDOW_MS) rateMap.delete(key)
    }
  }

  const entry = rateMap.get(ip)
  if (!entry || now - entry.windowStart > WINDOW_MS) {
    rateMap.set(ip, { count: 1, windowStart: now })
    return true
  }

  entry.count++
  return entry.count <= MAX_RPS
}

function clientIp(req: NextRequest): string {
  const xff = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
  if (xff) return xff

  const xri = req.headers.get('x-real-ip')?.trim()
  if (xri) return xri

  return 'unknown'
}

function isValidPath(path: string, postId: string): boolean {
  if (!path || path.includes('..') || path.includes('//')) return false

  const parts = path.split('/').filter(Boolean)
  return parts.length >= 3 && parts[1] === postId
}

function contentHasImagePath(content: unknown, targetPath: string): boolean {
  const walk = (node: unknown): boolean => {
    if (!node || typeof node !== 'object') return false

    const current = node as {
      type?: string
      attrs?: Record<string, unknown>
      content?: unknown[]
    }

    const nodePath = postImageStoragePath(
      typeof current.attrs?.path === 'string' ? current.attrs.path : null,
      typeof current.attrs?.src === 'string' ? current.attrs.src : null,
    )
    if (current.type === 'image' && nodePath === targetPath) return true
    if (!Array.isArray(current.content)) return false

    return current.content.some(walk)
  }

  return walk(content)
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  const path = req.nextUrl.searchParams.get('path') ?? ''
  const postId = req.nextUrl.searchParams.get('postId') ?? ''

  if (!POST_ID_RE.test(postId)) {
    return new NextResponse('Invalid postId', { status: 400 })
  }
  if (!isValidPath(path, postId)) {
    return new NextResponse('Invalid path', { status: 400 })
  }
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return new NextResponse('Storage not configured', { status: 500 })
  }
  if (!isAllowed(clientIp(req))) {
    return new NextResponse('Too many requests', { status: 429 })
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  })

  const { data: post, error: postError } = await supabase
    .from('posts')
    .select('id, content_json')
    .eq('id', postId)
    .eq('status', 'published')
    .is('deleted_at', null)
    .maybeSingle<PublishedPostRow>()

  if (postError) {
    return new NextResponse('Post lookup failed', { status: 502 })
  }
  if (!post || !contentHasImagePath(post.content_json, path)) {
    return new NextResponse('Not found', { status: 404 })
  }

  const { data, error } = await supabase.storage.from('post-assets').download(path)
  if (error || !data) {
    return new NextResponse('Not found', { status: error?.message?.toLowerCase().includes('not found') ? 404 : 502 })
  }
  if (data.size > MAX_BYTES) {
    return new NextResponse('Payload too large', { status: 413 })
  }

  const body = await data.arrayBuffer()
  if (body.byteLength > MAX_BYTES) {
    return new NextResponse('Payload too large', { status: 413 })
  }

  const validated = validateImageBuffer(Buffer.from(body))
  if (!validated.ok) {
    return new NextResponse('Invalid image content', { status: 415 })
  }

  return new NextResponse(body, {
    status: 200,
    headers: {
      'Content-Type': validated.mimeType,
      'Cache-Control': 'public, max-age=31536000, immutable',
      // Keep browser semantics unchanged, but let shared caches absorb
      // repeated public reads without holding removed content for too long.
      'CDN-Cache-Control': 'public, max-age=300, stale-while-revalidate=3600',
      'Vercel-CDN-Cache-Control': 'public, max-age=300, stale-while-revalidate=3600',
      'X-Content-Type-Options': 'nosniff',
    },
  })
}

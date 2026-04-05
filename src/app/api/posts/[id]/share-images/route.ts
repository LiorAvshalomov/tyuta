import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import { requireUserFromRequest } from '@/lib/auth/requireUserFromRequest'
import { rateLimit } from '@/lib/rateLimit'
import { extractText } from '@/lib/share-images/extractText'
import { splitSlides } from '@/lib/share-images/splitSlides'
import { renderCard } from '@/lib/share-images/renderer'

// Vercel: keep Node.js runtime (resvg-js uses native .node binary)
export const runtime = 'nodejs'

// Prevent Next.js from statically analysing this route
export const dynamic = 'force-dynamic'

// Text density limits tuned for literary cards: preserve paragraph rhythm and hard breaks.
const MAX_UNITS_SQUARE = 900
const MAX_UNITS_PORTRAIT = 1200
const MAX_UNITS_STORY = 1600

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  // Auth
  const auth = await requireUserFromRequest(req)
  if (!auth.ok) return auth.response

  // Rate limit: 10 renders per minute per user (each slide is one request)
  const rl = await rateLimit(`share-img:${auth.user.id}`, { maxRequests: 10, windowMs: 60_000 })
  if (!rl.allowed) {
    return NextResponse.json(
      { error: { code: 'rate_limited', message: 'יותר מדי בקשות. נסה שוב בעוד רגע.' } },
      {
        status: 429,
        headers: { 'Retry-After': String(Math.ceil(rl.retryAfterMs / 1000)) },
      },
    )
  }

  const { id } = await ctx.params
  const postId = (id ?? '').toString().trim()
  if (!postId) {
    return NextResponse.json({ error: { code: 'bad_request', message: 'missing post id' } }, { status: 400 })
  }

  // Parse query params
  const { searchParams } = req.nextUrl
  const slideParam = parseInt(searchParams.get('slide') ?? '1', 10)
  const theme = searchParams.get('theme') === 'dark' ? 'dark' : 'light'
  const formatParam = searchParams.get('format')
  const format = formatParam === 'story'
    ? 'story'
    : formatParam === 'portrait'
      ? 'portrait'
      : 'square'
  const align = searchParams.get('align') === 'center' ? 'center' : 'right'

  // Validate post: must be published, not deleted, owned by requester
  const { data: post, error: postErr } = await auth.supabase
    .from('posts')
    .select('id, author_id, title, content_json, status, deleted_at')
    .eq('id', postId)
    .maybeSingle()

  if (postErr) {
    return NextResponse.json({ error: { code: 'db_error', message: postErr.message } }, { status: 500 })
  }
  if (!post) {
    return NextResponse.json({ error: { code: 'not_found', message: 'post not found' } }, { status: 404 })
  }
  if (post.author_id !== auth.user.id) {
    return NextResponse.json({ error: { code: 'forbidden', message: 'not your post' } }, { status: 403 })
  }
  if (post.status !== 'published') {
    return NextResponse.json({ error: { code: 'bad_request', message: 'only published posts can be shared' } }, { status: 400 })
  }
  if (post.deleted_at) {
    return NextResponse.json({ error: { code: 'bad_request', message: 'post is deleted' } }, { status: 400 })
  }

  // Extract text from TipTap JSON
  const rawContent = post.content_json as Record<string, unknown> | null
  if (!rawContent) {
    return NextResponse.json({ error: { code: 'bad_request', message: 'post has no content' } }, { status: 400 })
  }

  const plainText = extractText(rawContent as Parameters<typeof extractText>[0])
  if (!plainText.trim()) {
    return NextResponse.json({ error: { code: 'bad_request', message: 'post has no readable text' } }, { status: 400 })
  }

  const maxUnitsPerSlide = format === 'story'
    ? MAX_UNITS_STORY
    : format === 'portrait'
      ? MAX_UNITS_PORTRAIT
      : MAX_UNITS_SQUARE
  const title = (post.title as string | null | undefined) ?? ''
  const { slides } = splitSlides(plainText, { maxUnitsPerSlide, format, title })
  const slideTotal = slides.length

  // Resolve slide index (1-based, clamped)
  const slideIndex = Math.max(1, Math.min(slideParam, slideTotal))
  const slide = slides[slideIndex - 1]

  // Resolve author display name (separate query avoids multi-FK ambiguity)
  const { data: profile } = await auth.supabase
    .from('profiles')
    .select('display_name, username')
    .eq('id', post.author_id)
    .maybeSingle()
  const authorName = profile?.display_name || profile?.username || 'טיוטה'

  // Render PNG
  let png: Buffer
  try {
    png = renderCard({
      text: slide.text,
      fontSize: slide.fontSize,
      title,
      authorName,
      slideIndex,
      slideTotal,
      theme,
      format,
      align,
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'render error'
    return NextResponse.json({ error: { code: 'render_error', message: msg } }, { status: 500 })
  }

  const filename = `tyuta-${postId.slice(0, 8)}-${slideIndex}.png`

  return new NextResponse(new Uint8Array(png), {
    status: 200,
    headers: {
      'Content-Type': 'image/png',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'private, no-store',
      'X-Slide-Index': String(slideIndex),
      'X-Slide-Total': String(slideTotal),
    },
  })
}

/**
 * Returns slide metadata (count, preview text) without rendering — used by the modal
 * to know how many slides exist before fetching images.
 * Accepts ?format=square|story so counts are format-accurate.
 */
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireUserFromRequest(req)
  if (!auth.ok) return auth.response

  const { id } = await ctx.params
  const postId = (id ?? '').toString().trim()
  if (!postId) {
    return NextResponse.json({ error: { code: 'bad_request', message: 'missing post id' } }, { status: 400 })
  }

  const { searchParams } = req.nextUrl
  const formatParam = searchParams.get('format')
  const format = formatParam === 'story'
    ? 'story'
    : formatParam === 'portrait'
      ? 'portrait'
      : 'square'

  const { data: post, error: postErr } = await auth.supabase
    .from('posts')
    .select('id, author_id, title, content_json, status, deleted_at')
    .eq('id', postId)
    .maybeSingle()

  if (postErr) return NextResponse.json({ error: { code: 'db_error', message: postErr.message } }, { status: 500 })
  if (!post) return NextResponse.json({ error: { code: 'not_found' } }, { status: 404 })
  if (post.author_id !== auth.user.id) return NextResponse.json({ error: { code: 'forbidden' } }, { status: 403 })
  if (post.status !== 'published' || post.deleted_at) {
    return NextResponse.json({ error: { code: 'bad_request', message: 'post not eligible' } }, { status: 400 })
  }

  const rawContent = post.content_json as Record<string, unknown> | null
  if (!rawContent) return NextResponse.json({ slideTotal: 0 })

  const plainText = extractText(rawContent as Parameters<typeof extractText>[0])
  const maxUnitsPerSlide = format === 'story'
    ? MAX_UNITS_STORY
    : format === 'portrait'
      ? MAX_UNITS_PORTRAIT
      : MAX_UNITS_SQUARE
  const title = (post.title as string | null | undefined) ?? ''
  const { slides, truncated } = splitSlides(plainText, { maxUnitsPerSlide, format, title })

  return NextResponse.json({
    slideTotal: slides.length,
    truncated,
    slides: slides.map((s, i) => ({ index: i + 1, preview: s.text.slice(0, 60) })),
  })
}

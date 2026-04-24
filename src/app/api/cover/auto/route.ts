import { NextRequest, NextResponse } from 'next/server'
import { requireUserFromRequest } from '@/lib/auth/requireUserFromRequest'
import { rateLimit } from '@/lib/rateLimit'
import { buildRateLimitResponse } from '@/lib/requestRateLimit'
import { validateImageBuffer } from '@/lib/validateImage'

const MAX_DOWNLOAD_BYTES = 15 * 1024 * 1024 // 15 MB
const POST_ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

type PixabayHit = {
  id: number
  largeImageURL: string
  tags: string
  user: string
}


async function translateToEnglish(text: string): Promise<string> {
  const key = process.env.DEEPL_API_KEY
  if (!key) throw new Error('DEEPL_API_KEY missing')
    

  const res = await fetch('https://api-free.deepl.com/v2/translate', {
    method: 'POST',
    headers: {
      'Authorization': `DeepL-Auth-Key ${key}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      text,
      target_lang: 'EN',
      source_lang: 'HE',
    }),
  })

  const json = await res.json()
  return json.translations?.[0]?.text ?? text
}

function parseSeed(value: string | null): number {
  const parsed = Number(value ?? Date.now())
  return Number.isFinite(parsed) ? parsed : Date.now()
}

function responseContentLengthTooLarge(headers: Headers): boolean {
  const raw = headers.get('content-length')
  if (!raw) return false
  const length = Number(raw)
  return Number.isFinite(length) && length > MAX_DOWNLOAD_BYTES
}

export async function GET(req: NextRequest) {
  // N4 FIX: Always require auth — this endpoint consumes paid third-party APIs
  const authResult = await requireUserFromRequest(req)
  if (!authResult.ok) {
    return NextResponse.json({ error: 'auth_required' }, { status: 401 })
  }

  // Rate limit: 20 requests per 60 seconds per user
  const rl = await rateLimit(`cover-auto:${authResult.user.id}`, { maxRequests: 20, windowMs: 60_000 })
  if (!rl.allowed) {
    return buildRateLimitResponse('יותר מדי בקשות. נסו שוב בעוד רגע.', rl.retryAfterMs)
  }

  const pixabayKey = process.env.PIXABAY_API_KEY
  if (!pixabayKey) {
    return NextResponse.json({ error: 'PIXABAY_API_KEY missing' }, { status: 500 })
  }

  const { searchParams } = new URL(req.url)
  const qHebrew = (searchParams.get('q') ?? '').trim().slice(0, 200)
  const seed = parseSeed(searchParams.get('seed'))
  const postId = searchParams.get('postId')

  if (!qHebrew) {
    return NextResponse.json({ url: null })
  }

  try {
    const translated = await translateToEnglish(qHebrew)
    

    const url = new URL('https://pixabay.com/api/')
    url.searchParams.set('key', pixabayKey)
    url.searchParams.set('q', translated)
    url.searchParams.set('image_type', 'photo')
    url.searchParams.set('orientation', 'horizontal')
    url.searchParams.set('per_page', '20')
    url.searchParams.set('safesearch', 'true')

    const res = await fetch(url.toString(), { cache: 'no-store' })
    if (!res.ok) {
      return NextResponse.json({ error: 'pixabay_error' }, { status: 502 })
    }

    const json = (await res.json()) as { hits?: PixabayHit[] }
    const hits = json.hits ?? []

    if (hits.length === 0) {
      return NextResponse.json({ url: null })
    }

    
    const idx = Math.abs(seed) % hits.length
    const pick = hits[idx]

    // If postId provided, download image and upload to private storage
    if (postId) {
      // Reject malformed postId before any DB/storage access
      if (!POST_ID_RE.test(postId)) {
        return NextResponse.json({ storagePath: null, signedUrl: null })
      }

      const { user, supabase: scopedClient } = authResult

      // Verify post ownership via RLS (only returns rows where author_id = auth.uid())
      const { data: post } = await scopedClient
        .from('posts')
        .select('id')
        .eq('id', postId)
        .single()

      if (!post) {
        return NextResponse.json({ storagePath: null, signedUrl: null })
      }

      try {
        const imgRes = await fetch(pick.largeImageURL, { cache: 'no-store' })
        if (!imgRes.ok) {
          return NextResponse.json({ storagePath: null, signedUrl: null })
        }
        if (responseContentLengthTooLarge(imgRes.headers)) {
          return NextResponse.json({ storagePath: null, signedUrl: null })
        }
        const blob = await imgRes.blob()

        // Enforce size limit before buffering into memory
        if (blob.size > MAX_DOWNLOAD_BYTES) {
          return NextResponse.json({ storagePath: null, signedUrl: null })
        }

        // Validate actual image bytes — never trust Content-Type from third parties
        const inputBuffer = Buffer.from(await blob.arrayBuffer())
        const imageCheck = validateImageBuffer(inputBuffer)
        if (!imageCheck.ok) {
          return NextResponse.json({ storagePath: null, signedUrl: null })
        }

        const uuid = crypto.randomUUID()
        const storagePath = `${user.id}/${postId}/cover-${uuid}.jpg`

        const { error: uploadErr } = await scopedClient.storage
          .from('post-assets')
          .upload(storagePath, inputBuffer, {
            upsert: false,
            contentType: imageCheck.mimeType,
          })

        if (uploadErr) {
          return NextResponse.json({ storagePath: null, signedUrl: null })
        }

        const { data: signed } = await scopedClient.storage
          .from('post-assets')
          .createSignedUrl(storagePath, 3600)

        return NextResponse.json({
          storagePath,
          signedUrl: signed?.signedUrl ?? null,
        })
      } catch {
        return NextResponse.json({ storagePath: null, signedUrl: null })
      }
    }

    return NextResponse.json({
      url: pick.largeImageURL,
      source: 'pixabay',
      alt: pick.tags,
      author: pick.user,
      translatedQuery: translated,
    })
  } catch {
    return NextResponse.json({ error: 'server_error' }, { status: 500 })
  }
}

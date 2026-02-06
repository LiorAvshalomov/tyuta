import { NextResponse } from 'next/server'
import { requireUserFromRequest } from '@/lib/auth/requireUserFromRequest'

type PixabayHit = {
  id: number
  largeImageURL: string
  tags: string
  user: string
}

type CacheEntry<T> = { value: T; ts: number }
const CACHE_TTL = 600_000 // 10 minutes
const CACHE_MAX = 200

const deeplCache = new Map<string, CacheEntry<string>>()
const pixabayCache = new Map<string, CacheEntry<PixabayHit[]>>()

function cacheGet<T>(map: Map<string, CacheEntry<T>>, key: string): T | undefined {
  const entry = map.get(key)
  if (!entry) return undefined
  if (Date.now() - entry.ts > CACHE_TTL) { map.delete(key); return undefined }
  return entry.value
}

function cacheSet<T>(map: Map<string, CacheEntry<T>>, key: string, value: T): void {
  if (map.size >= CACHE_MAX) {
    for (const k of map.keys()) { map.delete(k); break }
  }
  map.set(key, { value, ts: Date.now() })
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

export async function GET(req: Request) {
  const pixabayKey = process.env.PIXABAY_API_KEY
  if (!pixabayKey) {
    return NextResponse.json({ error: 'PIXABAY_API_KEY missing' }, { status: 500 })
  }

  const { searchParams } = new URL(req.url)
  const qHebrew = (searchParams.get('q') ?? '').trim()
  const seed = Number(searchParams.get('seed') ?? Date.now())
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
      const authResult = await requireUserFromRequest(req)
      if (!authResult.ok) {
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
        const imgRes = await fetch(pick.largeImageURL)
        if (!imgRes.ok) {
          return NextResponse.json({ storagePath: null, signedUrl: null })
        }
        const blob = await imgRes.blob()
        const uuid = crypto.randomUUID()
        const storagePath = `${user.id}/${postId}/cover-${uuid}.jpg`

        const { error: uploadErr } = await scopedClient.storage
          .from('post-assets')
          .upload(storagePath, blob, {
            upsert: false,
            contentType: blob.type || 'image/jpeg',
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
  } catch (e) {
    return NextResponse.json({ error: 'server_error' }, { status: 500 })
  }
}

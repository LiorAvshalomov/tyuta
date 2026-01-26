import { NextResponse } from 'next/server'

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

export async function GET(req: Request) {
  const pixabayKey = process.env.PIXABAY_API_KEY
  if (!pixabayKey) {
    return NextResponse.json({ error: 'PIXABAY_API_KEY missing' }, { status: 500 })
  }

  const { searchParams } = new URL(req.url)
  const qHebrew = (searchParams.get('q') ?? '').trim()
  const seed = Number(searchParams.get('seed') ?? Date.now())

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

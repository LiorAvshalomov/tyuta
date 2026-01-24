import { NextResponse } from 'next/server'

type PexelsPhoto = {
  id: number
  url: string
  photographer: string
  alt: string
  src: { medium: string; large: string; large2x: string; original: string }
}

export async function GET(req: Request) {
  const apiKey = process.env.PEXELS_API_KEY
  if (!apiKey) {
    return NextResponse.json({ error: 'PEXELS_API_KEY missing' }, { status: 500 })
  }

  const { searchParams } = new URL(req.url)
  const q = (searchParams.get('q') ?? '').trim() || 'writing'
  const seedRaw = searchParams.get('seed')
  const seed = seedRaw ? Number(seedRaw) : Date.now()

  try {
    const url = new URL('https://api.pexels.com/v1/search')
    url.searchParams.set('query', q)
    url.searchParams.set('per_page', '20')
    url.searchParams.set('orientation', 'landscape')

    const res = await fetch(url.toString(), {
      headers: { Authorization: apiKey },
      // Avoid caching so "replace" gets a different image
      cache: 'no-store',
    })

    if (!res.ok) {
      return NextResponse.json({ error: 'pexels_error' }, { status: 502 })
    }

    const json = (await res.json()) as { photos?: PexelsPhoto[] }
    const photos = json.photos ?? []
    if (photos.length === 0) {
      return NextResponse.json({ url: null })
    }

    // deterministic selection by seed
    const idx = Math.abs(seed) % photos.length
    const pick = photos[idx]

    return NextResponse.json({
      url: pick.src.large2x || pick.src.large || pick.src.original,
      photographer: pick.photographer,
      pexelsUrl: pick.url,
      alt: pick.alt,
      id: pick.id,
    })
  } catch {
    return NextResponse.json({ error: 'server_error' }, { status: 500 })
  }
}

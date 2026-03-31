import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'
export const revalidate = 0

type FeedPath = '/' | '/c/release' | '/c/stories' | '/c/magazine'

const FEED_PATHS = new Set<FeedPath>(['/', '/c/release', '/c/stories', '/c/magazine'])

function parseFeedPath(path: string | null): FeedPath | null {
  if (!path) return null
  return FEED_PATHS.has(path as FeedPath) ? (path as FeedPath) : null
}

function channelSlugForPath(path: FeedPath) {
  if (path === '/c/release') return 'release'
  if (path === '/c/stories') return 'stories'
  if (path === '/c/magazine') return 'magazine'
  return null
}

export async function GET(req: Request) {
  const url = new URL(req.url)
  const path = parseFeedPath(url.searchParams.get('path'))

  if (!path) {
    return NextResponse.json(
      { error: { code: 'invalid_path', message: 'invalid path' } },
      {
        status: 400,
        headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate' },
      },
    )
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!supabaseUrl || !key) {
    return NextResponse.json(
      { error: { code: 'server_env', message: 'missing server env' } },
      {
        status: 500,
        headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate' },
      },
    )
  }

  const supabase = createClient(supabaseUrl, key, {
    auth: { persistSession: false },
  })

  const channelSlug = channelSlugForPath(path)
  let channelId: number | null = null

  if (channelSlug) {
    const { data: channel, error: channelError } = await supabase
      .from('channels')
      .select('id')
      .eq('slug', channelSlug)
      .maybeSingle<{ id: number }>()

    if (channelError) {
      return NextResponse.json(
        { error: { code: 'channel_lookup_failed', message: channelError.message } },
        {
          status: 500,
          headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate' },
        },
      )
    }

    channelId = channel?.id ?? null
  }

  let query = supabase
    .from('posts')
    .select('published_at, created_at')
    .is('deleted_at', null)
    .eq('status', 'published')
    .order('published_at', { ascending: false, nullsFirst: false })
    .order('created_at', { ascending: false })
    .limit(1)

  if (channelId != null) {
    query = query.eq('channel_id', channelId)
  }

  const { data, error } = await query.maybeSingle<{
    published_at: string | null
    created_at: string
  }>()

  if (error) {
    return NextResponse.json(
      { error: { code: 'feed_version_failed', message: error.message } },
      {
        status: 500,
        headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate' },
      },
    )
  }

  return NextResponse.json({
    ok: true,
    version: data?.published_at ?? data?.created_at ?? null,
  }, {
    headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate' },
  })
}

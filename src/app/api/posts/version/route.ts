import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { rateLimit } from '@/lib/rateLimit'

export const dynamic = 'force-dynamic'
export const revalidate = 0

function normalizeSlug(value: string | null) {
  if (!value) return null
  const trimmed = value.trim()
  return trimmed ? trimmed : null
}

function pickLatestVersion(...versions: Array<string | null | undefined>) {
  let latest: string | null = null

  for (const version of versions) {
    if (!version) continue
    if (!latest || version > latest) latest = version
  }

  return latest
}

export async function GET(req: Request) {
  const ip =
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    req.headers.get('x-real-ip') ||
    'unknown'
  const rl = await rateLimit(`posts-version:${ip}`, { maxRequests: 240, windowMs: 60_000 })
  if (!rl.allowed) {
    return NextResponse.json(
      { error: 'Too many requests' },
      { status: 429, headers: { 'Retry-After': String(Math.ceil(rl.retryAfterMs / 1000)) } },
    )
  }

  const url = new URL(req.url)
  const slug = normalizeSlug(url.searchParams.get('slug'))

  if (!slug) {
    return NextResponse.json(
      { error: { code: 'invalid_slug', message: 'invalid slug' } },
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

  const { data: post, error: postError } = await supabase
    .from('posts')
    .select('author_id, channel_id, updated_at, published_at, created_at')
    .eq('slug', slug)
    .eq('status', 'published')
    .is('deleted_at', null)
    .maybeSingle<{ author_id: string | null; channel_id: number | null; updated_at: string | null; published_at: string | null; created_at: string }>()

  if (postError) {
    return NextResponse.json(
      { error: { code: 'post_lookup_failed', message: postError.message } },
      {
        status: 500,
        headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate' },
      },
    )
  }

  if (!post) {
    return NextResponse.json(
      { ok: true, version: null },
      { headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate' } },
    )
  }

  const [authorProfileRes, authorPostsRes, channelPostsRes, globalProfileRes] = await Promise.all([
    post.author_id
      ? supabase
          .from('profiles')
          .select('updated_at')
          .eq('id', post.author_id)
          .maybeSingle<{ updated_at: string | null }>()
      : Promise.resolve({ data: null, error: null }),
    post.author_id
      ? supabase
          .from('posts')
          .select('updated_at, published_at, created_at')
          .eq('author_id', post.author_id)
          .eq('status', 'published')
          .is('deleted_at', null)
          .order('updated_at', { ascending: false, nullsFirst: false })
          .order('published_at', { ascending: false, nullsFirst: false })
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle<{ updated_at: string | null; published_at: string | null; created_at: string }>()
      : Promise.resolve({ data: null, error: null }),
    post.channel_id != null
      ? supabase
          .from('posts')
          .select('updated_at, published_at, created_at')
          .eq('channel_id', post.channel_id)
          .eq('status', 'published')
          .is('deleted_at', null)
          .order('updated_at', { ascending: false, nullsFirst: false })
          .order('published_at', { ascending: false, nullsFirst: false })
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle<{ updated_at: string | null; published_at: string | null; created_at: string }>()
      : Promise.resolve({ data: null, error: null }),
    supabase
      .from('profiles')
      .select('updated_at')
      .order('updated_at', { ascending: false, nullsFirst: false })
      .limit(1)
      .maybeSingle<{ updated_at: string | null }>(),
  ])

  const authorProfileError = authorProfileRes.error
  if (authorProfileError) {
    return NextResponse.json(
      { error: { code: 'post_author_version_failed', message: authorProfileError.message } },
      {
        status: 500,
        headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate' },
      },
    )
  }

  if (authorPostsRes.error) {
    return NextResponse.json(
      { error: { code: 'post_author_posts_version_failed', message: authorPostsRes.error.message } },
      {
        status: 500,
        headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate' },
      },
    )
  }

  if (channelPostsRes.error) {
    return NextResponse.json(
      { error: { code: 'post_channel_version_failed', message: channelPostsRes.error.message } },
      {
        status: 500,
        headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate' },
      },
    )
  }

  if (globalProfileRes.error) {
    return NextResponse.json(
      { error: { code: 'global_profile_version_failed', message: globalProfileRes.error.message } },
      {
        status: 500,
        headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate' },
      },
    )
  }

  return NextResponse.json(
    {
      ok: true,
      version: pickLatestVersion(
        post.updated_at ?? null,
        post.published_at ?? null,
        post.created_at ?? null,
        authorProfileRes.data?.updated_at ?? null,
        authorPostsRes.data?.updated_at ?? null,
        authorPostsRes.data?.published_at ?? null,
        authorPostsRes.data?.created_at ?? null,
        channelPostsRes.data?.updated_at ?? null,
        channelPostsRes.data?.published_at ?? null,
        channelPostsRes.data?.created_at ?? null,
        globalProfileRes.data?.updated_at ?? null,
      ),
    },
    { headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate' } },
  )
}

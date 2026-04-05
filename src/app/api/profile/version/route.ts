import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'
export const revalidate = 0

type ProfilePath =
  | { type: 'global' }
  | { type: 'user'; username: string }

function normalizeUsername(value: string) {
  const trimmed = value.trim()
  return trimmed ? trimmed : null
}

function parseProfilePath(path: string | null): ProfilePath | null {
  if (!path) return null
  if (path === '/notes' || path === '/search') return { type: 'global' }

  if (path.startsWith('/u/')) {
    const segments = path.split('/').filter(Boolean)
    if (segments.length >= 2) {
      let decoded: string
      try {
        decoded = decodeURIComponent(segments[1] ?? '')
      } catch {
        return null
      }
      const username = normalizeUsername(decoded)
      if (username) return { type: 'user', username }
    }
  }

  return null
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
  const url = new URL(req.url)
  const parsedPath = parseProfilePath(url.searchParams.get('path'))

  if (!parsedPath) {
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

  if (parsedPath.type === 'global') {
    const { data, error } = await supabase
      .from('profiles')
      .select('updated_at')
      .order('updated_at', { ascending: false, nullsFirst: false })
      .limit(1)
      .maybeSingle<{ updated_at: string | null }>()

    if (error) {
      return NextResponse.json(
        { error: { code: 'profile_version_failed', message: error.message } },
        {
          status: 500,
          headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate' },
        },
      )
    }

    return NextResponse.json(
      { ok: true, version: data?.updated_at ?? null },
      { headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate' } },
    )
  }

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('id, updated_at')
    .eq('username', parsedPath.username)
    .maybeSingle<{ id: string; updated_at: string | null }>()

  if (profileError) {
    return NextResponse.json(
      { error: { code: 'profile_lookup_failed', message: profileError.message } },
      {
        status: 500,
        headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate' },
      },
    )
  }

  if (!profile?.id) {
    return NextResponse.json(
      { ok: true, version: null },
      { headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate' } },
    )
  }

  const { data: postData, error: postError } = await supabase
    .from('posts')
    .select('updated_at, published_at, created_at')
    .eq('author_id', profile.id)
    .eq('status', 'published')
    .is('deleted_at', null)
    .order('updated_at', { ascending: false, nullsFirst: false })
    .order('published_at', { ascending: false, nullsFirst: false })
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle<{ updated_at: string | null; published_at: string | null; created_at: string }>()

  if (postError) {
    return NextResponse.json(
      { error: { code: 'profile_posts_version_failed', message: postError.message } },
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
        profile.updated_at ?? null,
        postData?.updated_at ?? null,
        postData?.published_at ?? null,
        postData?.created_at ?? null,
      ),
    },
    { headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate' } },
  )
}

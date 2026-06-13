import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requireUserFromRequest } from '@/lib/auth/requireUserFromRequest'
import { getClientIp } from '@/lib/requestRateLimit'
import { rateLimit } from '@/lib/rateLimit'

const MIN_QUERY_CHARS = 2
const MAX_QUERY_CHARS = 40
const MAX_RESULTS = 8
const NO_STORE_HEADERS = { 'Cache-Control': 'no-store' }

type ProfileRow = {
  id: string
  username: string | null
  display_name: string | null
  avatar_url: string | null
  is_anonymous?: boolean | null
}

type ModerationRow = {
  user_id: string
  is_suspended: boolean | null
  is_banned: boolean | null
}

function serviceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return null
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
}

function normalizeQuery(value: string | null): string {
  return (value ?? '')
    .replace(/^@+/, '')
    .trim()
    .replace(/\s+/g, ' ')
    .slice(0, MAX_QUERY_CHARS + 1)
}

function escapeIlike(value: string): string {
  return value.replace(/[\\%_]/g, '\\$&')
}

function sortProfiles(query: string, profiles: ProfileRow[]): ProfileRow[] {
  const needle = query.toLocaleLowerCase('he-IL')

  return [...profiles].sort((a, b) => {
    const aUsername = (a.username ?? '').toLocaleLowerCase('he-IL')
    const bUsername = (b.username ?? '').toLocaleLowerCase('he-IL')
    const aDisplay = (a.display_name ?? '').toLocaleLowerCase('he-IL')
    const bDisplay = (b.display_name ?? '').toLocaleLowerCase('he-IL')

    const rank = (username: string, displayName: string) => {
      if (username === needle) return 0
      if (username.startsWith(needle)) return 1
      if (displayName === needle) return 2
      if (displayName.startsWith(needle)) return 3
      if (displayName.includes(needle)) return 4
      return 5
    }

    const rankDiff = rank(aUsername, aDisplay) - rank(bUsername, bDisplay)
    if (rankDiff !== 0) return rankDiff
    return (a.display_name ?? a.username ?? '').localeCompare(b.display_name ?? b.username ?? '', 'he')
  })
}

function rateLimited(retryAfterMs: number) {
  return NextResponse.json(
    { suggestions: [], error: { code: 'rate_limited' } },
    {
      status: 429,
      headers: {
        ...NO_STORE_HEADERS,
        'Retry-After': String(Math.max(1, Math.ceil(retryAfterMs / 1000))),
      },
    },
  )
}

export async function GET(req: NextRequest) {
  const auth = await requireUserFromRequest(req)
  if (!auth.ok) return auth.response

  const query = normalizeQuery(req.nextUrl.searchParams.get('q'))
  if (query.length < MIN_QUERY_CHARS) {
    return NextResponse.json({ suggestions: [] }, { headers: NO_STORE_HEADERS })
  }
  if (query.length > MAX_QUERY_CHARS) {
    return NextResponse.json(
      { suggestions: [], error: { code: 'query_too_long' } },
      { status: 400, headers: NO_STORE_HEADERS },
    )
  }

  const ip = getClientIp(req)
  const [userLimit, ipLimit] = await Promise.all([
    rateLimit(`mention-suggest:user:${auth.user.id}`, { maxRequests: 45, windowMs: 60_000 }),
    rateLimit(`mention-suggest:ip:${ip}`, { maxRequests: 120, windowMs: 60_000 }),
  ])
  if (!userLimit.allowed) return rateLimited(userLimit.retryAfterMs)
  if (!ipLimit.allowed) return rateLimited(ipLimit.retryAfterMs)

  const service = serviceClient()
  if (!service) {
    return NextResponse.json(
      { suggestions: [], error: { code: 'server_not_configured' } },
      { status: 500, headers: NO_STORE_HEADERS },
    )
  }

  const pattern = escapeIlike(query)
  const select = 'id, username, display_name, avatar_url, is_anonymous'
  const [usernameRes, displayRes] = await Promise.all([
    service
      .from('profiles_public')
      .select(select)
      .neq('id', auth.user.id)
      .eq('is_anonymous', false)
      .ilike('username', `${pattern}%`)
      .limit(MAX_RESULTS * 2),
    service
      .from('profiles_public')
      .select(select)
      .neq('id', auth.user.id)
      .eq('is_anonymous', false)
      .ilike('display_name', `%${pattern}%`)
      .limit(MAX_RESULTS * 2),
  ])

  if (usernameRes.error || displayRes.error) {
    return NextResponse.json(
      { suggestions: [], error: { code: 'db_error' } },
      { status: 500, headers: NO_STORE_HEADERS },
    )
  }

  const byId = new Map<string, ProfileRow>()
  for (const row of [...((usernameRes.data ?? []) as ProfileRow[]), ...((displayRes.data ?? []) as ProfileRow[])]) {
    if (!row.id || !row.username || row.is_anonymous === true) continue
    byId.set(row.id, row)
  }

  const ids = Array.from(byId.keys())
  if (ids.length === 0) {
    return NextResponse.json({ suggestions: [] }, { headers: NO_STORE_HEADERS })
  }

  const { data: moderationRows } = await service
    .from('user_moderation')
    .select('user_id, is_suspended, is_banned')
    .in('user_id', ids)

  const blocked = new Set(
    ((moderationRows ?? []) as ModerationRow[])
      .filter((row) => row.is_suspended === true || row.is_banned === true)
      .map((row) => row.user_id),
  )

  const suggestions = sortProfiles(
    query,
    ids.map((id) => byId.get(id)).filter((row): row is ProfileRow => !!row && !blocked.has(row.id)),
  )
    .slice(0, MAX_RESULTS)
    .map((row) => ({
      id: row.id,
      username: row.username,
      display_name: row.display_name,
      avatar_url: row.avatar_url,
    }))

  return NextResponse.json({ suggestions }, { headers: NO_STORE_HEADERS })
}

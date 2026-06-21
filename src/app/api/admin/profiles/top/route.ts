import { NextResponse } from 'next/server'
import { requireAdminFromRequest } from '@/lib/admin/requireAdminFromRequest'

type ContentViewRow = {
  resource_id: string | null
}

type ProfileRow = {
  id: string
  username: string | null
  display_name: string | null
}

function mustISO(raw: string | null, fallback: Date): string {
  if (!raw) return fallback.toISOString()
  const parsed = new Date(raw)
  return Number.isNaN(parsed.getTime()) ? fallback.toISOString() : parsed.toISOString()
}

export async function GET(req: Request) {
  const gate = await requireAdminFromRequest(req)
  if (!gate.ok) return gate.response

  const url = new URL(req.url)
  const now = new Date()
  const startFallback = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)

  const start = mustISO(url.searchParams.get('start'), startFallback)
  const end = mustISO(url.searchParams.get('end'), now)
  const limit = Math.min(Math.max(parseInt(url.searchParams.get('limit') ?? '20', 10) || 20, 1), 100)

  const { data: viewRows, error: viewsError } = await gate.admin
    .from('content_view_events')
    .select('resource_id')
    .eq('resource_type', 'profile')
    .gte('first_seen_at', start)
    .lt('first_seen_at', end)
    .order('first_seen_at', { ascending: false })
    .limit(100_000)

  if (viewsError) {
    return NextResponse.json({ error: viewsError.message }, { status: 500 })
  }

  const viewCounts = new Map<string, number>()
  for (const row of (viewRows ?? []) as ContentViewRow[]) {
    if (!row.resource_id) continue
    viewCounts.set(row.resource_id, (viewCounts.get(row.resource_id) ?? 0) + 1)
  }

  const rankedProfileIds = [...viewCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([profileId]) => profileId)
    .slice(0, limit)

  if (rankedProfileIds.length === 0) {
    return NextResponse.json([], { headers: { 'Cache-Control': 'no-store' } })
  }

  const { data: profiles } = await gate.admin
    .from('profiles')
    .select('id, username, display_name')
    .in('id', rankedProfileIds)

  const profileMap = new Map(
    ((profiles ?? []) as ProfileRow[]).map((profile) => [profile.id, profile]),
  )

  const rows = rankedProfileIds
    .map((profileId) => {
      const profile = profileMap.get(profileId)
      if (!profile?.username) return null
      return {
        username: profile.username,
        display_name: profile.display_name,
        views: viewCounts.get(profileId) ?? 0,
      }
    })
    .filter((row): row is { username: string; display_name: string | null; views: number } => Boolean(row))

  return NextResponse.json(rows, { headers: { 'Cache-Control': 'no-store' } })
}

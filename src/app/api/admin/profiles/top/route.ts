import { NextResponse } from 'next/server'
import { requireAdminFromRequest } from '@/lib/admin/requireAdminFromRequest'

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
  const end   = mustISO(url.searchParams.get('end'),   now)
  const limit = Math.min(Math.max(parseInt(url.searchParams.get('limit') ?? '20', 10) || 20, 1), 100)

  // Count pageviews for profile paths in the date window.
  // Safety cap: 100k rows is ample for ranking top profiles; prevents OOM on large tables.
  const { data: pvRows, error: pvError } = await gate.admin
    .from('analytics_pageviews')
    .select('path')
    .like('path', '/u/%')
    .gte('created_at', start)
    .lte('created_at', end)
    .limit(100_000)

  if (pvError) {
    return NextResponse.json({ error: pvError.message }, { status: 500 })
  }

  // Aggregate in JS (avoids needing a custom RPC for now)
  const viewMap = new Map<string, number>()
  for (const row of pvRows ?? []) {
    const username = (row.path as string).slice(3) // strip '/u/'
    // Ignore sub-paths like /u/foo/followers — only count exact profile pages
    if (!username || username.includes('/')) continue
    viewMap.set(username, (viewMap.get(username) ?? 0) + 1)
  }

  const sorted = [...viewMap.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)

  if (sorted.length === 0) {
    return NextResponse.json([], { headers: { 'Cache-Control': 'no-store' } })
  }

  // Enrich with profile display names
  const usernames = sorted.map(([u]) => u)
  const { data: profiles } = await gate.admin
    .from('profiles')
    .select('username, display_name')
    .in('username', usernames)

  const profileMap = new Map(
    ((profiles ?? []) as { username: string; display_name: string | null }[]).map(p => [
      p.username,
      p.display_name,
    ]),
  )

  const rows = sorted.map(([username, views]) => ({
    username,
    display_name: profileMap.get(username) ?? null,
    views,
  }))

  return NextResponse.json(rows, { headers: { 'Cache-Control': 'no-store' } })
}

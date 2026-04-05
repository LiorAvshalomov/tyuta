import { NextResponse } from 'next/server'
import { requireAdminFromRequest } from '@/lib/admin/requireAdminFromRequest'

const PAGE_SIZE = 50

const VALID_EVENTS = [
  'login_success',
  'login_failed',
  'logout',
  'signup',
  'password_reset',
  'token_refresh_failed',
  'profile_identity_updated',
] as const

type AuditRow = {
  id: string
  user_id: string | null
  event: string
  ip: string | null
  user_agent: string | null
  metadata: Record<string, unknown> | null
  created_at: string
}

type Profile = {
  id: string
  username: string
  display_name: string | null
  avatar_url: string | null
}

export async function GET(req: Request) {
  const gate = await requireAdminFromRequest(req)
  if (!gate.ok) return gate.response

  const url = new URL(req.url)
  const event = url.searchParams.get('event') ?? ''
  const ip = url.searchParams.get('ip') ?? ''
  const userId = url.searchParams.get('user_id') ?? ''
  const start = url.searchParams.get('start') ?? ''
  const end = url.searchParams.get('end') ?? ''
  const page = Math.max(1, parseInt(url.searchParams.get('page') ?? '1', 10))

  // ── 1. Query auth_audit_log (no cross-schema join — auth.users FK blocks PostgREST embed) ──
  let query = gate.admin
    .from('auth_audit_log')
    .select('id, user_id, event, ip, user_agent, metadata, created_at', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1)

  if (event && (VALID_EVENTS as readonly string[]).includes(event)) {
    query = query.eq('event', event)
  }
  if (ip) {
    const ipSafe = ip.replace(/[%_\\]/g, '\\$&')
    query = query.ilike('ip', `%${ipSafe}%`)
  }
  if (userId) {
    query = query.eq('user_id', userId)
  }
  if (start) {
    const startDate = new Date(start)
    if (!isNaN(startDate.getTime())) query = query.gte('created_at', startDate.toISOString())
  }
  if (end) {
    const endDate = new Date(end)
    if (!isNaN(endDate.getTime())) {
      endDate.setDate(endDate.getDate() + 1)
      query = query.lt('created_at', endDate.toISOString())
    }
  }

  const { data, error, count } = await query

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const rows = (data ?? []) as AuditRow[]

  // ── 2. Fetch profiles separately for non-null user_ids ──
  const userIds = [...new Set(rows.map(r => r.user_id).filter((id): id is string => !!id))]

  let profileMap: Record<string, Profile> = {}
  if (userIds.length > 0) {
    const { data: profiles } = await gate.admin
      .from('profiles')
      .select('id, username, display_name, avatar_url')
      .in('id', userIds)
    profileMap = Object.fromEntries(
      ((profiles ?? []) as Profile[]).map(p => [p.id, p]),
    )
  }

  // ── 3. Merge ──
  const enriched = rows.map(r => ({
    ...r,
    profiles: r.user_id ? (profileMap[r.user_id] ?? null) : null,
  }))

  return NextResponse.json({
    rows: enriched,
    total: count ?? 0,
    page,
    pageSize: PAGE_SIZE,
  })
}

import type { NextRequest } from 'next/server'
import type { SupabaseClient } from '@supabase/supabase-js'
import { requireAdminFromRequest } from '@/lib/admin/requireAdminFromRequest'
import { adminError, adminOk } from '@/lib/admin/adminHttp'
import {
  getUserHistoryActionLabel,
  isUserHistoryAction,
  USER_HISTORY_ACTIONS,
} from '@/lib/admin/userModerationHistory'
import { parseProfileSnapshot, type UserProfileSnapshot } from '@/lib/admin/logUserModerationAction'

type ProfileRow = {
  id: string
  username: string | null
  display_name: string | null
  avatar_url: string | null
  is_anonymous?: boolean | null
}

type HistoryEventRow = Record<string, unknown> & {
  id?: unknown
  action?: unknown
  reason?: unknown
  actor_id?: unknown
  target_user_id?: unknown
  created_at?: unknown
  metadata?: unknown
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

function normalizeProfile(row: ProfileRow | UserProfileSnapshot | null): UserProfileSnapshot | null {
  if (!row || typeof row.id !== 'string') return null
  return {
    id: row.id,
    username: typeof row.username === 'string' ? row.username : null,
    display_name: typeof row.display_name === 'string' ? row.display_name : null,
    avatar_url: typeof row.avatar_url === 'string' ? row.avatar_url : null,
    is_anonymous: typeof row.is_anonymous === 'boolean' ? row.is_anonymous : null,
  }
}

function profileText(profile: UserProfileSnapshot | null, fallbackId: string | null): string[] {
  const values = [
    profile?.display_name ?? '',
    profile?.username ?? '',
    profile?.id ?? '',
    fallbackId ?? '',
  ]
  return values
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean)
}

export async function GET(req: NextRequest) {
  const auth = await requireAdminFromRequest(req)
  if (!auth.ok) return auth.response

  const sb = auth.admin as unknown as SupabaseClient
  const url = new URL(req.url)

  const action = url.searchParams.get('action') ?? ''
  const q = (url.searchParams.get('q') ?? '').trim().toLowerCase()
  const from = url.searchParams.get('from') ?? ''
  const to = url.searchParams.get('to') ?? ''

  if (action && !isUserHistoryAction(action)) {
    return adminError('invalid action', 400, 'invalid_action')
  }

  const rawLimit = parseInt(url.searchParams.get('limit') ?? '50', 10)
  const rawOffset = parseInt(url.searchParams.get('offset') ?? '0', 10)
  const limit = Math.min(Math.max(Number.isFinite(rawLimit) ? rawLimit : 50, 1), 100)
  const offset = Math.max(Number.isFinite(rawOffset) ? rawOffset : 0, 0)

  const needsInProcessFilter = q.length > 0
  const fetchLimit = needsInProcessFilter ? Math.min(limit * 8, 800) : limit

  let query = sb
    .from('moderation_actions')
    .select('*', { count: 'exact' })
    .in('action', [...USER_HISTORY_ACTIONS])
    .not('target_user_id', 'is', null)
    .order('created_at', { ascending: false })

  if (action) query = query.eq('action', action)
  if (from) query = query.gte('created_at', from)
  if (to) {
    const toEnd = new Date(to)
    toEnd.setDate(toEnd.getDate() + 1)
    query = query.lt('created_at', toEnd.toISOString())
  }
  if (!needsInProcessFilter) {
    query = query.range(offset, offset + fetchLimit - 1)
  }

  const { data, error, count } = await query
  if (error) return adminError(error.message, 500, 'db_error')

  let events = (Array.isArray(data) ? data : []) as HistoryEventRow[]

  const profileIds = new Set<string>()
  for (const event of events) {
    if (typeof event.actor_id === 'string') profileIds.add(event.actor_id)
    if (typeof event.target_user_id === 'string') profileIds.add(event.target_user_id)
  }

  const allIds = Array.from(profileIds)
  const { data: profileData, error: profileErr } = allIds.length === 0
    ? { data: [], error: null }
    : await sb
        .from('profiles')
        .select('id, username, display_name, avatar_url, is_anonymous')
        .in('id', allIds)

  if (profileErr) return adminError(profileErr.message, 500, 'db_error')

  const profileMap = new Map<string, ProfileRow>()
  for (const row of Array.isArray(profileData) ? profileData : []) {
    if (!isRecord(row) || typeof row.id !== 'string') continue
    profileMap.set(row.id, row as unknown as ProfileRow)
  }

  const enriched: Array<HistoryEventRow & {
    metadata: Record<string, unknown>
    actor_profile: UserProfileSnapshot | null
    target_profile: UserProfileSnapshot | null
    target_profile_exists: boolean
  }> = events.map((event) => {
    const actorId = typeof event.actor_id === 'string' ? event.actor_id : null
    const targetUserId = typeof event.target_user_id === 'string' ? event.target_user_id : null
    const metadata = isRecord(event.metadata) ? event.metadata : {}
    const snapshot = parseProfileSnapshot(metadata.target_profile)
    const currentTarget = targetUserId ? normalizeProfile(profileMap.get(targetUserId) ?? null) : null

    return {
      ...event,
      metadata,
      actor_profile: actorId ? normalizeProfile(profileMap.get(actorId) ?? null) : null,
      target_profile: snapshot ?? currentTarget,
      target_profile_exists: currentTarget !== null,
    }
  })

  if (needsInProcessFilter) {
    events = enriched.filter((event) => {
      const reason = typeof event.reason === 'string' ? event.reason.toLowerCase() : ''
      const actionLabel = getUserHistoryActionLabel(typeof event.action === 'string' ? event.action : '').toLowerCase()
      const targetId = typeof event.target_user_id === 'string' ? event.target_user_id : null
      const actorId = typeof event.actor_id === 'string' ? event.actor_id : null
      const targetProfile = isRecord(event.target_profile) ? (event.target_profile as UserProfileSnapshot) : null
      const actorProfile = isRecord(event.actor_profile) ? (event.actor_profile as UserProfileSnapshot) : null
      const replacementUsername =
        isRecord(event.metadata) && typeof event.metadata.replacement_username === 'string'
          ? event.metadata.replacement_username.toLowerCase()
          : ''

      const haystack = [
        reason,
        actionLabel,
        replacementUsername,
        ...profileText(targetProfile, targetId),
        ...profileText(actorProfile, actorId),
      ]

      return haystack.some((value) => value.includes(q))
    })
  } else {
    events = enriched
  }

  const filteredTotal = needsInProcessFilter ? events.length : (count ?? 0)
  const pagedEvents = events.slice(offset, offset + limit)

  return adminOk({ events: pagedEvents, total: filteredTotal })
}

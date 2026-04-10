import type { SupabaseClient } from '@supabase/supabase-js'

export type HeaderUser = {
  id: string
  username: string
  displayName: string
  avatarUrl: string | null
}

type CachedHeaderUserRecord = HeaderUser & {
  cachedAt?: number
  expiresAt?: number | null
}

type HeaderUserEventDetail = {
  user: HeaderUser | null
  expiresAt: number | null
}

type HeaderUserProfileRow = {
  id: string
  username: string | null
  display_name: string | null
  avatar_url: string | null
}

type AuthUserFallback = {
  id: string
  user_metadata?: Record<string, unknown> | null
}

const HEADER_USER_CACHE_KEY = 'tyuta:header:user'
const HEADER_USER_EVENT = 'tyuta:header-user'
const HEADER_USER_GRACE_MS = 5 * 60_000
const HEADER_USER_UI_TTL_MS = 30 * 24 * 60 * 60 * 1000

function normalizeHeaderUser(input: {
  id: string
  username: string
  displayName?: string | null
  avatarUrl?: string | null
}): HeaderUser {
  const username = input.username.trim()
  const displayName = (input.displayName ?? '').trim() || username || 'אנונימי'

  return {
    id: input.id,
    username,
    displayName,
    avatarUrl: input.avatarUrl ?? null,
  }
}

function normalizeProfileRow(row: HeaderUserProfileRow | null | undefined): HeaderUser | null {
  if (!row?.id || !row.username) return null

  return normalizeHeaderUser({
    id: row.id,
    username: row.username,
    displayName: row.display_name,
    avatarUrl: row.avatar_url,
  })
}

function parseCachedHeaderUser(): CachedHeaderUserRecord | null {
  if (typeof window === 'undefined') return null

  try {
    const raw = window.localStorage.getItem(HEADER_USER_CACHE_KEY)
    if (!raw) return null

    const parsed = JSON.parse(raw) as unknown
    if (!parsed || typeof parsed !== 'object') return null

    const rec = parsed as Record<string, unknown>
    if (
      typeof rec.id !== 'string' ||
      typeof rec.username !== 'string' ||
      typeof rec.displayName !== 'string' ||
      (rec.avatarUrl !== null && typeof rec.avatarUrl !== 'string')
    ) {
      return null
    }

    const record: CachedHeaderUserRecord = {
      id: rec.id,
      username: rec.username,
      displayName: rec.displayName,
      avatarUrl: (rec.avatarUrl as string | null) ?? null,
      cachedAt: typeof rec.cachedAt === 'number' ? rec.cachedAt : undefined,
      expiresAt:
        typeof rec.expiresAt === 'number' || rec.expiresAt === null
          ? (rec.expiresAt as number | null)
          : undefined,
    }

    return record
  } catch {
    return null
  }
}

function isExpired(record: CachedHeaderUserRecord): boolean {
  const now = Date.now()

  if (typeof record.cachedAt === 'number') {
    return record.cachedAt + HEADER_USER_UI_TTL_MS < now
  }

  if (typeof record.expiresAt === 'number') {
    return record.expiresAt * 1000 + HEADER_USER_GRACE_MS < now
  }

  return false
}

function persistHeaderUser(
  user: HeaderUser | null,
  expiresAt?: number | null,
): HeaderUserEventDetail {
  if (typeof window === 'undefined') {
    return { user, expiresAt: expiresAt ?? null }
  }

  if (!user) {
    try {
      window.localStorage.removeItem(HEADER_USER_CACHE_KEY)
    } catch {
      // ignore
    }

    return { user: null, expiresAt: null }
  }

  const current = parseCachedHeaderUser()
  const finalExpiresAt = expiresAt === undefined ? current?.expiresAt ?? null : expiresAt
  const record: CachedHeaderUserRecord = {
    ...user,
    cachedAt: Date.now(),
    expiresAt: finalExpiresAt,
  }

  try {
    window.localStorage.setItem(HEADER_USER_CACHE_KEY, JSON.stringify(record))
  } catch {
    // ignore
  }

  return { user, expiresAt: finalExpiresAt }
}

export function sameHeaderUser(a: HeaderUser | null, b: HeaderUser | null): boolean {
  if (a === b) return true
  if (!a || !b) return false

  return (
    a.id === b.id &&
    a.username === b.username &&
    a.displayName === b.displayName &&
    a.avatarUrl === b.avatarUrl
  )
}

export async function fetchHeaderUserById(
  client: SupabaseClient,
  userId: string,
): Promise<HeaderUser | null> {
  const { data } = await client
    .from('profiles')
    .select('id, username, display_name, avatar_url')
    .eq('id', userId)
    .maybeSingle()

  return normalizeProfileRow((data ?? null) as HeaderUserProfileRow | null)
}

export function buildHeaderUserFromAuthUser(user: AuthUserFallback | null | undefined): HeaderUser | null {
  if (!user?.id) return null

  const metadata = user.user_metadata ?? {}
  const username = typeof metadata.username === 'string' ? metadata.username : ''
  if (!username.trim()) return null

  return normalizeHeaderUser({
    id: user.id,
    username,
    displayName: typeof metadata.display_name === 'string' ? metadata.display_name : null,
    avatarUrl: typeof metadata.avatar_url === 'string' ? metadata.avatar_url : null,
  })
}

export function readCachedHeaderUser(): HeaderUser | null {
  const record = parseCachedHeaderUser()
  if (!record) return null

  if (isExpired(record)) {
    persistHeaderUser(null)
    return null
  }

  return {
    id: record.id,
    username: record.username,
    displayName: record.displayName,
    avatarUrl: record.avatarUrl,
  }
}

export function writeCachedHeaderUser(user: HeaderUser | null, expiresAt?: number | null): void {
  persistHeaderUser(user, expiresAt)
}

export function clearCachedHeaderUser(): void {
  persistHeaderUser(null)
}

export function publishHeaderUser(user: HeaderUser | null, expiresAt?: number | null): void {
  const detail = persistHeaderUser(user, expiresAt)
  if (typeof window === 'undefined') return

  window.dispatchEvent(new CustomEvent<HeaderUserEventDetail>(HEADER_USER_EVENT, { detail }))
}

export function subscribeHeaderUser(
  listener: (detail: HeaderUserEventDetail) => void,
): () => void {
  if (typeof window === 'undefined') return () => undefined

  const onEvent = (event: Event) => {
    const detail = (event as CustomEvent<HeaderUserEventDetail>).detail
    if (!detail) return
    listener(detail)
  }

  window.addEventListener(HEADER_USER_EVENT, onEvent as EventListener)
  return () => window.removeEventListener(HEADER_USER_EVENT, onEvent as EventListener)
}

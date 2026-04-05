'use client'

export const PROFILE_REFRESH_STORAGE_KEY = 'tyuta:profile-refresh'
export const PROFILE_REFRESH_EVENT = 'tyuta:profile-updated'
export const PROFILE_REFRESH_CHANNEL = 'tyuta-profile-updates'
export const PROFILE_REFRESH_NAVIGATION_WINDOW_MS = 5 * 60_000

const PROFILE_REFRESH_SEEN_PREFIX = 'tyuta:profile-refresh-seen:'
const PROFILE_REFRESH_BOOTSTRAP_KEY = 'tyuta:profile-refresh-bootstrapped'

export type ProfileRefreshPayload = {
  version: string
  userId: string
  username?: string | null
  previousUsername?: string | null
  displayName?: string | null
  avatarUrl?: string | null
}

function parseVersionTimestamp(version: string | null | undefined) {
  if (!version) return null
  const parsed = Date.parse(version)
  return Number.isFinite(parsed) ? parsed : null
}

function safeGet(key: string) {
  if (typeof window === 'undefined') return null

  try {
    return window.localStorage.getItem(key)
  } catch {
    return null
  }
}

function safeSet(key: string, value: string) {
  if (typeof window === 'undefined') return

  try {
    window.localStorage.setItem(key, value)
  } catch {
    // Ignore storage failures. The event still fires in-tab.
  }
}

function safeGetSession(key: string) {
  if (typeof window === 'undefined') return null

  try {
    return window.sessionStorage.getItem(key)
  } catch {
    return null
  }
}

function safeSetSession(key: string, value: string) {
  if (typeof window === 'undefined') return

  try {
    window.sessionStorage.setItem(key, value)
  } catch {
    // Ignore sessionStorage failures.
  }
}

function normalizeString(value: string | null | undefined) {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed ? trimmed : null
}

export function readProfileRefreshPayload(): ProfileRefreshPayload | null {
  const raw = safeGet(PROFILE_REFRESH_STORAGE_KEY)
  if (!raw) return null

  try {
    const parsed = JSON.parse(raw) as Partial<ProfileRefreshPayload>
    if (!parsed || typeof parsed !== 'object') return null
    if (typeof parsed.version !== 'string' || typeof parsed.userId !== 'string') return null

    return {
      version: parsed.version,
      userId: parsed.userId,
      username: normalizeString(parsed.username),
      previousUsername: normalizeString(parsed.previousUsername),
      displayName: normalizeString(parsed.displayName),
      avatarUrl: typeof parsed.avatarUrl === 'string' ? parsed.avatarUrl : parsed.avatarUrl === null ? null : undefined,
    }
  } catch {
    return null
  }
}

export function getSeenProfileRefreshVersion(pathname: string) {
  return safeGetSession(`${PROFILE_REFRESH_SEEN_PREFIX}${pathname}`)
}

export function markProfileRefreshVersionSeen(pathname: string, version: string) {
  safeSetSession(`${PROFILE_REFRESH_SEEN_PREFIX}${pathname}`, version)
}

export function hasProfileRefreshBootstrapped() {
  return safeGetSession(PROFILE_REFRESH_BOOTSTRAP_KEY) === '1'
}

export function markProfileRefreshBootstrapped() {
  safeSetSession(PROFILE_REFRESH_BOOTSTRAP_KEY, '1')
}

export function pickLatestProfileRefreshVersion(...versions: Array<string | null | undefined>) {
  let latest: string | null = null

  for (const version of versions) {
    if (!version) continue
    if (!latest || version > latest) latest = version
  }

  return latest
}

export function isRecentProfileRefreshPayload(
  payload: ProfileRefreshPayload | null | undefined,
  now = Date.now(),
) {
  const timestamp = parseVersionTimestamp(payload?.version)
  if (timestamp == null) return false
  return now - timestamp <= PROFILE_REFRESH_NAVIGATION_WINDOW_MS
}

export function isProfileRefreshPathname(pathname: string | null | undefined) {
  if (!pathname) return false
  if (pathname === '/notes') return true
  if (pathname === '/search') return true
  if (pathname.startsWith('/u/')) return true
  return false
}

export function pathnameMatchesProfileRefresh(
  pathname: string | null | undefined,
  payload: ProfileRefreshPayload | null | undefined,
) {
  if (!pathname || !payload) return false
  if (pathname === '/notes' || pathname === '/search') return true
  if (!pathname.startsWith('/u/')) return false

  const segments = pathname.split('/').filter(Boolean)
  let usernameFromPath: string | null = null
  try {
    usernameFromPath = normalizeString(decodeURIComponent(segments[1] ?? ''))
  } catch {
    usernameFromPath = normalizeString(segments[1] ?? '')
  }
  if (!usernameFromPath) return false

  return payload.username === usernameFromPath || payload.previousUsername === usernameFromPath
}

export function notifyProfileUpdated(payload: Omit<ProfileRefreshPayload, 'version'> & { version?: string }) {
  if (typeof window === 'undefined') return

  const normalized: ProfileRefreshPayload = {
    version: payload.version ?? new Date().toISOString(),
    userId: payload.userId,
    username: normalizeString(payload.username),
    previousUsername: normalizeString(payload.previousUsername),
    displayName: normalizeString(payload.displayName),
    avatarUrl: typeof payload.avatarUrl === 'string' ? payload.avatarUrl : payload.avatarUrl === null ? null : undefined,
  }

  safeSet(PROFILE_REFRESH_STORAGE_KEY, JSON.stringify(normalized))
  window.dispatchEvent(new CustomEvent(PROFILE_REFRESH_EVENT, { detail: normalized }))

  if (!('BroadcastChannel' in window)) return

  try {
    const channel = new BroadcastChannel(PROFILE_REFRESH_CHANNEL)
    channel.postMessage(normalized)
    channel.close()
  } catch {
    // Ignore BroadcastChannel failures.
  }
}

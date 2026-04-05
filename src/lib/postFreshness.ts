'use client'

export const POST_REFRESH_STORAGE_KEY = 'tyuta:post-refresh'
export const POST_REFRESH_EVENT = 'tyuta:post-updated'
export const POST_REFRESH_CHANNEL = 'tyuta-post-updates'
export const POST_REFRESH_NAVIGATION_WINDOW_MS = 5 * 60_000
const POST_REFRESH_SEEN_PREFIX = 'tyuta:post-refresh-seen:'
const POST_REFRESH_BOOTSTRAP_KEY = 'tyuta:post-refresh-bootstrapped'

export type PostRefreshPayload = {
  version: string
  slug: string
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
    // Ignore storage failures. In-tab and BroadcastChannel are enough.
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

export function readPostRefreshPayload(): PostRefreshPayload | null {
  const raw = safeGet(POST_REFRESH_STORAGE_KEY)
  if (!raw) return null

  try {
    const parsed = JSON.parse(raw) as Partial<PostRefreshPayload>
    if (!parsed || typeof parsed !== 'object') return null
    if (typeof parsed.version !== 'string' || typeof parsed.slug !== 'string') return null
    const slug = parsed.slug.trim()
    if (!slug) return null
    return { version: parsed.version, slug }
  } catch {
    return null
  }
}

export function isPostPathname(pathname: string | null | undefined) {
  return Boolean(pathname?.startsWith('/post/'))
}

/**
 * Normalize a post pathname to its decoded form so that the sessionStorage key
 * is consistent regardless of whether the caller has a percent-encoded or
 * plain pathname (e.g. '/post/%D7%A9%D7%9C%D7%95%D7%9D' vs '/post/שלום').
 */
function normalizePostPathKey(pathname: string): string {
  try {
    return decodeURIComponent(pathname)
  } catch {
    return pathname
  }
}

export function getSeenPostRefreshVersion(pathname: string) {
  return safeGetSession(`${POST_REFRESH_SEEN_PREFIX}${normalizePostPathKey(pathname)}`)
}

export function markPostRefreshVersionSeen(pathname: string, version: string) {
  safeSetSession(`${POST_REFRESH_SEEN_PREFIX}${normalizePostPathKey(pathname)}`, version)
}

export function hasPostRefreshBootstrapped() {
  return safeGetSession(POST_REFRESH_BOOTSTRAP_KEY) === '1'
}

export function markPostRefreshBootstrapped() {
  safeSetSession(POST_REFRESH_BOOTSTRAP_KEY, '1')
}

export function pickLatestPostRefreshVersion(...versions: Array<string | null | undefined>) {
  let latest: string | null = null

  for (const version of versions) {
    if (!version) continue
    if (!latest || version > latest) latest = version
  }

  return latest
}

export function isRecentPostRefreshPayload(
  payload: PostRefreshPayload | null | undefined,
  now = Date.now(),
) {
  if (!payload?.version) return false
  const parsed = Date.parse(payload.version)
  if (!Number.isFinite(parsed)) return false
  return now - parsed <= POST_REFRESH_NAVIGATION_WINDOW_MS
}

export function pathnameMatchesPostRefresh(pathname: string | null | undefined, payload: PostRefreshPayload | null | undefined) {
  if (!pathname || !payload?.slug) return false

  try {
    return decodeURIComponent(pathname) === `/post/${payload.slug}`
  } catch {
    return pathname === `/post/${payload.slug}`
  }
}

export function notifyPostUpdated(payload: Omit<PostRefreshPayload, 'version'> & { version?: string }) {
  if (typeof window === 'undefined') return

  const normalized: PostRefreshPayload = {
    version: payload.version ?? new Date().toISOString(),
    slug: payload.slug.trim(),
  }

  if (!normalized.slug) return

  safeSet(POST_REFRESH_STORAGE_KEY, JSON.stringify(normalized))
  window.dispatchEvent(new CustomEvent(POST_REFRESH_EVENT, { detail: normalized }))

  if (!('BroadcastChannel' in window)) return

  try {
    const channel = new BroadcastChannel(POST_REFRESH_CHANNEL)
    channel.postMessage(normalized)
    channel.close()
  } catch {
    // Ignore BroadcastChannel failures.
  }
}

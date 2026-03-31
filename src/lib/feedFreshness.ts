export const FEED_REFRESH_STORAGE_KEY = 'tyuta:feed-refresh-version'
export const FEED_REFRESH_EVENT = 'tyuta:feed-updated'
export const FEED_REFRESH_CHANNEL = 'tyuta-feed-updates'
const FEED_REFRESH_BOOTSTRAP_KEY = 'tyuta:feed-refresh-bootstrapped'

const FEED_PATHS = new Set(['/', '/c/release', '/c/stories', '/c/magazine'])

function safeGet(storage: 'localStorage' | 'sessionStorage', key: string) {
  if (typeof window === 'undefined') return null

  try {
    return window[storage].getItem(key)
  } catch {
    return null
  }
}

function safeSet(storage: 'localStorage' | 'sessionStorage', key: string, value: string) {
  if (typeof window === 'undefined') return

  try {
    window[storage].setItem(key, value)
  } catch {
    // Ignore storage failures. The feed still updates through ISR.
  }
}

export function isFeedPathname(pathname: string | null | undefined) {
  if (!pathname) return false
  return FEED_PATHS.has(pathname)
}

export function readFeedRefreshVersion() {
  return safeGet('localStorage', FEED_REFRESH_STORAGE_KEY)
}

export function storeFeedRefreshVersion(version: string) {
  safeSet('localStorage', FEED_REFRESH_STORAGE_KEY, version)
}

export function getSeenFeedVersion(pathname: string) {
  return safeGet('sessionStorage', `tyuta:feed-refresh-seen:${pathname}`)
}

export function markFeedVersionSeen(pathname: string, version: string) {
  safeSet('sessionStorage', `tyuta:feed-refresh-seen:${pathname}`, version)
}

export function hasFeedRefreshBootstrapped() {
  return safeGet('sessionStorage', FEED_REFRESH_BOOTSTRAP_KEY) === '1'
}

export function markFeedRefreshBootstrapped() {
  safeSet('sessionStorage', FEED_REFRESH_BOOTSTRAP_KEY, '1')
}

export function pickLatestFeedVersion(...versions: Array<string | null | undefined>) {
  let latest: string | null = null

  for (const version of versions) {
    if (!version) continue
    if (!latest || version > latest) latest = version
  }

  return latest
}

export function notifyFeedContentUpdated(version = new Date().toISOString()) {
  if (typeof window === 'undefined') return

  safeSet('localStorage', FEED_REFRESH_STORAGE_KEY, version)
  window.dispatchEvent(new CustomEvent(FEED_REFRESH_EVENT, { detail: { version } }))

  if (!('BroadcastChannel' in window)) return

  try {
    const channel = new BroadcastChannel(FEED_REFRESH_CHANNEL)
    channel.postMessage({ version })
    channel.close()
  } catch {
    // Ignore BroadcastChannel failures. Local storage + custom event are enough.
  }
}

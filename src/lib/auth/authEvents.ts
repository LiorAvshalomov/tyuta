export type AuthBroadcastEventType = 'SIGNED_IN' | 'SIGNED_OUT' | 'TOKEN_REFRESH_FAILED'

export type AuthBroadcastPayload = {
  type: AuthBroadcastEventType
  ts: number
}

export type AuthResolutionState = 'unknown' | 'authenticated' | 'unauthenticated'

const AUTH_EVENT_KEY = 'tyuta:auth:event'
const AUTH_STATE_KEY = 'tyuta:auth:state'

// Legacy keys for backward-compat migration
const LEGACY_AUTH_EVENT_KEY = 'pendemic:auth:event'
const LEGACY_AUTH_STATE_KEY = 'pendemic:auth:state'

/** One-time migration: copy legacy pendemic:* auth keys to tyuta:* and remove old ones */
function migrateAuthKeys(): void {
  try {
    const pairs: [string, string][] = [
      [LEGACY_AUTH_EVENT_KEY, AUTH_EVENT_KEY],
      [LEGACY_AUTH_STATE_KEY, AUTH_STATE_KEY],
    ]
    for (const [oldK, newK] of pairs) {
      const v = localStorage.getItem(oldK)
      if (v != null && localStorage.getItem(newK) == null) {
        localStorage.setItem(newK, v)
      }
      localStorage.removeItem(oldK)
    }
  } catch {
    // ignore
  }
}

if (typeof window !== 'undefined') migrateAuthKeys()

/**
 * BroadcastChannel singleton for cross-tab auth events.
 * Primary channel — works in all modern browsers (Safari ≥ 15.4, all Chromium, Firefox).
 * StorageEvent remains as a fallback for older Safari.
 */
const _bc =
  typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel('tyuta:auth') : null

let authResolutionState: AuthResolutionState = 'unknown'
const authResolutionListeners = new Set<(state: AuthResolutionState) => void>()

export function setAuthState(state: 'in' | 'out'): void {
  try {
    localStorage.setItem(AUTH_STATE_KEY, state)
  } catch {
    // ignore (Safari private mode, etc.)
  }
}

export function getAuthState(): 'in' | 'out' | null {
  try {
    const v = localStorage.getItem(AUTH_STATE_KEY)
    return v === 'in' || v === 'out' ? v : null
  } catch {
    return null
  }
}

export function setAuthResolutionState(state: AuthResolutionState): void {
  authResolutionState = state
  for (const listener of authResolutionListeners) listener(state)
}

export function getAuthResolutionState(): AuthResolutionState {
  return authResolutionState
}

export function subscribeAuthResolutionState(
  listener: (state: AuthResolutionState) => void,
): () => void {
  authResolutionListeners.add(listener)
  return () => authResolutionListeners.delete(listener)
}

export function waitForAuthResolution(timeoutMs = 8000): Promise<AuthResolutionState | 'timeout'> {
  if (authResolutionState !== 'unknown') return Promise.resolve(authResolutionState)

  return new Promise((resolve) => {
    const timeout = window.setTimeout(() => {
      unsubscribe()
      resolve('timeout')
    }, timeoutMs)

    const unsubscribe = subscribeAuthResolutionState((state) => {
      if (state === 'unknown') return
      window.clearTimeout(timeout)
      unsubscribe()
      resolve(state)
    })
  })
}

/** Broadcast an auth event to all tabs (BroadcastChannel + StorageEvent fallback). */
export function broadcastAuthEvent(type: AuthBroadcastEventType): void {
  const payload: AuthBroadcastPayload = { type, ts: Date.now() }
  try { _bc?.postMessage(payload) } catch { /* ignore */ }
  try { localStorage.setItem(AUTH_EVENT_KEY, JSON.stringify(payload)) } catch { /* ignore */ }
}

export function parseAuthBroadcastEvent(raw: string | null): AuthBroadcastPayload | null {
  if (!raw) return null
  try {
    const v = JSON.parse(raw) as unknown
    if (!v || typeof v !== 'object') return null
    const rec = v as Record<string, unknown>
    const type = rec.type
    const ts = rec.ts
    if (
      (type === 'SIGNED_IN' || type === 'SIGNED_OUT' || type === 'TOKEN_REFRESH_FAILED') &&
      typeof ts === 'number'
    ) {
      return { type, ts }
    }
    return null
  } catch {
    return null
  }
}

/**
 * Subscribe to cross-tab auth events via BroadcastChannel.
 * Falls back silently to no-op on browsers without BroadcastChannel
 * (StorageEvent subscription in AuthSync covers that path).
 *
 * Returns an unsubscribe function.
 */
export function subscribeAuthBroadcast(
  handler: (payload: AuthBroadcastPayload) => void,
): () => void {
  if (!_bc) return () => { /* noop */ }

  const onMessage = (e: MessageEvent<unknown>) => {
    if (!e.data || typeof e.data !== 'object') return
    const rec = e.data as Record<string, unknown>
    const type = rec.type
    const ts = rec.ts
    if (
      (type === 'SIGNED_IN' || type === 'SIGNED_OUT' || type === 'TOKEN_REFRESH_FAILED') &&
      typeof ts === 'number'
    ) {
      handler({ type, ts })
    }
  }

  _bc.addEventListener('message', onMessage)
  return () => _bc.removeEventListener('message', onMessage)
}

export const AUTH_BROADCAST_STORAGE_KEY = AUTH_EVENT_KEY

'use client'

import { usePathname, useRouter } from 'next/navigation'
import { useEffect, useRef } from 'react'
import { clearHydratedSession, hydrateSession, supabase } from '@/lib/supabaseClient'
import {
  AUTH_BROADCAST_STORAGE_KEY,
  broadcastAuthEvent,
  getAuthResolutionState,
  getAuthState,
  parseAuthBroadcastEvent,
  setAuthResolutionState,
  setAuthState,
  subscribeAuthBroadcast,
} from '@/lib/auth/authEvents'
import {
  buildLoginRedirect,
  getSafePostAuthRedirect,
  isAdminPath,
  isEntryAuthPath,
  isProtectedPath,
  shouldRunLoginRedirect,
  syncLoginRedirectState,
} from '@/lib/auth/protectedRoutes'
import { clearCachedHeaderUser, publishHeaderUser, type HeaderUser } from '@/lib/auth/headerUser'
import { syncAnalyticsIdentity } from '@/lib/analytics/syncIdentity'

type Props = { children: React.ReactNode }

type LostAuthReason = 'SIGNED_OUT' | 'TOKEN_REFRESH_FAILED' | 'SESSION_GONE'
type AuthSessionResponseBody = {
  access_token?: string
  expires_at?: number
  header_user?: HeaderUser | null
}

const LEGACY_LS_KEYS = [
  'sb-dowhdgcvxgzaikmpnchv-auth-token',
  'sb-ckhhngglsipovvvgailq-auth-token',
]

const RESET_GATE_STORAGE_KEY = 'tyuta:password_reset_required'
const RESET_GATE_COOKIE = 'tyuta_reset_required'
const CLIENT_REFRESH_LEEWAY_MS = 2 * 60_000

function setResetGateCookie(): void {
  if (typeof document === 'undefined') return
  const maxAge = 60 * 15
  const secure = window.location.protocol === 'https:' ? '; Secure' : ''
  document.cookie = `${RESET_GATE_COOKIE}=1; Path=/; Max-Age=${maxAge}; SameSite=Lax${secure}`
}

function clearResetGateCookie(): void {
  if (typeof document === 'undefined') return
  const secure = window.location.protocol === 'https:' ? '; Secure' : ''
  document.cookie = `${RESET_GATE_COOKIE}=; Path=/; Max-Age=0; SameSite=Lax${secure}`
}

function hasResetGateCookie(): boolean {
  if (typeof document === 'undefined') return false
  return document.cookie.split(';').some((cookie) => cookie.trim().startsWith(`${RESET_GATE_COOKIE}=`))
}

function isResetRoute(pathname: string): boolean {
  return pathname.startsWith('/auth/reset-password')
}

function hasResetGate(): boolean {
  if (typeof window === 'undefined') return false
  return Boolean(window.localStorage.getItem(RESET_GATE_STORAGE_KEY)) || hasResetGateCookie()
}

function getFlowTypeFromUrl(): string | null {
  if (typeof window === 'undefined') return null
  const href = window.location.href

  try {
    const url = new URL(href)
    const queryType = url.searchParams.get('type')
    if (queryType) return queryType
  } catch {
    // ignore malformed URL parsing and fall back to the hash parser below
  }

  const hashIndex = href.indexOf('#')
  if (hashIndex !== -1) {
    const hashParams = new URLSearchParams(href.slice(hashIndex + 1))
    const hashType = hashParams.get('type')
    if (hashType) return hashType
  }

  return null
}

function urlIsRecoveryOrInviteFlow(): boolean {
  const flowType = getFlowTypeFromUrl()
  return flowType === 'recovery' || flowType === 'invite'
}

function setResetGate(): void {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(RESET_GATE_STORAGE_KEY, String(Date.now()))
  setResetGateCookie()
}

function clearResetGate(): void {
  if (typeof window === 'undefined') return
  window.localStorage.removeItem(RESET_GATE_STORAGE_KEY)
  clearResetGateCookie()
}

export default function AuthSync({ children }: Props) {
  const router = useRouter()
  const pathname = usePathname() || ''

  const hadSessionRef = useRef(false)
  const lastHandledBroadcastTsRef = useRef(0)
  const refreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  // Guards against the handleLostAuth → signOut({ scope:'local' }) → onAuthStateChange loop.
  const isHandlingSignOutRef = useRef(false)
  // Deduplicates concurrent calls to recoverSessionFromServer so that the RT cookie
  // is never sent twice simultaneously (Supabase rotates RTs — a second in-flight call
  // with the old token returns 401, which would falsely signal "unauthenticated").
  const recoverInFlightRef = useRef<Promise<'ok' | 'unauthenticated' | 'error'> | null>(null)
  // pathnameRef lets mount-once closures always read the latest pathname
  const pathnameRef = useRef(pathname)
  pathnameRef.current = pathname

  // Recovery / reset-gate check — runs on every navigation, lightweight
  useEffect(() => {
    syncLoginRedirectState()
    if (urlIsRecoveryOrInviteFlow()) {
      setResetGate()
      if (!isResetRoute(pathname)) router.replace('/auth/reset-password')
    } else if (hasResetGate() && !isResetRoute(pathname)) {
      router.replace('/auth/reset-password')
    }
  }, [pathname, router])

  // Auth init + all subscriptions — runs once on mount only
  // pathnameRef.current is read at call-time so closures always see the live pathname.
  // router is stable across renders in Next.js App Router.
  useEffect(() => {
    let cancelled = false

    const redirectAuthenticatedEntryRoute = () => {
      const currentPath = pathnameRef.current
      if (hasResetGate() && !isResetRoute(currentPath)) {
        router.replace('/auth/reset-password')
        return
      }

      if (!isEntryAuthPath(currentPath)) return
      const nextParam =
        typeof window !== 'undefined'
          ? new URLSearchParams(window.location.search).get('next')
          : null
      router.replace(getSafePostAuthRedirect(nextParam))
    }

    const scheduleRefresh = (expiresAt: number) => {
      if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current)
      const delayMs = Math.max(0, expiresAt * 1000 - Date.now() - CLIENT_REFRESH_LEEWAY_MS)
      refreshTimerRef.current = setTimeout(async () => {
        const result = await recoverSessionFromServer()
        if (cancelled) return
        if (result === 'unauthenticated') {
          // Double-check the in-memory session before declaring auth lost.
          // Guards against stale timers firing after a subsequent successful refresh
          // (e.g. recoverSessionFromServer was called from another path concurrently).
          const { data: check } = await supabase.auth.getSession()
          if (!check.session?.user?.id) handleLostAuth('SESSION_GONE')
        }
      }, delayMs)
    }

    const markAuthenticated = ({
      expiresAt,
      accessToken,
    }: {
      expiresAt?: number
      accessToken?: string
    } = {}) => {
      const wasAuthenticated = hadSessionRef.current
      hadSessionRef.current = true
      setAuthState('in')
      setAuthResolutionState('authenticated')
      if (expiresAt) scheduleRefresh(expiresAt)
      if (!wasAuthenticated && accessToken) {
        syncAnalyticsIdentity(accessToken, { path: pathnameRef.current })
      }
      redirectAuthenticatedEntryRoute()
    }

    const handleLostAuth = (reason: LostAuthReason, skipBroadcast = false) => {
      if (cancelled) return

      if (refreshTimerRef.current) {
        clearTimeout(refreshTimerRef.current)
        refreshTimerRef.current = null
      }

      clearResetGate()
      hadSessionRef.current = false
      setAuthState('out')
      setAuthResolutionState('unauthenticated')
      clearCachedHeaderUser()

      if (!skipBroadcast && reason === 'TOKEN_REFRESH_FAILED') {
        broadcastAuthEvent('TOKEN_REFRESH_FAILED')
      }

      // Cross-tab and storage-broadcast auth-loss events already reached this tab.
      // Clear only the in-memory session here; rebroadcasting signOut from every tab
      // is what turns a normal logout into a fetch storm.
      if (skipBroadcast) {
        clearHydratedSession()
      } else if (!isHandlingSignOutRef.current) {
        isHandlingSignOutRef.current = true
        void supabase.auth.signOut({ scope: 'local' })
          .catch(() => { /* ignore — session may already be gone */ })
          .finally(() => { isHandlingSignOutRef.current = false })
      }

      const currentPath = pathnameRef.current
      if (isAdminPath(currentPath) || isProtectedPath(currentPath)) {
        const loginTarget = buildLoginRedirect(currentPath)
        if (shouldRunLoginRedirect(loginTarget)) {
          router.replace(loginTarget)
        }
        return
      }

      if (isEntryAuthPath(currentPath)) {
        return
      }

      // Public pages (post, channel, search, profile, homepage, auth routes) stay
      // in place and simply refresh so the server re-renders the guest view.
      // No disorienting redirect to the homepage.
      router.refresh()
    }

    const recoverSessionFromServer = (): Promise<'ok' | 'unauthenticated' | 'error'> => {
      // Return the in-flight promise if one already exists. This prevents RT rotation
      // races: Supabase rotates the RT on every use, so a second concurrent call with
      // the old token returns 401, which would falsely signal 'unauthenticated'.
      if (recoverInFlightRef.current) return recoverInFlightRef.current

      const promise = (async (): Promise<'ok' | 'unauthenticated' | 'error'> => {
        setAuthResolutionState('unknown')
        try {
          const res = await fetch('/api/auth/session', { credentials: 'same-origin' })
          if (res.status === 204 || res.status === 401) return 'unauthenticated'
          if (!res.ok) return 'error'

          const body = await res.json() as AuthSessionResponseBody
          if (!body.access_token) return 'error'

          await hydrateSession(body.access_token)
          // Only publish when the server returned a real header_user.
          // Publishing null resets userResolved → false in SiteHeader causing
          // the skeleton flash. The cached user stays valid; if the profile
          // was genuinely missing, the next TOKEN_REFRESHED event will sync.
          if (body.header_user) {
            publishHeaderUser(body.header_user, body.expires_at)
          }
          markAuthenticated({ expiresAt: body.expires_at, accessToken: body.access_token })
          return 'ok'
        } catch {
          return 'error'
        } finally {
          recoverInFlightRef.current = null
        }
      })()

      recoverInFlightRef.current = promise
      return promise
    }

    const migrateLegacySession = async (): Promise<boolean> => {
      for (const key of LEGACY_LS_KEYS) {
        let raw: string | null = null
        try {
          raw = localStorage.getItem(key)
        } catch {
          continue
        }

        if (!raw) continue

        let refreshToken: string | null = null
        try {
          const parsed = JSON.parse(raw) as unknown
          if (parsed && typeof parsed === 'object') {
            const record = parsed as Record<string, unknown>
            refreshToken = typeof record.refresh_token === 'string' ? record.refresh_token : null
          }
        } catch {
          continue
        }

        if (!refreshToken) continue

        try {
          const res = await fetch('/api/auth/session', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'same-origin',
            body: JSON.stringify({ legacy_refresh_token: refreshToken }),
          })

          if (res.status === 401) {
            try {
              localStorage.removeItem(key)
            } catch {
              // ignore
            }
            continue
          }

          if (!res.ok) continue

          const body = await res.json() as AuthSessionResponseBody
          if (!body.access_token) continue

          try {
            localStorage.removeItem(key)
          } catch {
            // ignore
          }

          await hydrateSession(body.access_token)
          if (body.header_user) {
            publishHeaderUser(body.header_user, body.expires_at)
          }
          markAuthenticated({ expiresAt: body.expires_at, accessToken: body.access_token })
          return true
        } catch {
          continue
        }
      }

      return false
    }

    const handleIncomingSignIn = async () => {
      if (cancelled) return

      const refreshPublicRouteAfterSignIn = () => {
        const currentPath = pathnameRef.current
        if (isEntryAuthPath(currentPath) || isProtectedPath(currentPath) || isAdminPath(currentPath)) return
        router.refresh()
      }

      const existing = await supabase.auth.getSession()
      if (cancelled) return

      if (existing.data.session?.user?.id) {
        markAuthenticated({
          expiresAt: existing.data.session.expires_at,
          accessToken: existing.data.session.access_token,
        })
        refreshPublicRouteAfterSignIn()
        return
      }

      const result = await recoverSessionFromServer()
      if (cancelled) return
      if (result === 'ok') {
        refreshPublicRouteAfterSignIn()
      }
    }

    const init = async () => {
      setAuthResolutionState('unknown')
      const { data } = await supabase.auth.getSession()
      if (data.session?.user?.id) {
        markAuthenticated({
          expiresAt: data.session.expires_at,
          accessToken: data.session.access_token,
        })
        return
      }

      const globalState = getAuthState()
      const recoverResult = await recoverSessionFromServer()
      if (recoverResult === 'ok') return
      if (recoverResult === 'error') return

      const migrated = await migrateLegacySession()
      if (migrated) return

      // Before declaring auth lost for a previously-authenticated user, wait briefly
      // and retry once. This handles: (a) Supabase transient failures returning 503
      // that the route now surfaces, (b) any timing edge cases on cold session resume.
      if (globalState === 'in' && recoverResult === 'unauthenticated') {
        await new Promise<void>((resolve) => setTimeout(resolve, 800))
        if (cancelled) return
        const retryResult = await recoverSessionFromServer()
        if (retryResult === 'ok') return
        // Non-definitive failure — don't log out, silently stop.
        if (retryResult !== 'unauthenticated') return
      }

      if (globalState === 'in') {
        handleLostAuth('SESSION_GONE')
      } else {
        clearCachedHeaderUser()
        setAuthState('out')
        setAuthResolutionState('unauthenticated')
      }
    }

    void init()

    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if ((event as string) === 'PASSWORD_RECOVERY') {
        setResetGate()
        if (!isResetRoute(pathnameRef.current)) router.replace('/auth/reset-password')
        return
      }

      if (event === 'SIGNED_OUT') {
        // Skip if we triggered this signOut ourselves inside handleLostAuth —
        // otherwise we'd enter an infinite handleLostAuth → signOut → SIGNED_OUT loop.
        if (isHandlingSignOutRef.current) return
        clearResetGate()
        // Supabase already propagates SIGNED_OUT between tabs.
        handleLostAuth('SIGNED_OUT', true)
        return
      }

      if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
        markAuthenticated({ expiresAt: session?.expires_at, accessToken: session?.access_token })
      }
    })

    const unsubscribeBC = subscribeAuthBroadcast((payload) => {
      if (payload.ts <= lastHandledBroadcastTsRef.current) return
      lastHandledBroadcastTsRef.current = payload.ts

      if (payload.type === 'SIGNED_IN') {
        void handleIncomingSignIn()
        return
      }

      handleLostAuth(payload.type, true)
    })

    const onStorage = (event: StorageEvent) => {
      if (event.key !== AUTH_BROADCAST_STORAGE_KEY) return
      const parsed = parseAuthBroadcastEvent(event.newValue)
      if (!parsed) return
      if (parsed.ts <= lastHandledBroadcastTsRef.current) return
      lastHandledBroadcastTsRef.current = parsed.ts

      if (parsed.type === 'SIGNED_IN') {
        void handleIncomingSignIn()
        return
      }

      handleLostAuth(parsed.type, true)
    }

    window.addEventListener('storage', onStorage)

    const onVisibilityChange = () => {
      if (document.visibilityState !== 'visible') return

      void supabase.auth.getSession().then(async ({ data }) => {
        if (!data.session) {
          if (getAuthResolutionState() === 'unauthenticated' && !hadSessionRef.current) return

          const expectedAuthenticated = hadSessionRef.current || getAuthState() === 'in'
          const result = await recoverSessionFromServer()
          if (result === 'unauthenticated') {
            if (expectedAuthenticated) {
              // Mirror the retry guard in init(): wait briefly and retry once before
              // calling handleLostAuth. Tab-focus events are a common trigger for this
              // path; a single transient failure here would cause a redirect dance for
              // a user simply switching back to the Tyuta tab.
              await new Promise<void>((resolve) => setTimeout(resolve, 800))
              if (cancelled) return
              const retryResult = await recoverSessionFromServer()
              if (retryResult === 'unauthenticated') handleLostAuth('SESSION_GONE')
              // 'error' or 'ok' — either way, do not log out.
            } else {
              clearCachedHeaderUser()
              setAuthState('out')
              setAuthResolutionState('unauthenticated')
            }
          }
          return
        }

        const expiresAt = data.session.expires_at ?? 0
        const secsLeft = expiresAt - Math.floor(Date.now() / 1000)
        if (secsLeft < 180) {
          const result = await recoverSessionFromServer()
          if (result === 'unauthenticated') {
            // Double-check: getSession() should also see no session before logging out.
            // Guards against a stale visibility event racing with a successful refresh.
            const { data: check } = await supabase.auth.getSession()
            if (!check.session?.user?.id) handleLostAuth('SESSION_GONE')
          }
        }
      }).catch(() => {
        // ignore
      })
    }

    document.addEventListener('visibilitychange', onVisibilityChange)

    // iOS Safari BFCache: when the user navigates back/forward and the page is
    // restored from cache, visibilitychange may not fire reliably. pageshow with
    // persisted=true is the canonical way to detect BFCache restores on iOS.
    // All other auto-refresh components in this codebase (Feed, Post, Profile) do the same.
    const onPageShow = (event: PageTransitionEvent) => {
      if (!event.persisted) return
      onVisibilityChange()
    }
    window.addEventListener('pageshow', onPageShow)

    return () => {
      cancelled = true
      if (refreshTimerRef.current) {
        clearTimeout(refreshTimerRef.current)
        refreshTimerRef.current = null
      }
      window.removeEventListener('storage', onStorage)
      window.removeEventListener('pageshow', onPageShow)
      document.removeEventListener('visibilitychange', onVisibilityChange)
      unsubscribeBC()
      sub.subscription.unsubscribe()
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []) // mount once — pathnameRef.current is read at call-time; router is stable in App Router

  return <>{children}</>
}

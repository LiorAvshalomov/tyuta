'use client'

import { usePathname, useRouter } from 'next/navigation'
import { useEffect, useRef } from 'react'
import { supabase, hydrateSession } from '@/lib/supabaseClient'
import {
  AUTH_BROADCAST_STORAGE_KEY,
  broadcastAuthEvent,
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
} from '@/lib/auth/protectedRoutes'

type Props = { children: React.ReactNode }

type LostAuthReason = 'SIGNED_OUT' | 'TOKEN_REFRESH_FAILED' | 'SESSION_GONE'

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
  // pathnameRef lets mount-once closures always read the latest pathname
  const pathnameRef = useRef(pathname)
  pathnameRef.current = pathname

  // Recovery / reset-gate check — runs on every navigation, lightweight
  useEffect(() => {
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

    const hasLegacySession = () => {
      try {
        return LEGACY_LS_KEYS.some((key) => Boolean(localStorage.getItem(key)))
      } catch {
        return false
      }
    }

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
        if (result === 'unauthenticated') handleLostAuth('SESSION_GONE')
      }, delayMs)
    }

    const markAuthenticated = (expiresAt?: number) => {
      hadSessionRef.current = true
      setAuthState('in')
      setAuthResolutionState('authenticated')
      if (expiresAt) scheduleRefresh(expiresAt)
      redirectAuthenticatedEntryRoute()
    }

    const handleLostAuth = (reason: LostAuthReason, skipBroadcast = false) => {
      if (cancelled) return

      if (refreshTimerRef.current) {
        clearTimeout(refreshTimerRef.current)
        refreshTimerRef.current = null
      }

      clearResetGate()
      setAuthState('out')
      setAuthResolutionState('unauthenticated')

      if (!skipBroadcast) {
        if (reason === 'TOKEN_REFRESH_FAILED') broadcastAuthEvent('TOKEN_REFRESH_FAILED')
        else broadcastAuthEvent('SIGNED_OUT')
      }

      // Clear the in-memory session so onAuthStateChange('SIGNED_OUT') fires for
      // all in-tab Supabase subscribers (e.g. SiteHeader clears the user avatar/name).
      // scope:'local' = no network call, just wipes memStorage and fires the event.
      if (!isHandlingSignOutRef.current) {
        isHandlingSignOutRef.current = true
        void supabase.auth.signOut({ scope: 'local' })
          .catch(() => { /* ignore — session may already be gone */ })
          .finally(() => { isHandlingSignOutRef.current = false })
      }

      const currentPath = pathnameRef.current
      if (isAdminPath(currentPath) || isProtectedPath(currentPath)) {
        router.replace(buildLoginRedirect(currentPath))
        return
      }

      // Public pages (post, channel, search, profile, homepage, auth routes) stay
      // in place and simply refresh so the server re-renders the guest view.
      // No disorienting redirect to the homepage.
      router.refresh()
    }

    const recoverSessionFromServer = async (): Promise<'ok' | 'unauthenticated' | 'error'> => {
      setAuthResolutionState('unknown')
      try {
        const res = await fetch('/api/auth/session', { credentials: 'same-origin' })
        if (res.status === 204 || res.status === 401) return 'unauthenticated'
        if (!res.ok) return 'error'

        const body = await res.json() as { access_token?: string; expires_at?: number }
        if (!body.access_token) return 'error'

        await hydrateSession(body.access_token)
        markAuthenticated(body.expires_at)
        return 'ok'
      } catch {
        return 'error'
      }
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

          const body = await res.json() as { access_token?: string; expires_at?: number }
          if (!body.access_token) continue

          try {
            localStorage.removeItem(key)
          } catch {
            // ignore
          }

          await hydrateSession(body.access_token)
          markAuthenticated(body.expires_at)
          return true
        } catch {
          continue
        }
      }

      return false
    }

    const handleIncomingSignIn = async () => {
      if (cancelled) return

      const existing = await supabase.auth.getSession()
      if (cancelled) return

      if (existing.data.session?.user?.id) {
        markAuthenticated(existing.data.session.expires_at)
        return
      }

      const result = await recoverSessionFromServer()
      if (cancelled) return
      if (result === 'ok') return
    }

    const init = async () => {
      setAuthResolutionState('unknown')
      const { data } = await supabase.auth.getSession()
      if (data.session?.user?.id) {
        markAuthenticated(data.session.expires_at)
        return
      }

      const globalState = getAuthState()
      if (globalState === 'out' && !hasLegacySession()) {
        setAuthResolutionState('unauthenticated')
        return
      }

      const recoverResult = await recoverSessionFromServer()
      if (recoverResult === 'ok') return
      if (recoverResult === 'error') return

      const migrated = await migrateLegacySession()
      if (migrated) return

      if (globalState === 'in') {
        handleLostAuth('SESSION_GONE')
      } else {
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
        handleLostAuth('SIGNED_OUT')
        return
      }

      if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
        markAuthenticated(session?.expires_at)
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
          if (getAuthState() === 'in') {
            const result = await recoverSessionFromServer()
            if (result === 'unauthenticated') handleLostAuth('SESSION_GONE')
          }
          return
        }

        const expiresAt = data.session.expires_at ?? 0
        const secsLeft = expiresAt - Math.floor(Date.now() / 1000)
        if (secsLeft < 180) {
          const result = await recoverSessionFromServer()
          if (result === 'unauthenticated') handleLostAuth('SESSION_GONE')
        }
      }).catch(() => {
        // ignore
      })
    }

    document.addEventListener('visibilitychange', onVisibilityChange)

    return () => {
      cancelled = true
      if (refreshTimerRef.current) {
        clearTimeout(refreshTimerRef.current)
        refreshTimerRef.current = null
      }
      window.removeEventListener('storage', onStorage)
      document.removeEventListener('visibilitychange', onVisibilityChange)
      unsubscribeBC()
      sub.subscription.unsubscribe()
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []) // mount once — pathnameRef.current is read at call-time; router is stable in App Router

  return <>{children}</>
}

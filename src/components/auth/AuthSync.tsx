"use client"

import { usePathname, useRouter } from 'next/navigation'
import { useEffect, useRef } from 'react'
import { supabase } from '@/lib/supabaseClient'
import {
  AUTH_BROADCAST_STORAGE_KEY,
  broadcastAuthEvent,
  getAuthState,
  parseAuthBroadcastEvent,
  setAuthState,
} from '@/lib/auth/authEvents'

type Props = { children: React.ReactNode }

const CHECK_INTERVAL_MS = 25_000

// When a user opens a Supabase password recovery link, Supabase creates a session.
// Product requirement: do NOT allow free navigation around the site before they set a new password.
// We enforce a "reset gate" client-side using the PASSWORD_RECOVERY auth event.
const RESET_GATE_STORAGE_KEY = 'tyuta:password_reset_required'
const RESET_GATE_COOKIE = 'tyuta_reset_required'

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

function isResetRoute(pathname: string): boolean {
  return pathname.startsWith('/auth/reset-password')
}

function isAuthRoute(pathname: string): boolean {
  return (
    pathname.startsWith('/auth/login') ||
    pathname.startsWith('/auth/register') ||
    pathname.startsWith('/auth/signup') ||
    pathname.startsWith('/auth/forgot-password') ||
    pathname.startsWith('/auth/reset-password') ||
    pathname === '/login' ||
    pathname === '/register'
  )
}

function hasResetGate(): boolean {
  if (typeof window === 'undefined') return false
  return Boolean(window.localStorage.getItem(RESET_GATE_STORAGE_KEY))
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
  const lastHandledSignOutTsRef = useRef<number>(0)

  useEffect(() => {
    let cancelled = false

    // Enforce reset-gate on navigation. If the user is in recovery flow,
    // keep them on /auth/reset-password until they successfully set a new password.
    if (hasResetGate() && !isResetRoute(pathname)) {
      router.replace('/auth/reset-password')
    }

    const handleLostAuth = (reason: 'SIGNED_OUT' | 'TOKEN_REFRESH_FAILED' | 'SESSION_GONE') => {
      if (cancelled) return

      // If auth is lost, the reset gate (if any) should be cleared as well.
      clearResetGate()

      // Persist + broadcast for cross-tab.
      setAuthState('out')
      if (reason === 'TOKEN_REFRESH_FAILED') broadcastAuthEvent('TOKEN_REFRESH_FAILED')
      else broadcastAuthEvent('SIGNED_OUT')

      // UX requirement: when auth is lost after being logged-in => always go home.
      // Avoid redirect loops on auth routes.
      if (!isAuthRoute(pathname) && pathname !== '/') {
        router.replace('/')
      } else {
        router.refresh()
      }
    }

    const init = async () => {
      const { data } = await supabase.auth.getSession()
      const session = data.session
      if (session?.user?.id) {
        hadSessionRef.current = true
        setAuthState('in')
      } else {
        setAuthState('out')
      }
    }

    void init()

    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      // Supabase emits PASSWORD_RECOVERY when a recovery link was opened.
      // Force user into reset page and block navigation until password is updated.
      if ((event as string) === 'PASSWORD_RECOVERY') {
        setResetGate()
        if (!isResetRoute(pathname)) router.replace('/auth/reset-password')
        return
      }

      // Relevant events for "lost auth" UX.
      if (event === 'SIGNED_OUT') {
        clearResetGate()
        handleLostAuth('SIGNED_OUT')
        return
      }
      if ((event as string) === 'TOKEN_REFRESH_FAILED') {
        clearResetGate()
        handleLostAuth('TOKEN_REFRESH_FAILED')
        return
      }

      // Keep a "had session" flag for silent-expiry detection.
      if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
        hadSessionRef.current = true
        setAuthState('in')
      }
    })

    const onStorage = (e: StorageEvent) => {
      if (e.key !== AUTH_BROADCAST_STORAGE_KEY) return
      const parsed = parseAuthBroadcastEvent(e.newValue)
      if (!parsed) return

      // Prevent handling the same event multiple times.
      if (parsed.ts <= lastHandledSignOutTsRef.current) return
      lastHandledSignOutTsRef.current = parsed.ts

      handleLostAuth(parsed.type)
    }

    window.addEventListener('storage', onStorage)

    const interval = window.setInterval(async () => {
      // Silent expiry / stale session guard.
      const { data } = await supabase.auth.getSession()
      const session = data.session

      if (session?.user?.id) {
        hadSessionRef.current = true
        setAuthState('in')
        return
      }

      // Only treat it as "lost auth" if we previously had a session in this tab
      // or global state says we were logged-in.
      const globalState = getAuthState()
      const wasAuthed = hadSessionRef.current || globalState === 'in'
      if (wasAuthed) handleLostAuth('SESSION_GONE')
      else setAuthState('out')
    }, CHECK_INTERVAL_MS)

    return () => {
      cancelled = true
      window.clearInterval(interval)
      window.removeEventListener('storage', onStorage)
      sub.subscription.unsubscribe()
    }
  }, [pathname, router])

  return <>{children}</>
}

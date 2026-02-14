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

function hasResetGateCookie(): boolean {
  if (typeof document === 'undefined') return false
  return document.cookie.split(';').some((c) => c.trim().startsWith(`${RESET_GATE_COOKIE}=`))
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
  return Boolean(window.localStorage.getItem(RESET_GATE_STORAGE_KEY)) || hasResetGateCookie()
}

function getFlowTypeFromUrl(): string | null {
  if (typeof window === 'undefined') return null
  const href = window.location.href

  // Check query string
  try {
    const url = new URL(href)
    const queryType = url.searchParams.get('type')
    if (queryType) return queryType
  } catch {
    // ignore malformed URLs
  }

  // Check hash fragment (Supabase implicit flow puts params after #)
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
  const lastHandledSignOutTsRef = useRef<number>(0)

  useEffect(() => {
    let cancelled = false

    // If the user landed with a recovery or invite link, activate the reset gate.
    // Signup and magiclink flows must NOT be treated as recovery.
    if (urlIsRecoveryOrInviteFlow()) {
      setResetGate()
      if (!isResetRoute(pathname)) {
        router.replace('/auth/reset-password')
      }
    }

    // Enforce reset-gate on navigation (client-side). Middleware should handle server-side,
    // but this covers SPA navigation + cases where middleware isn't applied (e.g., cached).
    if (hasResetGate() && !isResetRoute(pathname)) {
      router.replace('/auth/reset-password')
    }

    const handleLostAuth = (reason: 'SIGNED_OUT' | 'TOKEN_REFRESH_FAILED' | 'SESSION_GONE') => {
      if (cancelled) return

      clearResetGate()

      setAuthState('out')
      if (reason === 'TOKEN_REFRESH_FAILED') broadcastAuthEvent('TOKEN_REFRESH_FAILED')
      else broadcastAuthEvent('SIGNED_OUT')

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

        // If gate is active, enforce it immediately (covers refresh/new tab).
        if (hasResetGate() && !isResetRoute(pathname)) {
          router.replace('/auth/reset-password')
        }
      } else {
        setAuthState('out')
      }
    }

    void init()

    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if ((event as string) === 'PASSWORD_RECOVERY') {
        setResetGate()
        if (!isResetRoute(pathname)) router.replace('/auth/reset-password')
        return
      }

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

      if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
        hadSessionRef.current = true
        setAuthState('in')
      }
    })

    const onStorage = (e: StorageEvent) => {
      if (e.key !== AUTH_BROADCAST_STORAGE_KEY) return
      const parsed = parseAuthBroadcastEvent(e.newValue)
      if (!parsed) return

      if (parsed.ts <= lastHandledSignOutTsRef.current) return
      lastHandledSignOutTsRef.current = parsed.ts

      handleLostAuth(parsed.type)
    }

    window.addEventListener('storage', onStorage)

    const interval = window.setInterval(async () => {
      const { data } = await supabase.auth.getSession()
      const session = data.session

      if (session?.user?.id) {
        hadSessionRef.current = true
        setAuthState('in')

        // keep enforcing gate if active
        if (hasResetGate() && !isResetRoute(pathname)) router.replace('/auth/reset-password')
        return
      }

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

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

function isAuthRoute(pathname: string): boolean {
  return (
    pathname.startsWith('/auth/login') ||
    pathname.startsWith('/auth/register') ||
    pathname.startsWith('/auth/signup') ||
    pathname === '/login' ||
    pathname === '/register'
  )
}

export default function AuthSync({ children }: Props) {
  const router = useRouter()
  const pathname = usePathname() || ''

  const hadSessionRef = useRef(false)
  const lastHandledSignOutTsRef = useRef<number>(0)

  useEffect(() => {
    let cancelled = false

    const handleLostAuth = (reason: 'SIGNED_OUT' | 'TOKEN_REFRESH_FAILED' | 'SESSION_GONE') => {
      if (cancelled) return

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
      // Relevant events for "lost auth" UX.
      if (event === 'SIGNED_OUT') {
        handleLostAuth('SIGNED_OUT')
        return
      }
      if ((event as string) === 'TOKEN_REFRESH_FAILED') {
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

"use client"

import { useEffect, useMemo, useRef, useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabaseClient'
import { setBannedFlag, setModerationReason, setSuspendedFlag } from '@/lib/moderation'

const CHECK_INTERVAL_MS = 25_000

const SUSPENDED_BLOCKED_PREFIXES: string[] = [
  '/write',
  '/notes',
  '/notebook',
  '/saved',
  '/trash',
  '/notifications',
  '/settings',
]

function startsWithPrefix(pathname: string, prefixes: string[]): boolean {
  if (!pathname) return false
  return prefixes.some((p) => pathname === p || pathname.startsWith(`${p}/`))
}

function safeEncode(v: string): string {
  try {
    return encodeURIComponent(v)
  } catch {
    return ''
  }
}

export default function SuspensionSync({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const pathname = usePathname() || ''

  const [isSuspended, setIsSuspended] = useState(false)
  const [isBanned, setIsBanned] = useState(false)

  const shouldGateSuspended = useMemo(() => {
    if (pathname === '/restricted') return false
    if (pathname === '/banned') return false
    if (pathname.startsWith('/admin')) return false
    if (pathname.startsWith('/auth')) return false
    if (pathname === '/' || pathname.startsWith('/inbox') || pathname.startsWith('/contact')) return false
    return startsWithPrefix(pathname, SUSPENDED_BLOCKED_PREFIXES)
  }, [pathname])

  const shouldGateBanned = useMemo(() => {
    if (pathname.startsWith('/banned')) return false
    if (pathname.startsWith('/admin')) return false
    if (pathname.startsWith('/auth')) return false
    return true
  }, [pathname])

  const hadSessionRef = useRef(false)
  const lastRedirectAtRef = useRef(0)

  useEffect(() => {
    let cancelled = false

    const redirectOnce = (to: string) => {
      const now = Date.now()
      if (now - lastRedirectAtRef.current < 750) return
      lastRedirectAtRef.current = now
      router.replace(to)
    }

    const handleBanned = (reason: string | null) => {
      if (cancelled) return
      setIsBanned(true)
      setIsSuspended(false)
      setBannedFlag(true)
      setSuspendedFlag(false)
      setModerationReason(reason ?? null)

      if (shouldGateBanned) {
        redirectOnce(`/banned?from=${safeEncode(pathname)}`)
      }
    }

    const handleSuspended = (reason: string | null) => {
      if (cancelled) return
      setIsSuspended(true)
      setIsBanned(false)
      setSuspendedFlag(true)
      setBannedFlag(false)
      setModerationReason(reason ?? null)

      if (shouldGateSuspended) {
        redirectOnce(`/restricted?from=${safeEncode(pathname)}`)
      }
    }

    const handleClear = () => {
      if (cancelled) return
      setIsSuspended(false)
      setIsBanned(false)
      setSuspendedFlag(false)
      setBannedFlag(false)
      setModerationReason(null)
    }

    const check = async () => {
      const { data } = await supabase.auth.getSession()
      const session = data.session

      if (!session?.user?.id) {
        hadSessionRef.current = false
        handleClear()
        return
      }

      hadSessionRef.current = true

      const { data: row, error } = await supabase
        .from('user_moderation')
        .select('is_suspended, is_banned, reason, ban_reason')
        .eq('user_id', session.user.id)
        .maybeSingle()

      if (error) {
        // best-effort: don't block if table/RLS isn't ready
        handleClear()
        return
      }

      const banned = row?.is_banned === true
      const suspended = row?.is_suspended === true
      const reason = ((row?.ban_reason as string | null) ?? (row?.reason as string | null) ?? null)

      if (banned) handleBanned(reason)
      else if (suspended) handleSuspended(reason)
      else handleClear()
    }

    void check()

    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_OUT') {
        hadSessionRef.current = false
        handleClear()
      }
    })

    const interval = window.setInterval(() => {
      void check()
    }, CHECK_INTERVAL_MS)

    return () => {
      cancelled = true
      window.clearInterval(interval)
      sub.subscription.unsubscribe()
    }
  }, [pathname, router, shouldGateBanned, shouldGateSuspended])

  return <>{children}</>
}

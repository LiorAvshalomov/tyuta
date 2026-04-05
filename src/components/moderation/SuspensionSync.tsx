"use client"

import { useEffect, useMemo, useRef, useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabaseClient'
import {
  setBannedFlag,
  setModerationReason,
  setSuspendedFlag,
  type ModerationStatus,
} from '@/lib/moderation'

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

  const [, setIsSuspended] = useState(false)
  const [, setIsBanned] = useState(false)

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
  const syncedStatusRef = useRef<ModerationStatus | null>(null)
  const moderationChannelRef = useRef<ReturnType<typeof supabase.channel> | null>(null)
  const moderationChannelUserRef = useRef<string | null>(null)

  useEffect(() => {
    let cancelled = false
    let inFlight = false

    const redirectOnce = (to: string) => {
      const now = Date.now()
      if (now - lastRedirectAtRef.current < 750) return
      lastRedirectAtRef.current = now
      router.replace(to)
    }

    const syncPresenceCookie = async (accessToken: string, status: ModerationStatus) => {
      if (syncedStatusRef.current === status) return

      try {
        const res = await fetch('/api/auth/presence', {
          method: 'POST',
          credentials: 'same-origin',
          headers: { Authorization: `Bearer ${accessToken}` },
        })

        if (res.ok) {
          syncedStatusRef.current = status
        }
      } catch {
        // ignore: the DB/local state gate remains authoritative in-tab
      }
    }

    const clearModerationChannel = () => {
      if (!moderationChannelRef.current) return
      void supabase.removeChannel(moderationChannelRef.current)
      moderationChannelRef.current = null
      moderationChannelUserRef.current = null
    }

    const ensureModerationChannel = (userId: string) => {
      if (moderationChannelRef.current && moderationChannelUserRef.current === userId) return

      clearModerationChannel()
      moderationChannelUserRef.current = userId
      moderationChannelRef.current = supabase
        .channel(`moderation-${userId}`)
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'user_moderation', filter: `user_id=eq.${userId}` },
          () => { void check() },
        )
        .subscribe()
    }

    const handleBanned = (reason: string | null, accessToken?: string) => {
      if (cancelled) return
      setIsBanned(true)
      setIsSuspended(false)
      setBannedFlag(true)
      setSuspendedFlag(false)
      setModerationReason(reason ?? null)
      if (accessToken) void syncPresenceCookie(accessToken, 'banned')

      if (shouldGateBanned) {
        redirectOnce(`/banned?from=${safeEncode(pathname)}`)
      }
    }

    const handleSuspended = (reason: string | null, accessToken?: string) => {
      if (cancelled) return
      setIsSuspended(true)
      setIsBanned(false)
      setSuspendedFlag(true)
      setBannedFlag(false)
      setModerationReason(reason ?? null)
      if (accessToken) void syncPresenceCookie(accessToken, 'suspended')

      if (shouldGateSuspended) {
        redirectOnce(`/restricted?from=${safeEncode(pathname)}`)
      }
    }

    const handleClear = (accessToken?: string) => {
      if (cancelled) return
      setIsSuspended(false)
      setIsBanned(false)
      setSuspendedFlag(false)
      setBannedFlag(false)
      setModerationReason(null)
      if (accessToken) void syncPresenceCookie(accessToken, 'none')
    }

    const check = async () => {
      if (cancelled || inFlight) return
      inFlight = true

      try {
        const { data } = await supabase.auth.getSession()
        const session = data.session

        if (!session?.user?.id) {
          hadSessionRef.current = false
          syncedStatusRef.current = null
          clearModerationChannel()
          handleClear()
          return
        }

        hadSessionRef.current = true
        ensureModerationChannel(session.user.id)

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

        if (banned) handleBanned(reason, session.access_token)
        else if (suspended) handleSuspended(reason, session.access_token)
        else handleClear(session.access_token)
      } finally {
        inFlight = false
      }
    }

    void check()

    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_OUT') {
        hadSessionRef.current = false
        syncedStatusRef.current = null
        clearModerationChannel()
        handleClear()
        return
      }

      void check()
    })

    const interval = window.setInterval(() => {
      if (!hadSessionRef.current) return
      if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return
      void check()
    }, CHECK_INTERVAL_MS)

    const handleResume = () => {
      if (!hadSessionRef.current) return
      if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return
      void check()
    }

    document.addEventListener('visibilitychange', handleResume)
    window.addEventListener('focus', handleResume)

    return () => {
      cancelled = true
      window.clearInterval(interval)
      clearModerationChannel()
      document.removeEventListener('visibilitychange', handleResume)
      window.removeEventListener('focus', handleResume)
      sub.subscription.unsubscribe()
    }
  }, [pathname, router, shouldGateBanned, shouldGateSuspended])

  return <>{children}</>
}

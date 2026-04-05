'use client'

import { startTransition, useEffect, useEffectEvent, useRef } from 'react'
import { usePathname, useRouter } from 'next/navigation'

import {
  PROFILE_REFRESH_CHANNEL,
  PROFILE_REFRESH_EVENT,
  PROFILE_REFRESH_STORAGE_KEY,
  getSeenProfileRefreshVersion,
  isProfileRefreshPathname,
  isRecentProfileRefreshPayload,
  markProfileRefreshVersionSeen,
  pathnameMatchesProfileRefresh,
  pickLatestProfileRefreshVersion,
  readProfileRefreshPayload,
  type ProfileRefreshPayload,
} from '@/lib/profileFreshness'

type ProfileRefreshMessage = ProfileRefreshPayload | null

export default function ProfileRouteAutoRefresh() {
  const pathname = usePathname()
  const router = useRouter()
  const lastNavigationRefreshRef = useRef<{ key: string; at: number } | null>(null)
  const pendingRefreshRef = useRef<{ path: string; version: string; at: number } | null>(null)

  const getActivePathname = useEffectEvent(() => {
    if (typeof window === 'undefined') return pathname
    return window.location.pathname
  })

  const requestRefresh = useEffectEvent((targetPath: string, version: string) => {
    const now = Date.now()
    const pending = pendingRefreshRef.current

    if (
      pending?.path === targetPath &&
      pending.version === version &&
      now - pending.at < 5_000
    ) {
      return
    }

    pendingRefreshRef.current = { path: targetPath, version, at: now }

    startTransition(() => {
      router.refresh()
    })
  })

  const refreshIfNeeded = useEffectEvent((targetPath: string, incoming?: ProfileRefreshPayload | null) => {
    if (!isProfileRefreshPathname(targetPath)) return
    if (getActivePathname() !== targetPath) return

    const payload = incoming ?? readProfileRefreshPayload()
    if (!pathnameMatchesProfileRefresh(targetPath, payload)) return

    const latestVersion = pickLatestProfileRefreshVersion(payload?.version)
    if (!latestVersion) return
    if (getSeenProfileRefreshVersion(targetPath) === latestVersion) return

    requestRefresh(targetPath, latestVersion)
  })

  const refreshOnNavigationIfRecent = useEffectEvent((targetPath: string) => {
    if (!isProfileRefreshPathname(targetPath)) return
    if (getActivePathname() !== targetPath) return

    const payload = readProfileRefreshPayload()
    if (!pathnameMatchesProfileRefresh(targetPath, payload)) return
    if (!isRecentProfileRefreshPayload(payload)) return

    const refreshKey = `${targetPath}:${payload?.version ?? ''}`
    const now = Date.now()
    if (
      lastNavigationRefreshRef.current?.key === refreshKey &&
      now - lastNavigationRefreshRef.current.at < 1_000
    ) {
      return
    }
    lastNavigationRefreshRef.current = { key: refreshKey, at: now }
    if (!payload?.version) return
    if (getSeenProfileRefreshVersion(targetPath) === payload.version) return
    requestRefresh(targetPath, payload.version)
  })

  const syncFromServer = useEffectEvent(async (targetPath: string) => {
    if (!isProfileRefreshPathname(targetPath)) return

    const response = await fetch(
      `/api/profile/version?path=${encodeURIComponent(targetPath)}&ts=${Date.now()}`,
      { cache: 'no-store' },
    ).catch(() => null)

    if (!response?.ok) return

    const data = await response.json().catch(() => null) as { version?: string | null } | null
    if (getActivePathname() !== targetPath) return

    const latestVersion = pickLatestProfileRefreshVersion(data?.version)
    if (!latestVersion) return

    const seenVersion = getSeenProfileRefreshVersion(targetPath)
    if (!seenVersion) {
      markProfileRefreshVersionSeen(targetPath, latestVersion)
      return
    }

    if (seenVersion === latestVersion) {
      return
    }

    requestRefresh(targetPath, latestVersion)
  })

  useEffect(() => {
    if (!pathname || !isProfileRefreshPathname(pathname)) return
    refreshOnNavigationIfRecent(pathname)
    void syncFromServer(pathname)
  }, [pathname])

  useEffect(() => {
    if (!pathname || !isProfileRefreshPathname(pathname)) return

    const onStorage = (event: StorageEvent) => {
      if (event.key !== PROFILE_REFRESH_STORAGE_KEY || !event.newValue) return
      if (document.visibilityState !== 'visible') return

      const payload = readProfileRefreshPayload()
      refreshIfNeeded(pathname, payload)
    }

    const onWindowEvent = (event: Event) => {
      if (document.visibilityState !== 'visible') return
      const detail = (event as CustomEvent<ProfileRefreshPayload>).detail
      refreshIfNeeded(pathname, detail ?? null)
    }

    const onFocus = () => {
      void syncFromServer(pathname)
    }

    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        void syncFromServer(pathname)
      }
    }

    const onPageShow = () => {
      const currentPath = window.location.pathname
      if (!isProfileRefreshPathname(currentPath)) return
      void syncFromServer(currentPath)
    }

    const onPopState = () => {
      const currentPath = window.location.pathname
      if (!isProfileRefreshPathname(currentPath)) return
      void syncFromServer(currentPath)
    }

    window.addEventListener('storage', onStorage)
    window.addEventListener(PROFILE_REFRESH_EVENT, onWindowEvent as EventListener)
    window.addEventListener('focus', onFocus)
    window.addEventListener('pageshow', onPageShow)
    window.addEventListener('popstate', onPopState)
    document.addEventListener('visibilitychange', onVisibilityChange)

    let channel: BroadcastChannel | null = null

    if ('BroadcastChannel' in window) {
      try {
        channel = new BroadcastChannel(PROFILE_REFRESH_CHANNEL)
        channel.onmessage = (event) => {
          if (document.visibilityState !== 'visible') return
          refreshIfNeeded(pathname, (event.data as ProfileRefreshMessage) ?? null)
        }
      } catch {
        channel = null
      }
    }

    return () => {
      window.removeEventListener('storage', onStorage)
      window.removeEventListener(PROFILE_REFRESH_EVENT, onWindowEvent as EventListener)
      window.removeEventListener('focus', onFocus)
      window.removeEventListener('pageshow', onPageShow)
      window.removeEventListener('popstate', onPopState)
      document.removeEventListener('visibilitychange', onVisibilityChange)
      channel?.close()
    }
  }, [pathname])

  useEffect(() => {
    if (!pathname || !pathname.startsWith('/u/')) return

    const interval = window.setInterval(() => {
      if (document.visibilityState !== 'visible') return
      void syncFromServer(pathname)
    }, 15_000)

    return () => {
      window.clearInterval(interval)
    }
  }, [pathname])

  return null
}

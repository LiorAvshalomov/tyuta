'use client'

import { startTransition, useEffect, useEffectEvent, useRef } from 'react'
import { usePathname, useRouter } from 'next/navigation'

import {
  POST_REFRESH_CHANNEL,
  POST_REFRESH_EVENT,
  POST_REFRESH_STORAGE_KEY,
  getSeenPostRefreshVersion,
  isPostPathname,
  isRecentPostRefreshPayload,
  markPostRefreshVersionSeen,
  pathnameMatchesPostRefresh,
  pickLatestPostRefreshVersion,
  readPostRefreshPayload,
  type PostRefreshPayload,
} from '@/lib/postFreshness'

export default function PostRouteAutoRefresh() {
  const pathname = usePathname()
  const router = useRouter()
  const lastEventRefreshKeyRef = useRef<string | null>(null)
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

  const refreshOnNavigationIfRecent = useEffectEvent((targetPath: string) => {
    if (!isPostPathname(targetPath)) return
    if (getActivePathname() !== targetPath) return

    const payload = readPostRefreshPayload()
    if (!pathnameMatchesPostRefresh(targetPath, payload)) return
    if (!isRecentPostRefreshPayload(payload)) return

    const refreshKey = `${targetPath}:${payload?.version ?? ''}`
    const now = Date.now()
    if (
      lastNavigationRefreshRef.current?.key === refreshKey &&
      now - lastNavigationRefreshRef.current.at < 1_000
    ) {
      return
    }
    lastNavigationRefreshRef.current = { key: refreshKey, at: now }
    const payloadVersion = payload?.version
    if (!payloadVersion) return
    if (getSeenPostRefreshVersion(targetPath) === payloadVersion) return
    requestRefresh(targetPath, payloadVersion)
  })

  const refreshIfNeeded = useEffectEvent((targetPath: string, incoming?: PostRefreshPayload | null) => {
    if (!isPostPathname(targetPath)) return
    if (getActivePathname() !== targetPath) return

    const payload = incoming ?? readPostRefreshPayload()
    if (!pathnameMatchesPostRefresh(targetPath, payload)) return
    if (!payload?.version) return
    if (getSeenPostRefreshVersion(targetPath) === payload.version) return

    const refreshKey = `${targetPath}:${payload.version}`
    if (lastEventRefreshKeyRef.current === refreshKey) return
    lastEventRefreshKeyRef.current = refreshKey
    requestRefresh(targetPath, payload.version)
  })

  const syncFromServer = useEffectEvent(async (targetPath: string) => {
    if (!isPostPathname(targetPath)) return

    // Decode the slug before re-encoding it as a query param.
    // usePathname() returns the percent-encoded path, so a Hebrew slug like
    // /post/%D7%A9%D7%9C%D7%95%D7%9D must be decoded first to avoid double-
    // encoding (%25D7%25A9...) which would cause the API lookup to fail.
    const rawSlug = targetPath.slice('/post/'.length)
    if (!rawSlug) return
    let slug = rawSlug
    try { slug = decodeURIComponent(rawSlug) } catch { /* keep raw */ }

    const response = await fetch(
      `/api/posts/version?slug=${encodeURIComponent(slug)}&ts=${Date.now()}`,
      { cache: 'no-store' },
    ).catch(() => null)

    if (!response?.ok) return

    const data = await response.json().catch(() => null) as { version?: string | null } | null
    if (getActivePathname() !== targetPath) return

    const latestVersion = pickLatestPostRefreshVersion(data?.version)
    if (!latestVersion) return

    const seenVersion = getSeenPostRefreshVersion(targetPath)
    if (!seenVersion) {
      markPostRefreshVersionSeen(targetPath, latestVersion)
      return
    }

    if (seenVersion === latestVersion) {
      return
    }

    requestRefresh(targetPath, latestVersion)
  })

  useEffect(() => {
    if (!pathname || !isPostPathname(pathname)) return
    refreshOnNavigationIfRecent(pathname)
    void syncFromServer(pathname)
  }, [pathname])

  useEffect(() => {
    if (!pathname || !isPostPathname(pathname)) return

    const onWindowEvent = (event: Event) => {
      if (document.visibilityState !== 'visible') return
      const detail = (event as CustomEvent<PostRefreshPayload>).detail
      refreshIfNeeded(pathname, detail ?? null)
    }

    const onStorage = (event: StorageEvent) => {
      if (event.key !== POST_REFRESH_STORAGE_KEY || !event.newValue) return
      if (document.visibilityState !== 'visible') return
      refreshIfNeeded(pathname, readPostRefreshPayload())
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
      if (!isPostPathname(currentPath)) return
      void syncFromServer(currentPath)
    }

    const onPopState = () => {
      const currentPath = window.location.pathname
      if (!isPostPathname(currentPath)) return
      void syncFromServer(currentPath)
    }

    window.addEventListener(POST_REFRESH_EVENT, onWindowEvent as EventListener)
    window.addEventListener('storage', onStorage)
    window.addEventListener('focus', onFocus)
    window.addEventListener('pageshow', onPageShow)
    window.addEventListener('popstate', onPopState)
    document.addEventListener('visibilitychange', onVisibilityChange)

    let channel: BroadcastChannel | null = null

    if ('BroadcastChannel' in window) {
      try {
        channel = new BroadcastChannel(POST_REFRESH_CHANNEL)
        channel.onmessage = (event) => {
          if (document.visibilityState !== 'visible') return
          refreshIfNeeded(pathname, (event.data as PostRefreshPayload | null) ?? null)
        }
      } catch {
        channel = null
      }
    }

    return () => {
      window.removeEventListener(POST_REFRESH_EVENT, onWindowEvent as EventListener)
      window.removeEventListener('storage', onStorage)
      window.removeEventListener('focus', onFocus)
      window.removeEventListener('pageshow', onPageShow)
      window.removeEventListener('popstate', onPopState)
      document.removeEventListener('visibilitychange', onVisibilityChange)
      channel?.close()
    }
  }, [pathname])

  useEffect(() => {
    if (!pathname || !isPostPathname(pathname)) return

    const interval = window.setInterval(() => {
      if (document.visibilityState !== 'visible') return
      void syncFromServer(pathname)
    }, 8_000)

    return () => {
      window.clearInterval(interval)
    }
  }, [pathname])

  return null
}

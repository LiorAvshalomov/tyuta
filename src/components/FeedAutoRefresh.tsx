'use client'

import { startTransition, useEffect, useEffectEvent, useLayoutEffect, useRef } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import {
  FEED_REFRESH_CHANNEL,
  FEED_REFRESH_EVENT,
  FEED_REFRESH_STORAGE_KEY,
  getSeenFeedVersion,
  isFeedPathname,
  isRecentFeedRefreshVersion,
  markFeedVersionSeen,
  pickLatestFeedVersion,
  readFeedRefreshVersion,
} from '@/lib/feedFreshness'

type FeedRefreshMessage = {
  version?: string | null
}

export default function FeedAutoRefresh({ initialVersion = null }: { initialVersion?: string | null }) {
  const pathname = usePathname()
  const router = useRouter()
  const lastNavigationRefreshRef = useRef<{ key: string; at: number } | null>(null)
  const pendingRefreshRef = useRef<{ path: string; version: string; at: number } | null>(null)

  const getActivePathname = useEffectEvent(() => {
    if (typeof window === 'undefined') return pathname
    return window.location.pathname
  })

  useLayoutEffect(() => {
    if (!pathname || !isFeedPathname(pathname)) return
    if (!initialVersion) return
    markFeedVersionSeen(pathname, initialVersion)
    if (
      pendingRefreshRef.current?.path === pathname &&
      pendingRefreshRef.current.version === initialVersion
    ) {
      pendingRefreshRef.current = null
    }
  }, [initialVersion, pathname])

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

  const applyVersionIfNeeded = useEffectEvent((targetPath: string, incomingVersion?: string | null) => {
    if (!isFeedPathname(targetPath)) return
    if (getActivePathname() !== targetPath) return

    const latestVersion = pickLatestFeedVersion(incomingVersion, readFeedRefreshVersion())
    if (!latestVersion) return
    if (getSeenFeedVersion(targetPath) === latestVersion) return

    requestRefresh(targetPath, latestVersion)
  })

  const syncFromServer = useEffectEvent(async (targetPath: string) => {
    if (!isFeedPathname(targetPath)) return

    const url = `/api/posts/feed-version?path=${encodeURIComponent(targetPath)}&ts=${Date.now()}`
    const response = await fetch(url, {
      cache: 'no-store',
    }).catch(() => null)

    if (!response?.ok) return

    const data = await response.json().catch(() => null) as { version?: string | null } | null
    if (getActivePathname() !== targetPath) return

    const latestVersion = pickLatestFeedVersion(data?.version, readFeedRefreshVersion())

    if (!latestVersion) return

    const seenVersion = getSeenFeedVersion(targetPath)
    if (!seenVersion) {
      markFeedVersionSeen(targetPath, latestVersion)
      return
    }

    if (seenVersion === latestVersion) {
      return
    }

    requestRefresh(targetPath, latestVersion)
  })

  useEffect(() => {
    if (!pathname || !isFeedPathname(pathname)) return
    const latestLocalVersion = readFeedRefreshVersion()
    if (isRecentFeedRefreshVersion(latestLocalVersion)) {
      const refreshKey = `${pathname}:${latestLocalVersion}`
      const now = Date.now()
      if (
        lastNavigationRefreshRef.current?.key !== refreshKey ||
        now - lastNavigationRefreshRef.current.at >= 1_000
      ) {
        lastNavigationRefreshRef.current = { key: refreshKey, at: now }
        startTransition(() => {
          router.refresh()
        })
      }
    }
    void syncFromServer(pathname)
  }, [pathname, router])

  useEffect(() => {
    if (!pathname || !isFeedPathname(pathname)) return

    const interval = window.setInterval(() => {
      if (document.visibilityState !== 'visible') return
      void syncFromServer(pathname)
    }, 15_000)

    return () => {
      window.clearInterval(interval)
    }
  }, [pathname])

  useEffect(() => {
    if (!isFeedPathname(pathname)) return

    const onStorage = (event: StorageEvent) => {
      if (event.key !== FEED_REFRESH_STORAGE_KEY || !event.newValue) return
      if (document.visibilityState !== 'visible') return
      applyVersionIfNeeded(pathname, event.newValue)
    }

    const onWindowEvent = (event: Event) => {
      if (document.visibilityState !== 'visible') return

      const detail = (event as CustomEvent<FeedRefreshMessage>).detail
      applyVersionIfNeeded(pathname, detail?.version ?? null)
    }

    const onFocus = () => {
      void syncFromServer(pathname)
    }

    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        void syncFromServer(pathname)
      }
    }

    const onPopState = () => {
      const currentPath = window.location.pathname
      if (!isFeedPathname(currentPath)) return
      void syncFromServer(currentPath)
    }

    let channel: BroadcastChannel | null = null

    const openChannel = () => {
      if (!('BroadcastChannel' in window)) return
      try {
        channel = new BroadcastChannel(FEED_REFRESH_CHANNEL)
        channel.onmessage = (event: MessageEvent) => {
          if (document.visibilityState !== 'visible') return
          const data = event.data as FeedRefreshMessage | null
          applyVersionIfNeeded(pathname, data?.version ?? null)
        }
      } catch {
        channel = null
      }
    }

    // Close BroadcastChannel before the page enters bfcache so the browser
    // can freeze and restore it instantly on back/forward navigation.
    const onPageHide = () => {
      channel?.close()
      channel = null
    }

    // On bfcache restoration (event.persisted === true) reopen the channel
    // and sync in case content changed while the page was frozen.
    const onPageShow = (event: PageTransitionEvent) => {
      const currentPath = window.location.pathname
      if (!isFeedPathname(currentPath)) return
      if (event.persisted) {
        openChannel()
      }
      void syncFromServer(currentPath)
    }

    openChannel()

    window.addEventListener('storage', onStorage)
    window.addEventListener(FEED_REFRESH_EVENT, onWindowEvent as EventListener)
    window.addEventListener('focus', onFocus)
    window.addEventListener('pagehide', onPageHide)
    window.addEventListener('pageshow', onPageShow as EventListener)
    window.addEventListener('popstate', onPopState)
    document.addEventListener('visibilitychange', onVisibilityChange)

    return () => {
      window.removeEventListener('storage', onStorage)
      window.removeEventListener(FEED_REFRESH_EVENT, onWindowEvent as EventListener)
      window.removeEventListener('focus', onFocus)
      window.removeEventListener('pagehide', onPageHide)
      window.removeEventListener('pageshow', onPageShow as EventListener)
      window.removeEventListener('popstate', onPopState)
      document.removeEventListener('visibilitychange', onVisibilityChange)
      channel?.close()
    }
  }, [pathname])

  return null
}

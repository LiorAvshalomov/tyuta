'use client'

import { startTransition, useEffect, useEffectEvent } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import {
  FEED_REFRESH_CHANNEL,
  FEED_REFRESH_EVENT,
  FEED_REFRESH_STORAGE_KEY,
  getSeenFeedVersion,
  hasFeedRefreshBootstrapped,
  isFeedPathname,
  markFeedVersionSeen,
  markFeedRefreshBootstrapped,
  pickLatestFeedVersion,
  readFeedRefreshVersion,
} from '@/lib/feedFreshness'

type FeedRefreshMessage = {
  version?: string | null
}

export default function FeedAutoRefresh() {
  const pathname = usePathname()
  const router = useRouter()

  const getActivePathname = useEffectEvent(() => {
    if (typeof window === 'undefined') return pathname
    return window.location.pathname
  })

  const applyVersionIfNeeded = useEffectEvent((targetPath: string, incomingVersion?: string | null) => {
    if (!isFeedPathname(targetPath)) return
    if (getActivePathname() !== targetPath) return

    const latestVersion = pickLatestFeedVersion(incomingVersion, readFeedRefreshVersion())
    if (!latestVersion) return
    if (getSeenFeedVersion(targetPath) === latestVersion) return

    markFeedVersionSeen(targetPath, latestVersion)
    startTransition(() => {
      router.refresh()
    })
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
    const hasBootstrapped = hasFeedRefreshBootstrapped()
    markFeedRefreshBootstrapped()

    if (!seenVersion) {
      markFeedVersionSeen(targetPath, latestVersion)
      if (!hasBootstrapped) return
    } else if (seenVersion === latestVersion) {
      return
    }

    markFeedVersionSeen(targetPath, latestVersion)
    startTransition(() => {
      router.refresh()
    })
  })

  useEffect(() => {
    if (!pathname || !isFeedPathname(pathname)) return
    void syncFromServer(pathname)
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

    const onPageShow = () => {
      const currentPath = window.location.pathname
      if (!isFeedPathname(currentPath)) return
      void syncFromServer(currentPath)
    }

    const onPopState = () => {
      const currentPath = window.location.pathname
      if (!isFeedPathname(currentPath)) return
      void syncFromServer(currentPath)
    }

    window.addEventListener('storage', onStorage)
    window.addEventListener(FEED_REFRESH_EVENT, onWindowEvent as EventListener)
    window.addEventListener('focus', onFocus)
    window.addEventListener('pageshow', onPageShow)
    window.addEventListener('popstate', onPopState)
    document.addEventListener('visibilitychange', onVisibilityChange)

    let channel: BroadcastChannel | null = null

    if ('BroadcastChannel' in window) {
      try {
        channel = new BroadcastChannel(FEED_REFRESH_CHANNEL)
        channel.onmessage = event => {
          if (document.visibilityState !== 'visible') return

          const data = event.data as FeedRefreshMessage | null
          applyVersionIfNeeded(pathname, data?.version ?? null)
        }
      } catch {
        channel = null
      }
    }

    return () => {
      window.removeEventListener('storage', onStorage)
      window.removeEventListener(FEED_REFRESH_EVENT, onWindowEvent as EventListener)
      window.removeEventListener('focus', onFocus)
      window.removeEventListener('pageshow', onPageShow)
      window.removeEventListener('popstate', onPopState)
      document.removeEventListener('visibilitychange', onVisibilityChange)
      channel?.close()
    }
  }, [pathname])

  return null
}

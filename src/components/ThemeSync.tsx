'use client'

import { usePathname } from 'next/navigation'
import { useEffect, useLayoutEffect } from 'react'
import { applyTheme, getStoredTheme, resolveTheme } from '@/lib/theme'

function syncTheme() {
  applyTheme(resolveTheme(getStoredTheme()))
}

const useThemeLayoutEffect =
  typeof window === 'undefined' ? useEffect : useLayoutEffect

export default function ThemeSync() {
  const pathname = usePathname()

  useThemeLayoutEffect(() => {
    syncTheme()
  }, [pathname])

  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)')
    const onMediaChange = () => {
      if (getStoredTheme() === 'system') syncTheme()
    }
    const onStorage = (event: StorageEvent) => {
      if (event.key === 'tyuta:theme') syncTheme()
    }
    const onFocus = () => syncTheme()
    const onVisibility = () => {
      if (document.visibilityState === 'visible') syncTheme()
    }

    if (typeof media.addEventListener === 'function') {
      media.addEventListener('change', onMediaChange)
    } else {
      media.addListener(onMediaChange)
    }

    window.addEventListener('storage', onStorage)
    window.addEventListener('focus', onFocus)
    document.addEventListener('visibilitychange', onVisibility)

    return () => {
      if (typeof media.removeEventListener === 'function') {
        media.removeEventListener('change', onMediaChange)
      } else {
        media.removeListener(onMediaChange)
      }
      window.removeEventListener('storage', onStorage)
      window.removeEventListener('focus', onFocus)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [])

  return null
}

'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useRef, useState, type ComponentProps, type FocusEvent, type MouseEvent, type PointerEvent, type TouchEvent } from 'react'

type FeedIntentLinkProps = Omit<ComponentProps<typeof Link>, 'href' | 'prefetch'> & {
  href: string
}

const NON_MOBILE_QUERY = '(min-width: 768px)'
const HOVERABLE_QUERY = '(min-width: 768px) and (hover: hover) and (pointer: fine)'

function supportsMediaQueryListeners(query: MediaQueryList) {
  return typeof query.addEventListener === 'function'
}

export default function FeedIntentLink({
  href,
  onMouseEnter,
  onFocus,
  onPointerDown,
  onTouchStart,
  ...props
}: FeedIntentLinkProps) {
  const router = useRouter()
  const prefetchedRef = useRef(false)
  const [allowViewportPrefetch, setAllowViewportPrefetch] = useState(false)

  useEffect(() => {
    if (typeof window === 'undefined') return

    const nonMobileMq = window.matchMedia(NON_MOBILE_QUERY)
    const hoverableMq = window.matchMedia(HOVERABLE_QUERY)
    const sync = () => {
      setAllowViewportPrefetch(nonMobileMq.matches && !hoverableMq.matches)
    }

    sync()

    if (supportsMediaQueryListeners(nonMobileMq) && supportsMediaQueryListeners(hoverableMq)) {
      nonMobileMq.addEventListener('change', sync)
      hoverableMq.addEventListener('change', sync)
      return () => {
        nonMobileMq.removeEventListener('change', sync)
        hoverableMq.removeEventListener('change', sync)
      }
    }

    nonMobileMq.addListener(sync)
    hoverableMq.addListener(sync)
    return () => {
      nonMobileMq.removeListener(sync)
      hoverableMq.removeListener(sync)
    }
  }, [])

  const prefetchNow = useCallback(() => {
    if (prefetchedRef.current) return
    if (typeof window === 'undefined') return
    if (!window.matchMedia(NON_MOBILE_QUERY).matches) return

    prefetchedRef.current = true
    void router.prefetch(href)
  }, [href, router])

  const handleMouseEnter = useCallback((event: MouseEvent<HTMLAnchorElement>) => {
    onMouseEnter?.(event)
    if (!event.defaultPrevented && typeof window !== 'undefined' && window.matchMedia(HOVERABLE_QUERY).matches) {
      prefetchNow()
    }
  }, [onMouseEnter, prefetchNow])

  const handleFocus = useCallback((event: FocusEvent<HTMLAnchorElement>) => {
    onFocus?.(event)
    if (!event.defaultPrevented) {
      prefetchNow()
    }
  }, [onFocus, prefetchNow])

  const handlePointerDown = useCallback((event: PointerEvent<HTMLAnchorElement>) => {
    onPointerDown?.(event)
    if (!event.defaultPrevented) {
      prefetchNow()
    }
  }, [onPointerDown, prefetchNow])

  const handleTouchStart = useCallback((event: TouchEvent<HTMLAnchorElement>) => {
    onTouchStart?.(event)
    if (!event.defaultPrevented) {
      prefetchNow()
    }
  }, [onTouchStart, prefetchNow])

  return (
    <Link
      {...props}
      href={href}
      prefetch={allowViewportPrefetch ? undefined : false}
      onMouseEnter={handleMouseEnter}
      onFocus={handleFocus}
      onPointerDown={handlePointerDown}
      onTouchStart={handleTouchStart}
    />
  )
}

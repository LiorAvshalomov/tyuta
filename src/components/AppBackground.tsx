"use client"

import type { CSSProperties } from 'react'
import { usePathname } from 'next/navigation'

const AUTH_ROUTES = ['/auth/login', '/auth/register', '/auth/signup', '/login', '/register']

const FEED_LAYER_STYLE: CSSProperties = {
  willChange: 'transform',
  transform: 'translate3d(0,0,0)',
  backfaceVisibility: 'hidden',
}

const FEED_GRAIN_STYLE: CSSProperties = {
  willChange: 'opacity',
  transform: 'translate3d(0,0,0)',
  backfaceVisibility: 'hidden',
}

const FEED_ROOT_STYLE: CSSProperties = {
  contain: 'paint',
}

export default function AppBackground() {
  const pathname = usePathname() || ''
  if (pathname.startsWith('/banned') || pathname.startsWith('/restricted')) return null

  const isAuth = AUTH_ROUTES.some((p) => pathname.startsWith(p))
  if (isAuth) return null

  const isFeedRoute = pathname === '/' || pathname.startsWith('/c/')
  const rootStyle = isFeedRoute ? FEED_ROOT_STYLE : undefined
  const layerStyle = isFeedRoute ? FEED_LAYER_STYLE : undefined
  const grainStyle = isFeedRoute ? FEED_GRAIN_STYLE : undefined

  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 -z-10" style={rootStyle}>
      <div
        className="absolute inset-0 dark:hidden bg-[radial-gradient(1200px_800px_at_80%_10%,rgba(0,0,0,0.04),transparent_60%),radial-gradient(900px_700px_at_10%_20%,rgba(0,0,0,0.03),transparent_60%),linear-gradient(to_bottom,rgba(250,248,243,1),rgba(255,255,255,1))]"
        style={layerStyle}
      />

      <div
        className="absolute inset-0"
        style={{
          background: [
            'radial-gradient(ellipse 640px 480px at 10% -5%, oklch(0 0 0 / 0.05) 0%, transparent 65%)',
            'radial-gradient(ellipse 576px 432px at 90% 35%, oklch(0 0 0 / 0.04) 0%, transparent 65%)',
            'radial-gradient(ellipse 576px 432px at 30% 90%, oklch(0 0 0 / 0.04) 0%, transparent 65%)',
          ].join(','),
          ...layerStyle,
        }}
      />

      <div className="pd-grain absolute inset-0 opacity-[0.25]" style={grainStyle} />
    </div>
  )
}

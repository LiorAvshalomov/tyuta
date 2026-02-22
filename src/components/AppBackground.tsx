"use client"

import { usePathname } from 'next/navigation'

const AUTH_ROUTES = ['/auth/login', '/auth/register', '/auth/signup', '/login', '/register']

export default function AppBackground() {
  const pathname = usePathname()
  if (pathname?.startsWith('/banned') || pathname?.startsWith('/restricted')) return null
  const isAuth = AUTH_ROUTES.some((p) => pathname.startsWith(p))
  if (isAuth) return null

  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 -z-10">
      {/* soft base — hidden in dark mode (body bg-background handles the dark canvas) */}
      <div className="absolute inset-0 dark:hidden bg-[radial-gradient(1200px_800px_at_80%_10%,rgba(0,0,0,0.04),transparent_60%),radial-gradient(900px_700px_at_10%_20%,rgba(0,0,0,0.03),transparent_60%),linear-gradient(to_bottom,rgba(250,248,243,1),rgba(255,255,255,1))]" />

      {/* subtle blobs — bg-foreground/N auto-adapts: dark blobs on light, light blobs on dark */}
      <div className="absolute -top-24 left-10 h-80 w-80 rounded-full bg-foreground/5 blur-3xl" />
      <div className="absolute top-40 right-16 h-72 w-72 rounded-full bg-foreground/[0.04] blur-3xl" />
      <div className="absolute bottom-10 left-1/3 h-72 w-72 rounded-full bg-foreground/[0.04] blur-3xl" />

      {/* light grain */}
      <div className="pd-grain absolute inset-0 opacity-[0.25]" />
    </div>
  )
}

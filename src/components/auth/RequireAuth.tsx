"use client"

import { usePathname, useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'
import { getAuthState, waitForAuthResolution } from '@/lib/auth/authEvents'
import { buildLoginRedirect } from '@/lib/auth/protectedRoutes'
import { getBannedFlag, getSuspendedFlag } from '@/lib/moderation'

type Props = {
  children: React.ReactNode
  unauthRedirectTo?: string
}

export default function RequireAuth({ children, unauthRedirectTo = '/auth/login' }: Props) {
  const router = useRouter()
  const pathname = usePathname() || ''
  const [ready, setReady] = useState(false)

  useEffect(() => {
    let cancelled = false

    // Fast client-side moderation gate to avoid hydration flashes.
    // Source of truth is still DB + <SuspensionSync />, but this blocks navigation instantly.
    if (getBannedFlag()) {
      if (!pathname.startsWith('/banned')) {
        router.replace('/banned')
        return
      }
    }

    if (getSuspendedFlag()) {
      const blocked = ['/write', '/notes', '/notebook', '/saved', '/trash', '/notifications', '/settings']
      if (blocked.some((p) => pathname === p || pathname.startsWith(`${p}/`))) {
        router.replace('/restricted')
        return
      }
    }

    const redirectToUnauth = () => {
      if (unauthRedirectTo === '/auth/login') {
        router.replace(buildLoginRedirect(pathname))
        return
      }
      const qs = new URLSearchParams()
      qs.set('next', pathname)
      router.replace(`${unauthRedirectTo}?${qs.toString()}`)
    }

    const check = async () => {
      // Fast path: session already hydrated in memory (same-tab navigation, post-login)
      const { data } = await supabase.auth.getSession()
      if (data.session?.user?.id) {
        if (!cancelled) setReady(true)
        return
      }

      // Optimistic path: localStorage says user was logged in.
      // Show content immediately; AuthSync will redirect to login if the RT cookie
      // is actually expired. Avoids a visible skeleton on every cold-start navigation
      // to a protected route for a known-logged-in user.
      if (getAuthState() === 'in') {
        if (!cancelled) setReady(true)
        return
      }

      // Wait for AuthSync to resolve this tab's auth state. This avoids both:
      // 1. duplicate refresh requests, and
      // 2. the previous 8-second spinner on a confirmed logged-out visit.
      const resolution = await waitForAuthResolution(8000)
      if (cancelled) return

      if (resolution === 'authenticated') {
        const hydrated = await supabase.auth.getSession()
        if (!cancelled && hydrated.data.session?.user?.id) {
          setReady(true)
          return
        }
      }

      redirectToUnauth()
    }

    void check()
    return () => {
      cancelled = true
    }
  }, [pathname, router, unauthRedirectTo])

  if (!ready) {
    // Stable skeleton prevents CLS: occupies the same vertical space as children
    // so there is no layout jump when auth resolves and content mounts.
    return (
      <div className="min-h-screen animate-pulse" aria-hidden="true">
        <div className="mx-auto max-w-6xl px-3 py-6 space-y-4">
          <div className="h-32 rounded-3xl bg-neutral-100 dark:bg-muted/40" />
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="h-28 rounded-2xl bg-neutral-100 dark:bg-muted/40" />
            ))}
          </div>
        </div>
      </div>
    )
  }
  return <>{children}</>
}

"use client"

import { usePathname, useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'
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
      const blocked = ['/write','/notes','/notebook','/saved','/trash','/notifications','/settings']
      if (blocked.some((p) => pathname === p || pathname.startsWith(`${p}/`))) {
        router.replace('/restricted')
        return
      }
    }

    const check = async () => {
      const { data } = await supabase.auth.getSession()
      const ok = Boolean(data.session?.user?.id)
      if (!ok) {
        // Direct access to protected routes => login.
        // (Lost-session redirects are handled globally by <AuthSync />.)
        const qs = new URLSearchParams()
        // Keep return path for post-login UX (optional, no breaking changes).
        qs.set('next', pathname)
        router.replace(`${unauthRedirectTo}?${qs.toString()}`)
        return
      }

      if (!cancelled) setReady(true)
    }

    void check()
    return () => {
      cancelled = true
    }
  }, [pathname, router, unauthRedirectTo])

  if (!ready) return null
  return <>{children}</>
}

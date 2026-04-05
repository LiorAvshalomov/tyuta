'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabaseClient'
import { waitForAuthResolution } from '@/lib/auth/authEvents'
import { buildLoginRedirect } from '@/lib/auth/protectedRoutes'

export default function AdminGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const [ok, setOk] = useState<boolean | null>(null)

  useEffect(() => {
    let cancelled = false

    const redirectToLogin = () => router.replace(buildLoginRedirect('/admin'))

    const checkAdmin = async (accessToken: string) => {
      const res = await fetch('/api/admin/me', {
        headers: { Authorization: `Bearer ${accessToken}` },
      })
      if (cancelled) return
      if (res.status === 401) {
        redirectToLogin()
        return
      }
      if (!res.ok) {
        router.replace('/')
        return
      }
      setOk(true)
    }

    const run = async () => {
      const { data } = await supabase.auth.getSession()
      if (data.session?.access_token) {
        await checkAdmin(data.session.access_token)
        return
      }

      const resolution = await waitForAuthResolution(8000)
      if (cancelled) return

      if (resolution === 'unauthenticated') {
        redirectToLogin()
        return
      }

      if (resolution === 'authenticated') {
        const hydrated = await supabase.auth.getSession()
        const accessToken = hydrated.data.session?.access_token
        if (accessToken) {
          await checkAdmin(accessToken)
          return
        }
      }

      // Unknown / timed-out auth state: fail closed without advertising the admin area.
      router.replace('/')
    }

    void run().catch(() => {
      if (!cancelled) router.replace('/')
    })

    return () => {
      cancelled = true
    }
  }, [router])

  if (ok !== true) {
    return (
      <div className="flex h-[100dvh] items-center justify-center bg-neutral-50 dark:bg-neutral-950">
        <div className="flex flex-col items-center gap-3">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-neutral-300 border-t-neutral-700 dark:border-neutral-700 dark:border-t-neutral-300" />
          <span className="text-xs font-medium text-neutral-400 dark:text-neutral-500">טוען...</span>
        </div>
      </div>
    )
  }

  return <>{children}</>
}

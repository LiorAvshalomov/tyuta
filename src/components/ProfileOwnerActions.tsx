'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabaseClient'
import { waitForClientSession } from '@/lib/auth/clientSession'

export default function ProfileOwnerActions({ profileId }: { profileId: string }) {
  const [isOwner, setIsOwner] = useState(false)

  useEffect(() => {
    let mounted = true
    const syncOwnerState = (nextUserId: string | null) => {
      if (!mounted) return
      setIsOwner(Boolean(nextUserId && nextUserId === profileId))
    }

    const loadOwner = async () => {
      const resolution = await waitForClientSession(5000)
      syncOwnerState(resolution.status === 'authenticated' ? resolution.user.id : null)
    }

    void loadOwner()

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_OUT') {
        syncOwnerState(null)
        return
      }

      if (session?.user?.id) {
        syncOwnerState(session.user.id)
      }
    })

    return () => {
      mounted = false
      subscription.unsubscribe()
    }
  }, [profileId])

  if (!isOwner) return null

  return (
    <div className="flex flex-wrap items-center gap-2 shrink-0">
      <Link
        href="/settings/profile"
        className="rounded-xl border px-3 py-2 text-sm font-semibold hover:bg-neutral-50"
      >
        עריכת פרופיל
      </Link>

    </div>
  )
}

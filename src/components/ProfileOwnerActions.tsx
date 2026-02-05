'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabaseClient'

export default function ProfileOwnerActions({ profileId }: { profileId: string }) {
  const [isOwner, setIsOwner] = useState(false)

  useEffect(() => {
    let mounted = true

    ;(async () => {
      const { data } = await supabase.auth.getUser()
      const uid = data.user?.id
      if (!mounted) return
      setIsOwner(Boolean(uid && uid === profileId))
    })()

    return () => {
      mounted = false
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

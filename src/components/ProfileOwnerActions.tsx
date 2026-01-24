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
    <div className="flex flex-col gap-2 shrink-0 max-[767px]:w-full max-[767px]:flex-row">
      <Link
        href="/settings/profile"
        className="rounded-xl border px-3 py-2 text-sm font-semibold hover:bg-neutral-50 max-[767px]:flex-1 max-[767px]:text-center max-[767px]:py-3"
      >
        עריכת פרופיל
      </Link>

      <Link
        href="/write"
        className="rounded-xl bg-black px-3 py-2 text-center text-sm font-semibold text-white hover:bg-black/90 max-[767px]:flex-1 max-[767px]:py-3"
      >
        כתיבת פוסט
      </Link>
    </div>
  )
}

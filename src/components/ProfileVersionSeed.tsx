'use client'

import { useLayoutEffect } from 'react'

import { markProfileRefreshVersionSeen } from '@/lib/profileFreshness'

export default function ProfileVersionSeed({
  pathname,
  version,
}: {
  pathname: string
  version: string | null
}) {
  useLayoutEffect(() => {
    if (!pathname || !version) return
    markProfileRefreshVersionSeen(pathname, version)
  }, [pathname, version])

  return null
}

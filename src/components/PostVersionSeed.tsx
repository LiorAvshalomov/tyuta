'use client'

import { useLayoutEffect } from 'react'

import { markPostRefreshVersionSeen } from '@/lib/postFreshness'

export default function PostVersionSeed({
  pathname,
  version,
}: {
  pathname: string
  version: string | null
}) {
  useLayoutEffect(() => {
    if (!pathname || !version) return
    markPostRefreshVersionSeen(pathname, version)
  }, [pathname, version])

  return null
}

'use client'

import { useEffect, useState } from 'react'

const ENABLED = process.env.NEXT_PUBLIC_PROFILE_VIEWS_ENABLED === 'true'

type Props = { username: string }

export default function ProfileViewCount({ username }: Props) {
  const [total, setTotal] = useState<number | null>(null)

  useEffect(() => {
    if (!ENABLED) return
    let cancelled = false
    fetch(`/api/profile/${encodeURIComponent(username)}/views`)
      .then(r => r.ok ? r.json() as Promise<{ total: number }> : Promise.reject())
      .then(body => { if (!cancelled) setTotal(body.total) })
      .catch(() => { /* silent — never break UX */ })
    return () => { cancelled = true }
  }, [username])

  if (!ENABLED || total === null) return null

  return (
    <div className="flex items-center justify-center gap-2 rounded-full border border-neutral-200 bg-neutral-50 px-4 py-2 transition-colors hover:bg-neutral-100 dark:border-border dark:bg-muted dark:hover:bg-muted/80">
      <span className="text-xs text-neutral-500 dark:text-muted-foreground">צפיות:</span>
      <span className="text-sm font-bold">{total.toLocaleString('he-IL')}</span>
    </div>
  )
}

'use client'

import { useEffect, useState } from 'react'
import { heRelativeTime } from '@/lib/time/heRelativeTime'
import { formatDateTimeHe } from '@/lib/time'

export function RelativeTime({ iso, className }: { iso: string; className?: string }) {
  const [label, setLabel] = useState(heRelativeTime(iso))

  useEffect(() => {
    setLabel(heRelativeTime(iso))
  }, [iso])

  return (
    <span title={formatDateTimeHe(iso)} className={className} suppressHydrationWarning>
      {label}
    </span>
  )
}

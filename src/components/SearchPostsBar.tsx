'use client'

import { useMemo, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'

export default function SearchPostsBar() {
  const router = useRouter()
  const searchParams = useSearchParams()

  const initialQ = searchParams.get('q') ?? ''
  const [q, setQ] = useState(initialQ)

  const url = useMemo(() => {
    const sp = new URLSearchParams()
    const trimmed = q.trim()
    if (trimmed) sp.set('q', trimmed)
    // keep a stable default sort so results are predictable
    sp.set('sort', searchParams.get('sort') ?? 'recent')
    return `/search?${sp.toString()}`
  }, [q, searchParams])

  function apply() {
    router.push(url)
  }

  return (
    <div className="flex items-center gap-2" dir="rtl">
      <input
        value={q}
        onChange={e => setQ(e.target.value)}
        onKeyDown={e => {
          if (e.key === 'Enter') apply()
        }}
        placeholder="חפש פוסטים..."
        className="h-10 rounded-full border border-border bg-card text-foreground placeholder:text-muted-foreground dark:bg-muted dark:focus:bg-muted px-4 text-sm outline-none focus:ring-2 focus:ring-black/10 dark:focus:ring-foreground/10"
        style={{ width: 240 }}
      />

     <button
  type="button"
  onClick={apply}
  className="
    h-10 shrink-0 rounded-full bg-black px-4
    text-sm  font-semibold text-white
    cursor-pointer
    transition
    hover:bg-neutral-900
    shadow-sm hover:shadow-md
    active:scale-[0.98]
    active:opacity-90
    focus:outline-none focus:ring-4 
  "
>
  חפש
</button>
    </div>
  )
}

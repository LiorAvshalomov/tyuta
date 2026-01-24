'use client'

import { useMemo, useState } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'

export default function SearchPostsBar() {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  const initialQ = searchParams.get('q') ?? ''
  const [q, setQ] = useState(initialQ)

  const url = useMemo(() => {
    const sp = new URLSearchParams(searchParams.toString())
    if (q.trim()) sp.set('q', q.trim())
    else sp.delete('q')
    return `${pathname}?${sp.toString()}`
  }, [pathname, q, searchParams])

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
      className="h-10 rounded-full border bg-white px-4 text-sm outline-none focus:ring-2 focus:ring-black/10"
      style={{ width: 240 }}   // ✅ זה מה שמקצר באמת את השדה
    />

    <button
      type="button"
      onClick={apply}
      className="h-10 shrink-0 rounded-full bg-black px-4 text-xs font-semibold text-white hover:opacity-90"
    >
      חפש
    </button>
  </div>
)
}

'use client'

import { useEffect, useState } from 'react'

/**
 * AnimatedIntro
 * - Plays only once per browser session (sessionStorage)
 * - Decorative: does not block interaction.
 */
export default function AnimatedIntro() {
  const [show, setShow] = useState(false)

  useEffect(() => {
    const key = 'pd_auth_intro_v1'
    const already = typeof window !== 'undefined' ? window.sessionStorage.getItem(key) : '1'
    if (!already) {
      setShow(true)
      window.sessionStorage.setItem(key, '1')
      const t = window.setTimeout(() => setShow(false), 1400)
      return () => window.clearTimeout(t)
    }
    setShow(false)
  }, [])

  if (!show) return null

  return (
    <div className="pointer-events-none mb-6 flex items-center justify-center">
      <div className="pd-intro inline-flex items-center gap-2 rounded-full border border-black/10 bg-white/60 px-4 py-2 text-sm font-semibold text-black/70 shadow-sm">
        <span aria-hidden>📄</span>
        <span>פותחים דף חדש…</span>
      </div>
    </div>
  )
}

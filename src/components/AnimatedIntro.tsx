'use client'

import { useEffect, useState } from 'react'

/**
 * AnimatedIntro — plays once per browser session.
 * A clean pill with symmetric dot marks and no emoji.
 * Gracefully appears and departs; does not block interaction.
 */
export default function AnimatedIntro() {
  const [show, setShow] = useState(false)

  useEffect(() => {
    const key = 'pd_auth_intro_v3'
    const already = typeof window !== 'undefined' ? window.sessionStorage.getItem(key) : '1'
    if (!already) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setShow(true)
      window.sessionStorage.setItem(key, '1')
      const t = window.setTimeout(() => setShow(false), 1500)
      return () => window.clearTimeout(t)
    }
  }, [])

  if (!show) return null

  return (
    <div className="pointer-events-none mb-6 flex items-center justify-center">
      <div className="pd-pill-in inline-flex items-center gap-2.5 rounded-full border border-black/[0.08] bg-white/55 px-5 py-[0.45rem] text-sm font-medium text-black/52 shadow-sm backdrop-blur-sm">
        <span className="block h-[5px] w-[5px] rounded-full bg-current opacity-55" aria-hidden="true" />
        <span>פותחים דף חדש</span>
        <span className="block h-[5px] w-[5px] rounded-full bg-current opacity-55" aria-hidden="true" />
      </div>
    </div>
  )
}

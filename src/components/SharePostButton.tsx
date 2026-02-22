'use client'

import { useRef, useState } from 'react'

export default function SharePostButton({ url, title }: { url: string; title: string }) {
  const [msg, setMsg] = useState<string | null>(null)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const flash = (m: string) => {
    setMsg(m)
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => setMsg(null), 2500)
  }

  async function onShare() {
    try {
      // Web Share API (בעיקר במובייל)
      if ('share' in navigator && typeof navigator.share === 'function') {
        await navigator.share({ title, url })
        return
      }

      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(url)
        flash('קישור הועתק')
        return
      }

      // fallback ישן
      const ta = document.createElement('textarea')
      ta.value = url
      document.body.appendChild(ta)
      ta.select()
      document.execCommand('copy')
      document.body.removeChild(ta)
      flash('קישור הועתק')
    } catch {
      flash('לא הצלחנו לשתף')
    }
  }

  const base =
    'h-9 rounded-full px-4 text-sm font-semibold transition inline-flex items-center justify-center'

  return (
    <div className="relative">
      <button type="button" onClick={onShare} className={[base, 'bg-white border hover:bg-neutral-50 dark:bg-card dark:hover:bg-muted dark:border-border'].join(' ')}>
        שיתוף
      </button>

      {msg ? (
        <div className="pointer-events-none absolute -bottom-8 right-0 rounded-full bg-neutral-900 px-3 py-1 text-[12px] text-white shadow">
          {msg}
        </div>
      ) : null}
    </div>
  )
}

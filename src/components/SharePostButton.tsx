'use client'

import { useRef, useState } from 'react'
import { Share2 } from 'lucide-react'

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
    'h-9 rounded-[12px] px-2.5 text-[12px] font-semibold transition inline-flex items-center justify-center gap-1.5 whitespace-nowrap sm:px-3 sm:text-[13px]'

  return (
    <div className="relative">
      <button type="button" onClick={onShare} className={[base, 'border border-neutral-200/80 bg-white/85 text-neutral-800 hover:bg-white dark:border-white/10 dark:bg-transparent dark:text-neutral-100 dark:hover:bg-white/[0.06]'].join(' ')}>
        <Share2 className="h-3.5 w-3.5 shrink-0" strokeWidth={2.4} aria-hidden="true" />
        <span>שתף</span>
      </button>

      {msg ? (
        <div className="pointer-events-none absolute -bottom-8 right-0 rounded-full bg-neutral-900 px-3 py-1 text-[12px] text-white shadow">
          {msg}
        </div>
      ) : null}
    </div>
  )
}

'use client'
import { useEffect } from 'react'

/** App-shell wrapper for the inbox route.
 *  - Locks body scroll so the browser never shifts the page when the keyboard opens/closes.
 *  - Uses --vvh (set by VisualViewportSync) so height tracks the visual viewport exactly. */
export default function InboxShell({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [])

  return (
    <div
      className="mx-auto w-full max-w-6xl px-3 overflow-hidden"
      style={{ height: 'calc(var(--vvh, 100dvh) - 56px)' }}
      dir="rtl"
    >
      {children}
    </div>
  )
}

'use client'

import { useRef, useLayoutEffect, useState } from 'react'

interface ClampedTextProps {
  text: string
  lines: number
  className?: string
  /** Appended when text is clamped. Default: '..' */
  suffix?: string
  as?: 'p' | 'h3' | 'h4' | 'div' | 'span'
}

/**
 * Clamps text to `lines` lines at word boundaries using real DOM measurement.
 *
 * Why not getComputedStyle().lineHeight?
 *   - Returns wrong value before custom fonts load → wrong maxHeight → overflow.
 *
 * Solution: measure actual one-line height by temporarily setting a single
 * non-breaking space (U+00A0). scrollHeight then equals exactly one rendered
 * line regardless of font, line-height CSS class, or loading state.
 *
 * SSR fallback: webkit-box line-clamp keeps layout stable before hydration.
 * Post-hydration: display:block (same mode as measurement → no discrepancy).
 * Font loading: document.fonts.ready re-triggers measure after fonts settle.
 * Unmount safety: cancelled flag prevents stale setState / DOM writes.
 */
export default function ClampedText({
  text,
  lines,
  className,
  suffix = '..',
  as: Tag = 'p',
}: ClampedTextProps) {
  const ref = useRef<HTMLElement>(null)
  const [display, setDisplay] = useState<string | null>(null)

  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return

    let cancelled = false
    let measuring = false

    function measure() {
      if (cancelled || !el || measuring) return
      measuring = true

      // Use block display so scrollHeight is the real content height.
      // (webkit-box + line-clamp returns only the clamped height in Chrome)
      el.style.display = 'block'
      el.style.overflow = 'hidden'

      // Measure actual one-line height — reliable regardless of font/line-height
      el.textContent = '\u00A0'
      const oneLineH = el.scrollHeight
      if (oneLineH === 0) { measuring = false; return } // element not visible yet; ResizeObserver will retry
      const maxHeight = oneLineH * lines + 1 // +1px sub-pixel tolerance

      // Check if full text already fits
      el.textContent = text
      if (el.scrollHeight <= maxHeight) {
        if (!cancelled) setDisplay(text)
        measuring = false
        return
      }

      // Binary search over words for the most that fit within maxHeight
      const words = text.split(' ')
      let lo = 0
      let hi = words.length

      while (lo < hi - 1) {
        const mid = Math.floor((lo + hi) / 2)
        el.textContent = words.slice(0, mid).join(' ') + suffix
        if (el.scrollHeight <= maxHeight) lo = mid
        else hi = mid
      }

      // Always write final result to DOM before setDisplay.
      // If React bails out (same value, no re-render), DOM stays correct.
      const result = lo === 0 ? suffix : words.slice(0, lo).join(' ') + suffix
      el.textContent = result
      if (!cancelled) setDisplay(result)
      measuring = false
    }

    measure()

    // Re-measure when fonts finish loading (catches font-metric changes).
    // Guard: if fonts are already loaded this resolves synchronously — measure()
    // is called a second time in the same tick, which is harmless (idempotent).
    void document.fonts?.ready?.then(() => { if (!cancelled) measure() })

    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => {
      cancelled = true
      ro.disconnect()
    }
  }, [text, lines, suffix])

  return (
    <Tag
      // @ts-expect-error — ref works for all union tag members; TS cannot narrow it
      ref={ref}
      className={className}
      style={
        display === null
          ? // SSR / pre-hydration: CSS line-clamp as layout-stable fallback
            { overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: lines, WebkitBoxOrient: 'vertical' }
          : // Post-hydration: plain block — same mode used during measurement
            { overflow: 'hidden', display: 'block' }
      }
    >
      {display ?? text}
    </Tag>
  )
}

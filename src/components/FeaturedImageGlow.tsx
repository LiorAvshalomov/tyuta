'use client'

import { useEffect, useRef } from 'react'

export function FeaturedImageGlow() {
  const glowRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const glow = glowRef.current
    if (!glow) return
    // The frame is the previous sibling — listen there so clicks are never blocked.
    const frame = glow.previousElementSibling as HTMLElement | null
    if (!frame) return

    function onMove(e: MouseEvent) {
      if (!glow) return
      const rect = frame!.getBoundingClientRect()
      glow.style.setProperty('--gx', `${e.clientX - rect.left}px`)
      glow.style.setProperty('--gy', `${e.clientY - rect.top}px`)
      glow.style.opacity = '0.15'
    }
    function onLeave() {
      if (glow) glow.style.opacity = '0'
    }

    frame.addEventListener('mousemove', onMove)
    frame.addEventListener('mouseleave', onLeave)
    return () => {
      frame.removeEventListener('mousemove', onMove)
      frame.removeEventListener('mouseleave', onLeave)
    }
  }, [])

  return (
    <div
      ref={glowRef}
      className="tyuta-featured-glow"
      style={{ opacity: 0 }}
      aria-hidden="true"
    />
  )
}

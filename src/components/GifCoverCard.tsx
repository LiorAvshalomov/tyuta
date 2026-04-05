'use client'

import { useEffect, useRef, useState } from 'react'
import GifCoverImage from './GifCoverImage'

/**
 * Drop-in replacement for GifCoverImage that activates on card-level hover.
 * Traverses up the DOM to find the nearest article, [role=link], or
 * [data-gif-card] ancestor and attaches mouseenter/mouseleave listeners.
 */
export default function GifCoverCard({ src, alt }: { src: string; alt: string }) {
  const ref = useRef<HTMLDivElement>(null)
  const [hovered, setHovered] = useState(false)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const card = el.closest('article, [role=link], [data-gif-card]') as HTMLElement | null
    if (!card) return
    const enter = () => setHovered(true)
    const leave = () => setHovered(false)
    card.addEventListener('mouseenter', enter)
    card.addEventListener('mouseleave', leave)
    return () => {
      card.removeEventListener('mouseenter', enter)
      card.removeEventListener('mouseleave', leave)
    }
  }, [])

  return (
    <div ref={ref} style={{ width: '100%', height: '100%' }}>
      <GifCoverImage src={src} alt={alt} cardHovered={hovered} />
    </div>
  )
}

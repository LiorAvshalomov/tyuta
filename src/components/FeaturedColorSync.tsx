'use client'

import { useEffect, useRef } from 'react'

export function FeaturedColorSync({ src }: { src: string }) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const wrapper = ref.current?.closest('.tyuta-featured-desktop') as HTMLElement | null
    if (!wrapper) return

    const img = new window.Image()
    img.crossOrigin = 'anonymous'
    img.src = src

    img.onload = () => {
      try {
        const canvas = document.createElement('canvas')
        canvas.width = 6
        canvas.height = 6
        const ctx = canvas.getContext('2d')
        if (!ctx) return

        // Sample the rightmost ~12% strip of the image — this is the edge
        // that visually meets the text panel after the frame ends at 75%.
        const sx = Math.floor(img.naturalWidth * 0.88)
        const sw = img.naturalWidth - sx
        ctx.drawImage(img, sx, 0, sw, img.naturalHeight, 0, 0, 6, 6)

        const data = ctx.getImageData(0, 0, 6, 6).data
        let r = 0, g = 0, b = 0
        const count = 36 // 6×6
        for (let i = 0; i < data.length; i += 4) {
          r += data[i]; g += data[i + 1]; b += data[i + 2]
        }
        r = Math.round(r / count)
        g = Math.round(g / count)
        b = Math.round(b / count)

        // Light mode: blend 22% sampled color into warm off-white card background
        const lr = Math.round(r * 0.22 + 249 * 0.78)
        const lg = Math.round(g * 0.22 + 246 * 0.78)
        const lb = Math.round(b * 0.22 + 243 * 0.78)

        // Dark mode: blend 22% sampled color into deep warm dark card background
        const dr = Math.round(r * 0.22 + 28 * 0.78)
        const dg = Math.round(g * 0.22 + 26 * 0.78)
        const db = Math.round(b * 0.22 + 24 * 0.78)

        wrapper.style.setProperty('--img-edge-light', `rgb(${lr} ${lg} ${lb})`)
        wrapper.style.setProperty('--img-edge-dark', `rgb(${dr} ${dg} ${db})`)

        // Adaptive text: compute luminance of the blended panel background,
        // then set oklch foreground vars so text is always readable.
        const lLum = (0.299 * lr + 0.587 * lg + 0.114 * lb) / 255
        const dLum = (0.299 * dr + 0.587 * dg + 0.114 * db) / 255

        wrapper.style.setProperty('--panel-fg-light',      lLum > 0.5 ? 'oklch(0.12 0 0)' : 'oklch(0.97 0 0)')
        wrapper.style.setProperty('--panel-fg-soft-light', lLum > 0.5 ? 'oklch(0.38 0 0)' : 'oklch(0.75 0 0)')
        wrapper.style.setProperty('--panel-fg-dark',       dLum > 0.5 ? 'oklch(0.12 0 0)' : 'oklch(0.97 0 0)')
        wrapper.style.setProperty('--panel-fg-soft-dark',  dLum > 0.5 ? 'oklch(0.38 0 0)' : 'oklch(0.75 0 0)')
      } catch {
        // CORS / canvas taint — silently fall back to theme defaults
      }
    }
  }, [src])

  return <div ref={ref} className="sr-only" aria-hidden="true" />
}

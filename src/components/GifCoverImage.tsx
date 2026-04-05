'use client'

import { useEffect, useRef, useState } from 'react'

/**
 * GIF-specific cover: frozen first frame at rest, animates on hover.
 *
 * If `cardHovered` is provided, that parent-controlled state drives animation
 * (use when you want hover anywhere on the card to trigger animation).
 * If `cardHovered` is omitted, the component tracks hover internally on its
 * own wrapper div (good for server components and standalone usage).
 *
 * Technique: `visibility: hidden` stops GIF decoding/rendering in all major
 * browsers (Chrome, Firefox, Safari). At rest the canvas shows the first frame.
 * On hover the canvas fades out and the img becomes visible — GIF restarts.
 */
export default function GifCoverImage({
  src,
  alt,
  cardHovered,
}: {
  src: string
  alt: string
  cardHovered?: boolean
}) {
  const imgRef = useRef<HTMLImageElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [frameReady, setFrameReady] = useState(false)
  const [internalHovered, setInternalHovered] = useState(false)

  const hovered = cardHovered !== undefined ? cardHovered : internalHovered

  function drawFrame() {
    const img = imgRef.current
    const canvas = canvasRef.current
    if (!img || !canvas || img.naturalWidth === 0) return
    const w = canvas.offsetWidth || 320
    const h = canvas.offsetHeight || 200
    canvas.width = w
    canvas.height = h
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    // Emulate object-fit: cover — scale to fill, crop centered
    const scale = Math.max(w / img.naturalWidth, h / img.naturalHeight)
    const dw = img.naturalWidth * scale
    const dh = img.naturalHeight * scale
    ctx.drawImage(img, (w - dw) / 2, (h - dh) / 2, dw, dh)
    setFrameReady(true)
  }

  useEffect(() => {
    const img = imgRef.current
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (img?.complete && (img.naturalWidth ?? 0) > 0) drawFrame()
  }, [])

  const hoverHandlers =
    cardHovered !== undefined
      ? {}
      : {
          onMouseEnter: () => setInternalHovered(true),
          onMouseLeave: () => setInternalHovered(false),
        }

  return (
    <div
      style={{ position: 'relative', width: '100%', height: '100%', display: 'block', overflow: 'hidden' }}
      {...hoverHandlers}
    >
      {/* Frozen first frame — visible at rest */}
      <canvas
        ref={canvasRef}
        style={{
          position: 'absolute',
          inset: 0,
          width: '100%',
          height: '100%',
          opacity: !frameReady || hovered ? 0 : 1,
          transition: 'opacity 0.15s ease',
          pointerEvents: 'none',
        }}
      />
      {/* Animated GIF — hidden at rest (stops animation), plays on hover */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        ref={imgRef}
        src={src}
        alt={alt}
        loading="eager"
        onLoad={drawFrame}
        style={{
          width: '100%',
          height: '100%',
          objectFit: 'cover',
          display: 'block',
          visibility: frameReady && !hovered ? 'hidden' : 'visible',
        }}
      />
    </div>
  )
}

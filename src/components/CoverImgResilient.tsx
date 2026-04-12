'use client'

import Image from 'next/image'
import { useState } from 'react'

interface CoverImgResilientProps {
  src: string
  alt: string
  priority?: boolean
  sizes?: string
  quality?: number
  className?: string
}

/**
 * Next.js Image with a single onError retry: if the optimizer fails
 * (e.g. Vercel can't fetch/resize a new DPR variant from Supabase),
 * we fall back to serving the original URL unoptimized — already on
 * Supabase CDN with a 1-year cache so it loads fast.
 *
 * Why: switching device-toolbar dimensions requests new size variants
 * that aren't yet cached on Vercel. If that on-demand generation fails
 * the image stays broken with no built-in retry. This fixes it silently.
 */
export default function CoverImgResilient({
  src,
  alt,
  priority,
  sizes,
  quality,
  className,
}: CoverImgResilientProps) {
  const [unoptimized, setUnoptimized] = useState(false)

  return (
    <Image
      src={src}
      alt={alt}
      fill
      priority={priority}
      sizes={sizes}
      quality={quality}
      className={className}
      unoptimized={unoptimized}
      onError={() => {
        if (!unoptimized) setUnoptimized(true)
      }}
    />
  )
}

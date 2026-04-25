import React from 'react'
import Image from 'next/image'
import { avatarProxySrc, dicebearInitialsUrl, isAvatarProxySrc } from '@/lib/avatarUrl'

function Avatar({
  src,
  name,
  size = 36,
  shape = 'circle',
}: {
  src?: string | null
  name: string
  size?: number
  shape?: 'circle' | 'square'
}) {
  const safeSrc = src?.trim() ? src.trim() : null
  const radiusClass = shape === 'square' ? 'rounded-xl' : 'rounded-full'
  const url = safeSrc ? (avatarProxySrc(safeSrc) ?? safeSrc) : dicebearInitialsUrl(name)
  const lowerUrl = url.split('?')[0].toLowerCase()
  const unoptimized =
    isAvatarProxySrc(url) ||
    url.startsWith('/') ||
    lowerUrl.endsWith('.svg') ||
    lowerUrl.endsWith('/svg') ||
    lowerUrl.endsWith('.gif') ||
    lowerUrl.startsWith('https://api.dicebear.com/')

  return (
    <div
      className={`relative overflow-hidden shrink-0 ${radiusClass}`}
      style={{ width: size, height: size }}
    >
      <Image
        src={url}
        alt={`תמונת פרופיל של ${name}`}
        fill
        sizes={`${size}px`}
        quality={size <= 48 ? 76 : 82}
        className="object-cover"
        unoptimized={unoptimized}
      />
    </div>
  )
}

export default React.memo(Avatar)

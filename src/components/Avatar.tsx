import Image from 'next/image'

function dicebearUrl(seed: string) {
  const s = encodeURIComponent((seed ?? '').trim() || 'user')
  return `https://api.dicebear.com/7.x/initials/svg?seed=${s}`
}

export default function Avatar({
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

  if (!safeSrc) {
    // Fallback: DiceBear initials (consistent across the site)
    const url = dicebearUrl(name)
    return (
      <Image
        src={url}
        alt={`תמונת פרופיל של ${name}`}
        width={size}
        height={size}
        className={`${radiusClass} object-cover`}
        unoptimized
      />
    )
  }

  const isSvg = safeSrc.toLowerCase().includes('.svg') || safeSrc.includes('/svg')

  return (
    <Image
      src={safeSrc}
      alt={`תמונת פרופיל של ${name}`}
      width={size}
      height={size}
      className={`${radiusClass} object-cover`}
      unoptimized={isSvg}
    />
  )
}

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
  const url = safeSrc ?? dicebearUrl(name)

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
        className="object-cover"
        unoptimized
      />
    </div>
  )
}

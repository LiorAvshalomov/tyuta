import Image from 'next/image'

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
    return (
      <div
        className={`${radiusClass} bg-neutral-200 flex items-center justify-center text-sm font-bold`}
        style={{ width: size, height: size }}
      >
        {name?.trim()?.[0] ?? '🙂'}
      </div>
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

'use client'

import { useEffect, useMemo, useState } from 'react'
import type { CSSProperties } from 'react'
import Avatar from '@/components/Avatar'
import { avatarProxySrc } from '@/lib/avatarUrl'

type Props = {
  src: string | null
  name: string
  size: number
  shape?: 'circle' | 'square'
  className?: string
}

function clampByte(n: number) {
  return Math.max(0, Math.min(255, Math.round(n)))
}

function rgbToHex(r: number, g: number, b: number) {
  const toHex = (x: number) => clampByte(x).toString(16).padStart(2, '0')
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`
}

async function computeAverageColor(url: string): Promise<string | null> {
  return new Promise(resolve => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.decoding = 'async'
    img.referrerPolicy = 'no-referrer'
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas')
        const ctx = canvas.getContext('2d', { willReadFrequently: true })
        if (!ctx) return resolve(null)

        // downsample heavily for speed
        const w = 24
        const h = 24
        canvas.width = w
        canvas.height = h
        ctx.drawImage(img, 0, 0, w, h)
        const { data } = ctx.getImageData(0, 0, w, h)

        let r = 0
        let g = 0
        let b = 0
        let c = 0
        for (let i = 0; i < data.length; i += 4) {
          const a = data[i + 3]
          if (a < 40) continue
          r += data[i]
          g += data[i + 1]
          b += data[i + 2]
          c += 1
        }

        if (!c) return resolve(null)
        resolve(rgbToHex(r / c, g / c, b / c))
      } catch {
        resolve(null)
      }
    }
    img.onerror = () => resolve(null)
    img.src = url
  })
}

export default function ProfileAvatarFrame({ src, name, size, shape = 'square', className }: Props) {
  const [ringColor, setRingColor] = useState<string | null>(null)

  const effectiveSrc = useMemo(() => {
    const s = (src ?? '').trim()
    return s.length > 0 ? (avatarProxySrc(s) ?? s) : null
  }, [src])

  useEffect(() => {
    let cancelled = false

    async function run() {
      if (!effectiveSrc) {
        setRingColor(null)
        return
      }

      const color = await computeAverageColor(effectiveSrc)
      if (!cancelled) setRingColor(color)
    }

    void run()
    return () => {
      cancelled = true
    }
  }, [effectiveSrc])

  const style: CSSProperties | undefined = ringColor
    ? { boxShadow: `0 0 0 4px ${ringColor}33, 0 0 0 8px ${ringColor}22` }
    : undefined

  // IMPORTANT: keep the wrapper from stretching in flex/grid layouts.
  // `inline-flex w-fit` prevents the "huge empty rectangle" bug in mobile.
  const baseClass = ringColor
    ? 'inline-flex w-fit rounded-2xl bg-white p-1'
    : 'inline-flex w-fit rounded-2xl bg-white p-1 ring-1 ring-black/10'

  return (
    <div className={[baseClass, className ?? ''].join(' ')} style={style}>
      <Avatar src={effectiveSrc} name={name} size={size} shape={shape} />
    </div>
  )
}

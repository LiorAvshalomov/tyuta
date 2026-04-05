'use client'

import { useEffect, useRef } from 'react'

type Rgb = {
  r: number
  g: number
  b: number
}

const SAMPLE_SIZE = 18
const LIGHT_BASE: Rgb = { r: 248, g: 244, b: 239 }
const LIGHT_END: Rgb = { r: 255, g: 252, b: 248 }
const DARK_BASE: Rgb = { r: 29, g: 27, b: 28 }
const DARK_END: Rgb = { r: 37, g: 33, b: 35 }
const FALLBACK_EDGE: Rgb = { r: 204, g: 190, b: 178 }

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

function mixRgb(base: Rgb, tint: Rgb, amount: number): Rgb {
  const alpha = clamp(amount, 0, 1)
  const inverse = 1 - alpha

  return {
    r: Math.round(base.r * inverse + tint.r * alpha),
    g: Math.round(base.g * inverse + tint.g * alpha),
    b: Math.round(base.b * inverse + tint.b * alpha),
  }
}

function rgbToCss({ r, g, b }: Rgb, alpha?: number) {
  return alpha == null
    ? `rgb(${r} ${g} ${b})`
    : `rgb(${r} ${g} ${b} / ${alpha})`
}

function relativeLuminance({ r, g, b }: Rgb) {
  const channel = (value: number) => {
    const normalized = value / 255
    return normalized <= 0.04045
      ? normalized / 12.92
      : ((normalized + 0.055) / 1.055) ** 2.4
  }

  return (0.2126 * channel(r)) + (0.7152 * channel(g)) + (0.0722 * channel(b))
}

function rgbToHsl({ r, g, b }: Rgb) {
  const nr = r / 255
  const ng = g / 255
  const nb = b / 255
  const max = Math.max(nr, ng, nb)
  const min = Math.min(nr, ng, nb)
  const delta = max - min
  const lightness = (max + min) / 2

  if (delta === 0) {
    return { h: 0, s: 0, l: lightness }
  }

  const saturation = delta / (1 - Math.abs((2 * lightness) - 1))
  let hue = 0

  if (max === nr) hue = ((ng - nb) / delta) % 6
  else if (max === ng) hue = ((nb - nr) / delta) + 2
  else hue = ((nr - ng) / delta) + 4

  hue *= 60
  if (hue < 0) hue += 360

  return { h: hue, s: saturation, l: lightness }
}

function collectPixels(
  data: Uint8ClampedArray,
  size: number,
  xStart: number,
  xEnd: number,
  yStart: number,
  yEnd: number,
) {
  const pixels: Rgb[] = []

  for (let y = yStart; y < yEnd; y += 1) {
    for (let x = xStart; x < xEnd; x += 1) {
      const index = ((y * size) + x) * 4
      const alpha = data[index + 3]
      if (alpha < 140) continue

      pixels.push({
        r: data[index],
        g: data[index + 1],
        b: data[index + 2],
      })
    }
  }

  return pixels
}

function averageRgb(pixels: Rgb[], fallback: Rgb): Rgb {
  if (pixels.length === 0) return fallback

  let r = 0
  let g = 0
  let b = 0

  for (const pixel of pixels) {
    r += pixel.r
    g += pixel.g
    b += pixel.b
  }

  return {
    r: Math.round(r / pixels.length),
    g: Math.round(g / pixels.length),
    b: Math.round(b / pixels.length),
  }
}

function pickAccent(pixels: Rgb[], fallback: Rgb): Rgb {
  let totalWeight = 0
  let r = 0
  let g = 0
  let b = 0

  for (const pixel of pixels) {
    const { s, l } = rgbToHsl(pixel)
    const saturationWeight = clamp((s - 0.06) / 0.94, 0, 1)
    const brightnessWeight = clamp((l - 0.18) / 0.72, 0, 1)
    const balanceWeight = clamp(1 - (Math.abs(l - 0.58) * 1.65), 0, 1)
    const weight = saturationWeight * ((brightnessWeight * 0.45) + (balanceWeight * 0.35) + 0.2)
    if (weight <= 0) continue

    totalWeight += weight
    r += pixel.r * weight
    g += pixel.g * weight
    b += pixel.b * weight
  }

  if (totalWeight <= 0.001) return fallback

  return {
    r: Math.round(r / totalWeight),
    g: Math.round(g / totalWeight),
    b: Math.round(b / totalWeight),
  }
}

export function FeaturedColorSync({ src }: { src: string }) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const wrapper = ref.current?.closest('.tyuta-featured-desktop') as HTMLElement | null
    if (!wrapper) return

    let active = true

    const img = new window.Image()
    img.crossOrigin = 'anonymous'
    img.decoding = 'async'
    img.src = src

    img.onload = () => {
      if (!active) return

      try {
        const canvas = document.createElement('canvas')
        canvas.width = SAMPLE_SIZE
        canvas.height = SAMPLE_SIZE

        const ctx = canvas.getContext('2d', { willReadFrequently: true })
        if (!ctx) return

        ctx.drawImage(
          img,
          0,
          0,
          img.naturalWidth,
          img.naturalHeight,
          0,
          0,
          SAMPLE_SIZE,
          SAMPLE_SIZE,
        )

        const { data } = ctx.getImageData(0, 0, SAMPLE_SIZE, SAMPLE_SIZE)
        const edgePixels = collectPixels(data, SAMPLE_SIZE, Math.floor(SAMPLE_SIZE * 0.78), SAMPLE_SIZE, 0, SAMPLE_SIZE)
        const atmospherePixels = collectPixels(
          data,
          SAMPLE_SIZE,
          Math.floor(SAMPLE_SIZE * 0.6),
          Math.floor(SAMPLE_SIZE * 0.96),
          0,
          Math.floor(SAMPLE_SIZE * 0.72),
        )
        const accentPixels = collectPixels(
          data,
          SAMPLE_SIZE,
          Math.floor(SAMPLE_SIZE * 0.56),
          Math.floor(SAMPLE_SIZE * 0.96),
          Math.floor(SAMPLE_SIZE * 0.06),
          Math.floor(SAMPLE_SIZE * 0.82),
        )

        const edge = averageRgb(edgePixels, FALLBACK_EDGE)
        const atmosphere = averageRgb(atmospherePixels, edge)
        const accent = pickAccent(accentPixels, mixRgb(edge, atmosphere, 0.55))
        const { s: accentSaturation } = rgbToHsl(accent)

        const seamLight = mixRgb(edge, LIGHT_BASE, 0.64)
        const panelLight = mixRgb(LIGHT_BASE, accent, 0.15 + (accentSaturation * 0.24))
        const panelLightSoft = mixRgb(panelLight, atmosphere, 0.18 + (accentSaturation * 0.08))
        const panelLightEnd = mixRgb(LIGHT_END, accent, 0.06 + (accentSaturation * 0.12))

        const seamDark = mixRgb(DARK_BASE, edge, 0.34 + (accentSaturation * 0.12))
        const panelDark = mixRgb(DARK_BASE, accent, 0.18 + (accentSaturation * 0.22))
        const panelDarkSoft = mixRgb(panelDark, atmosphere, 0.14 + (accentSaturation * 0.12))
        const panelDarkEnd = mixRgb(DARK_END, accent, 0.1 + (accentSaturation * 0.12))

        const lightPanelMix = mixRgb(panelLight, panelLightEnd, 0.5)
        const darkPanelMix = mixRgb(panelDark, panelDarkEnd, 0.5)
        const lightLum = relativeLuminance(lightPanelMix)
        const darkLum = relativeLuminance(darkPanelMix)

        wrapper.style.setProperty('--img-edge-light-start', rgbToCss(seamLight))
        wrapper.style.setProperty('--img-edge-light-soft', rgbToCss(panelLightSoft))
        wrapper.style.setProperty('--img-edge-light-end', rgbToCss(panelLightEnd))
        wrapper.style.setProperty('--img-edge-dark-start', rgbToCss(seamDark))
        wrapper.style.setProperty('--img-edge-dark-soft', rgbToCss(panelDarkSoft))
        wrapper.style.setProperty('--img-edge-dark-end', rgbToCss(panelDarkEnd))

        wrapper.style.setProperty('--panel-overlay-light-start', rgbToCss(seamLight, 0.05 + (accentSaturation * 0.06)))
        wrapper.style.setProperty('--panel-overlay-light-mid', rgbToCss(panelLightSoft, 0.36 + (accentSaturation * 0.1)))
        wrapper.style.setProperty('--panel-overlay-light-end', rgbToCss(panelLightEnd, 0.94))
        wrapper.style.setProperty('--panel-overlay-dark-start', rgbToCss(seamDark, 0.08 + (accentSaturation * 0.06)))
        wrapper.style.setProperty('--panel-overlay-dark-mid', rgbToCss(panelDarkSoft, 0.42 + (accentSaturation * 0.1)))
        wrapper.style.setProperty('--panel-overlay-dark-end', rgbToCss(panelDarkEnd, 0.92))
        wrapper.style.setProperty('--panel-sheen-light', rgbToCss(mixRgb(LIGHT_END, accent, 0.14), 0.2 + (accentSaturation * 0.08)))
        wrapper.style.setProperty('--panel-sheen-dark', rgbToCss(mixRgb({ r: 240, g: 230, b: 220 }, accent, 0.22), 0.16 + (accentSaturation * 0.08)))

        wrapper.style.setProperty('--featured-glow-core-light', rgbToCss(mixRgb(LIGHT_END, accent, 0.18), 0.26 + (accentSaturation * 0.1)))
        wrapper.style.setProperty('--featured-glow-soft-light', rgbToCss(accent, 0.1 + (accentSaturation * 0.06)))
        wrapper.style.setProperty('--featured-glow-core-dark', rgbToCss(mixRgb({ r: 245, g: 232, b: 214 }, accent, 0.26), 0.24 + (accentSaturation * 0.12)))
        wrapper.style.setProperty('--featured-glow-soft-dark', rgbToCss(accent, 0.12 + (accentSaturation * 0.08)))

        wrapper.style.setProperty('--panel-fg-light', lightLum > 0.56 ? 'oklch(0.14 0.01 30)' : 'oklch(0.97 0 0)')
        wrapper.style.setProperty('--panel-fg-soft-light', lightLum > 0.56 ? 'oklch(0.42 0.014 32)' : 'oklch(0.78 0.012 70)')
        wrapper.style.setProperty('--panel-fg-dark', darkLum > 0.48 ? 'oklch(0.14 0.01 30)' : 'oklch(0.97 0 0)')
        wrapper.style.setProperty('--panel-fg-soft-dark', darkLum > 0.48 ? 'oklch(0.42 0.014 32)' : 'oklch(0.79 0.014 72)')
      } catch {
        // Fall back to static theme defaults.
      }
    }

    return () => {
      active = false
    }
  }, [src])

  return <div ref={ref} className="sr-only" aria-hidden="true" />
}

import {
  getContinuationBodyTop,
  getFormatMetrics,
  layoutBodyText,
  measureTitleLayout,
  parseParagraphs,
  wrapParagraphGroups,
  type SlideFormat,
  type TitleLayout,
} from "./layout"
import { measureTextWidth } from "./textMeasure"
import {
  analyzeTextProfile,
  isPoeticProfile,
  isShortProfile,
  isVeryPoeticProfile,
  type TextProfile,
} from "./textProfile"

export type CardOptions = {
  text: string
  fontSize: number
  title: string
  authorName: string
  slideIndex: number
  slideTotal: number
  theme: "light" | "dark"
  format: SlideFormat
  align: "right" | "center"
}

type Palette = {
  bg: string
  edge: string
  warm: string
  text: string
  title: string
  counter: string
  author: string
  brand: string
  texture: string
  textureAlt: string
  vignette: string
}

type FrameProfile = {
  horizontalPadding: number
  topReserved: number
  bottomReserved: number
  counterY: number
  footerBaselineY: number
}

const LIGHT: Palette = {
  bg: "#FBF7F1",
  edge: "#ECE3D7",
  warm: "#E5D8C8",
  text: "#6C6256",
  title: "#2A241D",
  counter: "#5F5447",
  author: "#7A6D5F",
  brand: "#8A7A68",
  texture: "#C7B8A4",
  textureAlt: "#F3EBE0",
  vignette: "#E3D6C5",
}

const DARK: Palette = {
  bg: "#171615",
  edge: "#221F1D",
  warm: "#2A2826",
  text: "#F7F6F2",
  title: "#E5D9C4",
  counter: "#F0E7DB",
  author: "#E1D9CC",
  brand: "#D7CBBC",
  texture: "#68625B",
  textureAlt: "#282624",
  vignette: "#080808",
}

const FONT_BODY = "Miriam Libre"
// Fallback body font for posts that contain nikud/cantillation marks (U+0591–U+05C7).
// Noto Serif Hebrew covers the full Hebrew diacritics block, giving pointed text a
// warm, literary serif appearance without font-fallback artifacts.
const FONT_BODY_NIKUD = "Noto Serif Hebrew"
const HEBREW_DIACRITICS_RE = /[\u0591-\u05C7]/
const FONT_BODY_TITLE = "Assistant"
const FONT_PAGE_NUMBER = "Shadows Into Light"
const FONT_HANDWRITTEN_HE = "Gveret Levin"
const FONT_HANDWRITTEN_LATIN = "Caveat"
const RTL_EMBED = "\u202B"
const RTL_POP = "\u202C"

export function buildSvg(opts: CardOptions): string {
  const { title, authorName, slideIndex, slideTotal, theme, format, align } = opts

  // Use a nikud-capable font when the post contains Hebrew vowel points or cantillation.
  // Whole-font switch (not per-glyph fallback) ensures correct diacritic positioning.
  const bodyFont = HEBREW_DIACRITICS_RE.test(opts.text) ? FONT_BODY_NIKUD : FONT_BODY

  const W = 1080
  const metrics = getFormatMetrics(format)
  const H = metrics.height
  const palette = theme === "dark" ? DARK : LIGHT
  const showTitle = slideIndex === 1 && title.trim().length > 0
  const singleSlide = slideTotal === 1
  const effectiveTitle = showTitle ? title.trim() : ""
  const contentStats = analyzeTextProfile(opts.text)
  let frame = resolveFrameProfile({
    format,
    singleSlide,
    hasTitle: showTitle,
    contentStats,
    height: H,
    metrics,
  })
  let horizontalPadding = frame.horizontalPadding
  let topReserved = frame.topReserved
  let bottomReserved = frame.bottomReserved
  let availableHeight = H - topReserved - bottomReserved
  let blockWidth = W - horizontalPadding * 2
  const anchor = align === "right" ? "end" : "middle"
  let textX = align === "right" ? W - horizontalPadding : Math.round(W / 2)

  let fitted = fitMainBlock({
    text: opts.text,
    title: effectiveTitle,
    format,
    preferredBodyFontSize: opts.fontSize,
    blockWidth,
    availableHeight,
    singleSlide,
    hasTitle: showTitle,
    contentStats,
  })

  const tightenedFrame = maybeTightenFrameProfile({
    format,
    singleSlide,
    hasTitle: showTitle,
    contentStats,
    height: H,
    frame,
    fillRatio: fitted.totalHeight / Math.max(1, availableHeight),
  })

  if (tightenedFrame) {
    frame = tightenedFrame
    horizontalPadding = frame.horizontalPadding
    topReserved = frame.topReserved
    bottomReserved = frame.bottomReserved
    availableHeight = H - topReserved - bottomReserved
    blockWidth = W - horizontalPadding * 2
    textX = align === "right" ? W - horizontalPadding : Math.round(W / 2)
    fitted = fitMainBlock({
      text: opts.text,
      title: effectiveTitle,
      format,
      preferredBodyFontSize: opts.fontSize,
      blockWidth,
      availableHeight,
      singleSlide,
      hasTitle: showTitle,
      contentStats,
    })
  }

  const continuationBodyTop = getContinuationBodyTop(title, {
    bodyFontSize: fitted.bodyFontSize,
    format,
    maxWidth: blockWidth,
  })

  const blockStartY = computeBlockStartY({
    hasTitle: showTitle,
    singleSlide,
    topReserved,
    availableHeight,
    totalHeight: fitted.totalHeight,
    fillRatio: fitted.totalHeight / Math.max(1, availableHeight),
    continuationBodyTop,
  })

  const titleLines = fitted.titleLayout.lines.map((line: string, index: number) => {
    const y = Math.round(blockStartY + fitted.titleLayout.fontSize + index * fitted.titleLayout.lineHeight)
    return (
      `<text x="${textX}" y="${y}" font-family="${FONT_BODY_TITLE}" font-size="${fitted.titleLayout.fontSize + 4}" font-weight="900" ` +
      `fill="${palette.title}" stroke="${palette.title}" stroke-width="${theme === "dark" ? "4.0" : "3.6"}" stroke-opacity="1" ` +
      `paint-order="stroke fill" stroke-linejoin="round" text-anchor="${anchor}" direction="rtl" unicode-bidi="embed">` +
      `${escapeXml(withRtlEmbedding(line))}</text>`
    )
  })

  let bodyLinesStartY: number
  if (showTitle) {
    bodyLinesStartY = blockStartY + fitted.titleLayout.height + (fitted.bodyLayout.lineCount > 0 ? fitted.titleLayout.gapAfter : 0)
  } else if (singleSlide) {
    bodyLinesStartY = blockStartY
  } else {
    // Continuation slide: distribute free space above the text block.
    // Sparse slides (low fill) get a higher top bias so the content feels centered,
    // not pinned to the top. Dense slides keep the original minimal offset.
    const bodyAvailable = H - frame.bottomReserved - continuationBodyTop
    const remaining = Math.max(0, bodyAvailable - fitted.bodyLayout.totalHeight)
    const continuationFillRatio = fitted.bodyLayout.totalHeight / Math.max(1, bodyAvailable)
    const centeringBias =
      continuationFillRatio < 0.35 ? 0.46
      : continuationFillRatio < 0.55 ? 0.38
      : continuationFillRatio < 0.72 ? 0.28
      : 0.28
    bodyLinesStartY = continuationBodyTop + Math.round(remaining * centeringBias)
  }

  const bodyElements: string[] = []
  // Body text starts one fontSize below the layout start (SVG baseline offset).
  // Cap to ensure no line renders past the reserved footer area.
  const bodyMaxY = H - frame.bottomReserved - (fitted.bodyFontSize * 0.3)
  let currentY = bodyLinesStartY + fitted.bodyFontSize

  for (let paragraphIndex = 0; paragraphIndex < fitted.bodyLayout.paragraphs.length; paragraphIndex++) {
    const gapBefore = fitted.bodyLayout.paragraphGapsBefore[paragraphIndex] ?? 0
    if (gapBefore > 0) {
      currentY += gapBefore
    }

    for (const line of fitted.bodyLayout.paragraphs[paragraphIndex] as string[]) {
      if (Math.round(currentY) > bodyMaxY) break
      bodyElements.push(
        `<text x="${textX}" y="${Math.round(currentY)}" font-family="${bodyFont}" font-size="${fitted.bodyFontSize}" font-weight="400" ` +
        `fill="${palette.text}" fill-opacity="${theme === "dark" ? "0.99" : "0.95"}" text-anchor="${anchor}" direction="rtl" unicode-bidi="embed">` +
        `${escapeXml(withRtlEmbedding(line))}</text>`,
      )
      currentY += fitted.bodyLayout.lineHeight
    }
  }

  const counterX = horizontalPadding - 8
  const counterY = frame.counterY
  // Multi-slide: footer anchored at the frame bottom — no dead space on sparse slides.
  // Single-slide: footer snaps near the content, and the image is cropped to that height
  // (see svgH below), so there is no blank space below the footer.
  const footerBaselineY = (() => {
    if (!singleSlide) return frame.footerBaselineY
    const footerGap = format === "story" ? 92 : format === "portrait" ? 80 : 68
    const footerCeiling = Math.round(H * (format === "story" ? 0.45 : format === "portrait" ? 0.48 : 0.50))
    return Math.max(footerCeiling, Math.min(frame.footerBaselineY, currentY + footerGap))
  })()
  // For single slides, crop the image height to exactly wrap the content + footer.
  // This eliminates any dead space below the footer. Multi-slide keeps the full height.
  // bottomPad matches counterY so the gap above the slide number mirrors the gap below
  // the footer — creating visual symmetry on the top and bottom edges of the image.
  const bottomPad = frame.counterY
  const svgH = singleSlide ? footerBaselineY + bottomPad : H
  const footerInset = horizontalPadding - 4
  const tyutaFontSize = format === "story" ? 42 : format === "portrait" ? 39 : 37
  const dotNetFontSize = format === "story" ? 33 : format === "portrait" ? 31 : 29
  const brandDx = format === "story" ? 1 : format === "portrait" ? 0.5 : 0

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${svgH}" viewBox="0 0 ${W} ${svgH}">
  <defs>
    <radialGradient id="pageGlow" cx="50%" cy="32%" r="92%">
      <stop offset="0%" stop-color="${palette.bg}"/>
      <stop offset="68%" stop-color="${palette.bg}"/>
      <stop offset="100%" stop-color="${palette.edge}"/>
    </radialGradient>
    <linearGradient id="pageTone" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" stop-color="${palette.bg}"/>
      <stop offset="100%" stop-color="${palette.edge}"/>
    </linearGradient>
    <linearGradient id="inkFade" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="${palette.warm}" stop-opacity="${theme === "dark" ? "0.12" : "0.18"}"/>
      <stop offset="100%" stop-color="${palette.vignette}" stop-opacity="${theme === "dark" ? "0.22" : "0.06"}"/>
    </linearGradient>
    <radialGradient id="warmSpot" cx="50%" cy="38%" r="62%">
      <stop offset="0%" stop-color="${palette.warm}" stop-opacity="${theme === "dark" ? "0.07" : "0.10"}"/>
      <stop offset="100%" stop-color="${palette.warm}" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="edgeVignette" cx="50%" cy="46%" r="85%">
      <stop offset="52%" stop-color="${palette.vignette}" stop-opacity="0"/>
      <stop offset="100%" stop-color="${palette.vignette}" stop-opacity="${theme === "dark" ? "0.40" : "0.30"}"/>
    </radialGradient>
  </defs>

  <rect width="${W}" height="${svgH}" fill="url(#pageGlow)"/>
  <rect width="${W}" height="${svgH}" fill="url(#pageTone)"/>
  <rect width="${W}" height="${svgH}" fill="url(#inkFade)"/>
  <rect width="${W}" height="${svgH}" fill="url(#warmSpot)"/>
  <rect width="${W}" height="${svgH}" fill="url(#edgeVignette)"/>
  ${buildTextureOverlay({ theme, palette, width: W, height: svgH })}

  <text
    x="${counterX}"
    y="${counterY}"
    font-family="${FONT_PAGE_NUMBER}"
      font-size="${format === "story" ? 42 : format === "portrait" ? 40 : 38}"
    fill="${palette.counter}"
    fill-opacity="${theme === "dark" ? "0.68" : "0.72"}"
    text-anchor="start"
    transform="rotate(-4 ${counterX} ${counterY})"
  >${slideIndex}/${slideTotal}</text>

  ${titleLines.join("\n  ")}
  ${bodyElements.join("\n  ")}

  <text
    x="${footerInset}"
    y="${footerBaselineY}"
    font-family="${FONT_HANDWRITTEN_HE}"
    font-size="${format === "story" ? 44 : format === "portrait" ? 41 : 39}"
    font-weight="700"
    fill="${palette.author}"
    fill-opacity="${theme === "dark" ? "0.88" : "0.84"}"
    text-anchor="start"
    transform="rotate(-1 ${footerInset} ${footerBaselineY})"
  >${escapeXml(withRtlEmbedding(authorName))}</text>

  <text
    x="${W - footerInset}"
    y="${footerBaselineY}"
    text-anchor="end"
  ><tspan font-family="${FONT_HANDWRITTEN_LATIN}" font-size="${tyutaFontSize}" fill="${palette.brand}" fill-opacity="${theme === "dark" ? "0.64" : "0.60"}">Tyuta</tspan><tspan dx="${brandDx}" font-family="${FONT_HANDWRITTEN_LATIN}" font-size="${dotNetFontSize}" fill="${palette.brand}" fill-opacity="${theme === "dark" ? "0.56" : "0.52"}">.net</tspan></text>
</svg>`
}

function fitMainBlock({
  text,
  title,
  format,
  preferredBodyFontSize,
  blockWidth,
  availableHeight,
  singleSlide,
  hasTitle,
  contentStats,
}: {
  text: string
  title: string
  format: SlideFormat
  preferredBodyFontSize: number
  blockWidth: number
  availableHeight: number
  singleSlide: boolean
  hasTitle: boolean
  contentStats: ContentStats
}) {
  const minBodyFontSize = singleSlide
    ? (format === "story" ? 34 : format === "portrait" ? 30 : 28)
    : format === "story"
      ? Math.max(28, preferredBodyFontSize - 8)
      : format === "portrait"
        ? Math.max(26, preferredBodyFontSize - 8)
        : Math.max(24, preferredBodyFontSize - 8)
  const preserveSourceLines = singleSlide &&
    format === "story" &&
    (isShortProfile(contentStats) || (isPoeticProfile(contentStats) && contentStats.explicitLineCount <= 14))
  const sourceLineComfortTarget = preserveSourceLines
    ? getSourceLineComfortTarget(format, contentStats)
    : 1
  const singleSlideBoost = singleSlide
    ? isShortProfile(contentStats)
      ? format === "story" ? 8 : 6
      : contentStats.lengthClass === "medium" && contentStats.longestLineLength <= 48
        ? format === "story" ? 3 : 2
        : 0
    : 0
  const maxBodyFontSize = singleSlide
    ? Math.max(
      preferredBodyFontSize + singleSlideBoost,
      getSingleSlideMaxBodyFontSize(format, contentStats),
    )
    : preferredBodyFontSize + singleSlideBoost
  const explicitLineFitCap = preserveSourceLines
    ? resolveExplicitLineFitCap(text, format, blockWidth, maxBodyFontSize, contentStats)
    : maxBodyFontSize
  let bodyFontSize = Math.min(maxBodyFontSize, explicitLineFitCap)
  let bestSingleSlideFit:
    | {
      bodyFontSize: number
      bodyLayout: ReturnType<typeof layoutBodyText>
      titleLayout: TitleLayout
      totalHeight: number
      score: number
    }
    | null = null

  while (bodyFontSize >= minBodyFontSize) {
    const titleLayout = measureTitleLayout(title, {
      bodyFontSize,
      format,
      maxWidth: blockWidth,
    })
    const bodyLayout = layoutBodyText(text, {
      fontSize: bodyFontSize,
      format,
      maxWidth: blockWidth,
    })
    const totalHeight =
      titleLayout.height +
      (titleLayout.lines.length > 0 && bodyLayout.lineCount > 0 ? titleLayout.gapAfter : 0) +
      bodyLayout.totalHeight

    if (totalHeight <= availableHeight) {
      const wrappedSourceLineCount = preserveSourceLines
        ? countWrappedSourceLines(text, bodyFontSize, format, blockWidth)
        : 0
      const sourceLineUsage = preserveSourceLines
        ? measureLongestSourceLineUsage(text, bodyFontSize, blockWidth)
        : 0

      if (preserveSourceLines && (wrappedSourceLineCount > 0 || sourceLineUsage > sourceLineComfortTarget)) {
        bodyFontSize -= 1
        continue
      }

      if (singleSlide) {
        const fillRatio = totalHeight / Math.max(1, availableHeight)
        const lineUsage = summarizeLineUsage(bodyLayout.paragraphs, bodyFontSize, blockWidth)
        const score = scoreSingleSlideFit({
          format,
          fillRatio,
          lineUsage,
          wrappedSourceLineCount,
          sourceLineUsage,
          bodyFontSize,
          hasTitle,
          contentStats,
        })
        if (!bestSingleSlideFit || score > bestSingleSlideFit.score) {
          bestSingleSlideFit = {
            bodyFontSize,
            bodyLayout,
            titleLayout,
            totalHeight,
            score,
          }
        }
      } else {
        return {
          bodyFontSize,
          bodyLayout,
          titleLayout,
          totalHeight,
        }
      }
    }

    bodyFontSize -= 1
  }

  if (bestSingleSlideFit) {
    return {
      bodyFontSize: bestSingleSlideFit.bodyFontSize,
      bodyLayout: bestSingleSlideFit.bodyLayout,
      titleLayout: bestSingleSlideFit.titleLayout,
      totalHeight: bestSingleSlideFit.totalHeight,
    }
  }

  const fallbackBodyFontSize = minBodyFontSize
  return {
    bodyFontSize: fallbackBodyFontSize,
    bodyLayout: layoutBodyText(text, {
      fontSize: fallbackBodyFontSize,
      format,
      maxWidth: blockWidth,
    }),
    titleLayout: measureTitleLayout(title, {
      bodyFontSize: fallbackBodyFontSize,
      format,
      maxWidth: blockWidth,
    }),
    totalHeight: availableHeight,
  }
}

function computeBlockStartY({
  hasTitle,
  singleSlide,
  topReserved,
  availableHeight,
  totalHeight,
  fillRatio,
  continuationBodyTop,
}: {
  hasTitle: boolean
  singleSlide: boolean
  topReserved: number
  availableHeight: number
  totalHeight: number
  fillRatio: number
  continuationBodyTop: number
}): number {
  if (!singleSlide) {
    return hasTitle ? topReserved : continuationBodyTop
  }

  const remaining = Math.max(0, availableHeight - totalHeight)
  const bias = fillRatio < 0.34
    ? hasTitle ? 0.38 : 0.48
    : fillRatio < 0.48
      ? hasTitle ? 0.32 : 0.4
      : hasTitle ? 0.24 : 0.32
  return topReserved + remaining * bias
}

type ContentStats = TextProfile

function scoreSingleSlideFit(
  {
    format,
    fillRatio,
    lineUsage,
    wrappedSourceLineCount,
    sourceLineUsage,
    bodyFontSize,
    hasTitle,
    contentStats,
  }: {
    format: SlideFormat
    fillRatio: number
    lineUsage: { average: number, longest: number }
    wrappedSourceLineCount: number
    sourceLineUsage: number
    bodyFontSize: number
    hasTitle: boolean
    contentStats: ContentStats
  },
): number {
  const target = getSingleSlideTargetFill(format, hasTitle, contentStats)
  const widthTarget = getSingleSlideTargetUsage(format, contentStats)
  const center = (target.min + target.max) / 2
  const distancePenalty = Math.abs(fillRatio - center) * 4.2
  const underPenalty = fillRatio < target.min ? (target.min - fillRatio) * 6.2 : 0
  const overPenalty = fillRatio > target.max ? (fillRatio - target.max) * 7.4 : 0
  const usageCenter = (widthTarget.min + widthTarget.max) / 2
  const usagePenalty = Math.abs(lineUsage.average - usageCenter) * 2.6
  const usageUnderPenalty = lineUsage.average < widthTarget.min
    ? (widthTarget.min - lineUsage.average) * 3.2
    : 0
  const usageOverPenalty = lineUsage.average > widthTarget.max
    ? (lineUsage.average - widthTarget.max) * 2
    : 0
  const longestPenalty = lineUsage.longest > 0.98 ? (lineUsage.longest - 0.98) * 10 : 0
  const sourceWrapPenalty = format === "story" && (
    isShortProfile(contentStats) || (isPoeticProfile(contentStats) && contentStats.explicitLineCount <= 14)
  )
    ? wrappedSourceLineCount * 0.48
    : 0
  const sourceUsageTarget = getSourceLineComfortTarget(format, contentStats)
  const sourceUsagePenalty = sourceLineUsage > sourceUsageTarget
    ? (sourceLineUsage - sourceUsageTarget) * 6.8
    : 0
  const fontBonus = bodyFontSize / 1000
  return 1
    - distancePenalty
    - underPenalty
    - overPenalty
    - usagePenalty
    - usageUnderPenalty
    - usageOverPenalty
    - longestPenalty
    - sourceWrapPenalty
    - sourceUsagePenalty
    + fontBonus
}

function getSingleSlideTargetFill(
  format: SlideFormat,
  hasTitle: boolean,
  contentStats: ContentStats,
): { min: number, max: number } {
  const poetic = isPoeticProfile(contentStats)
  const veryPoetic = isVeryPoeticProfile(contentStats)
  const shortText = isShortProfile(contentStats)
  const longText = contentStats.lengthClass === "long" || contentStats.lengthClass === "veryLong"
  const denseText = contentStats.densityClass === "dense"

  if (format === "story") {
    if (veryPoetic && shortText) {
      return hasTitle ? { min: 0.76, max: 0.94 } : { min: 0.72, max: 0.9 }
    }
    if (poetic) {
      return hasTitle ? { min: 0.72, max: 0.9 } : { min: 0.68, max: 0.86 }
    }
    if (denseText || longText) {
      return hasTitle ? { min: 0.7, max: 0.86 } : { min: 0.64, max: 0.82 }
    }
    return hasTitle ? { min: 0.64, max: 0.84 } : { min: 0.58, max: 0.78 }
  }

  if (format === "portrait") {
    if (shortText && poetic) {
      return hasTitle ? { min: 0.56, max: 0.76 } : { min: 0.52, max: 0.72 }
    }
    if (denseText || longText) {
      return hasTitle ? { min: 0.6, max: 0.8 } : { min: 0.54, max: 0.74 }
    }
    return hasTitle ? { min: 0.54, max: 0.74 } : { min: 0.48, max: 0.68 }
  }

  if (shortText && poetic) {
    return hasTitle ? { min: 0.5, max: 0.68 } : { min: 0.46, max: 0.64 }
  }
  if (denseText || longText) {
    return hasTitle ? { min: 0.58, max: 0.78 } : { min: 0.52, max: 0.72 }
  }
  return hasTitle ? { min: 0.54, max: 0.72 } : { min: 0.48, max: 0.66 }
}

function getSingleSlideTargetUsage(
  format: SlideFormat,
  contentStats: ContentStats,
): { min: number, max: number } {
  const poetic = isPoeticProfile(contentStats)
  const shortText = isShortProfile(contentStats)
  const prose = contentStats.shapeClass === "prose"

  if (format === "story") {
    if (poetic && shortText) return { min: 0.48, max: 0.74 }
    if (poetic) return { min: 0.52, max: 0.78 }
    if (prose) return { min: 0.68, max: 0.9 }
    return { min: 0.6, max: 0.84 }
  }

  if (format === "portrait") {
    if (poetic && shortText) return { min: 0.44, max: 0.68 }
    if (poetic) return { min: 0.48, max: 0.72 }
    if (prose) return { min: 0.64, max: 0.86 }
    return { min: 0.56, max: 0.8 }
  }

  if (poetic && shortText) return { min: 0.42, max: 0.66 }
  if (poetic) return { min: 0.46, max: 0.7 }
  if (prose) return { min: 0.62, max: 0.84 }
  return { min: 0.54, max: 0.78 }
}

function getSingleSlideMaxBodyFontSize(format: SlideFormat, contentStats: ContentStats): number {
  if (format === "story") {
    if (isVeryPoeticProfile(contentStats)) return 104
    if (isPoeticProfile(contentStats)) return 96
    return 88
  }

  if (format === "portrait") {
    if (isShortProfile(contentStats) && isPoeticProfile(contentStats)) return 78
    return 72
  }

  if (isShortProfile(contentStats) && isPoeticProfile(contentStats)) return 68
  return 62
}

function resolveFrameProfile({
  format,
  singleSlide,
  hasTitle,
  contentStats,
  height,
  metrics,
}: {
  format: SlideFormat
  singleSlide: boolean
  hasTitle: boolean
  contentStats: ContentStats
  height: number
  metrics: ReturnType<typeof getFormatMetrics>
}): FrameProfile {
  if (!singleSlide) {
    return {
      horizontalPadding: metrics.horizontalPadding,
      topReserved: metrics.titleTop,
      // Slightly tighter than metrics.bottomReserved to reduce the visual gap between the
      // last body text line and the footer on continuation slides.
      bottomReserved: format === "story" ? 150 : format === "portrait" ? 152 : 142,
      counterY: format === "story" ? 128 : format === "portrait" ? 116 : 110,
      footerBaselineY: height - (format === "story" ? 92 : format === "portrait" ? 82 : 76),
    }
  }

  const veryPoetic = isVeryPoeticProfile(contentStats)
  const shortPoetic = isPoeticProfile(contentStats)
  const shortText = isShortProfile(contentStats)
  const denseSingle = contentStats.densityClass === "dense"

  if (format === "story" && veryPoetic && denseSingle) {
    return {
      horizontalPadding: 54,
      topReserved: hasTitle ? 60 : 56,
      bottomReserved: 146,
      counterY: 108,
      footerBaselineY: height - 68,
    }
  }

  if (format === "story" && shortPoetic) {
    return {
      horizontalPadding: 56,
      topReserved: hasTitle ? 62 : 58,
      bottomReserved: 148,
      counterY: 112,
      footerBaselineY: height - 70,
    }
  }

  if (format === "portrait" && shortText) {
    return {
      horizontalPadding: shortPoetic ? 64 : 70,
      topReserved: hasTitle ? 72 : 66,
      bottomReserved: 160,
      counterY: 108,
      footerBaselineY: height - 68,
    }
  }

  if (format === "square" && shortText) {
    return {
      horizontalPadding: shortPoetic ? 60 : 66,
      topReserved: hasTitle ? 68 : 64,
      bottomReserved: 148,
      counterY: 100,
      footerBaselineY: height - 62,
    }
  }

  return {
    horizontalPadding: metrics.horizontalPadding,
    topReserved: metrics.titleTop,
    bottomReserved: metrics.bottomReserved,
    counterY: format === "story" ? 118 : format === "portrait" ? 110 : 104,
    footerBaselineY: height - (format === "story" ? 72 : format === "portrait" ? 70 : 66),
  }
}

function maybeTightenFrameProfile({
  format,
  singleSlide,
  hasTitle,
  contentStats,
  height,
  frame,
  fillRatio,
}: {
  format: SlideFormat
  singleSlide: boolean
  hasTitle: boolean
  contentStats: ContentStats
  height: number
  frame: FrameProfile
  fillRatio: number
}): FrameProfile | null {
  if (!singleSlide) {
    return null
  }

  const veryPoetic = isVeryPoeticProfile(contentStats)
  const shortPoetic = isPoeticProfile(contentStats)
  const denseSingle = contentStats.densityClass === "dense" || contentStats.lengthClass === "veryLong"

  if (format === "story" && veryPoetic && denseSingle && fillRatio < 0.84) {
    return {
      horizontalPadding: Math.min(frame.horizontalPadding, 48),
      topReserved: Math.min(frame.topReserved, hasTitle ? 52 : 48),
      bottomReserved: Math.min(frame.bottomReserved, 130),
      counterY: 96,
      footerBaselineY: height - 56,
    }
  }

  if (format === "story" && shortPoetic && denseSingle && fillRatio < 0.78) {
    return {
      horizontalPadding: Math.min(frame.horizontalPadding, 52),
      topReserved: Math.min(frame.topReserved, hasTitle ? 56 : 52),
      bottomReserved: Math.min(frame.bottomReserved, 138),
      counterY: 100,
      footerBaselineY: height - 58,
    }
  }

  if (format === "portrait" && shortPoetic && fillRatio < 0.58) {
    return {
      horizontalPadding: Math.min(frame.horizontalPadding, 60),
      topReserved: Math.min(frame.topReserved, hasTitle ? 64 : 60),
      bottomReserved: Math.min(frame.bottomReserved, 150),
      counterY: 100,
      footerBaselineY: height - 60,
    }
  }

  if (format === "square" && shortPoetic && fillRatio < 0.52) {
    return {
      horizontalPadding: Math.min(frame.horizontalPadding, 56),
      topReserved: Math.min(frame.topReserved, hasTitle ? 62 : 58),
      bottomReserved: Math.min(frame.bottomReserved, 140),
      counterY: 94,
      footerBaselineY: height - 56,
    }
  }

  return null
}

function summarizeLineUsage(
  paragraphs: string[][],
  fontSize: number,
  maxWidth: number,
): { average: number, longest: number } {
  const ratios = paragraphs
    .flat()
    .map((line) => measureTextWidth(line, fontSize, "body") / Math.max(1, maxWidth))
    .map((ratio) => Math.min(1, ratio))

  if (ratios.length === 0) {
    return { average: 0, longest: 0 }
  }

  return {
    average: ratios.reduce((sum, ratio) => sum + ratio, 0) / ratios.length,
    longest: ratios.reduce((max, ratio) => Math.max(max, ratio), 0),
  }
}

function resolveExplicitLineFitCap(
  text: string,
  format: SlideFormat,
  blockWidth: number,
  startFontSize: number,
  contentStats: ContentStats,
): number {
  let bestSize = startFontSize
  let bestSourceUsageDelta = Number.POSITIVE_INFINITY
  const comfortTarget = getSourceLineComfortTarget(format, contentStats)
  const minFitSize = format === "story" ? 34 : format === "portrait" ? 30 : 28

  for (let fontSize = startFontSize; fontSize >= minFitSize; fontSize -= 1) {
    const sourceUsage = measureLongestSourceLineUsage(text, fontSize, blockWidth)
    const sourceUsageDelta = Math.max(0, sourceUsage - comfortTarget)

    if (sourceUsageDelta < bestSourceUsageDelta) {
      bestSourceUsageDelta = sourceUsageDelta
      bestSize = fontSize
    }

    if (sourceUsage <= comfortTarget) {
      return fontSize
    }
  }

  return bestSize
}

function countWrappedSourceLines(
  text: string,
  fontSize: number,
  format: SlideFormat,
  blockWidth: number,
): number {
  const paragraphs = parseParagraphs(text)
  let wrappedCount = 0

  for (const paragraph of paragraphs) {
    if (paragraph.length === 0) {
      continue
    }

    const groups = wrapParagraphGroups(paragraph, {
      fontSize,
      format,
      maxWidth: blockWidth,
    })

    wrappedCount += groups.reduce((count, group) => count + (group.length > 1 ? 1 : 0), 0)
  }

  return wrappedCount
}

function measureLongestSourceLineUsage(
  text: string,
  fontSize: number,
  blockWidth: number,
): number {
  const paragraphs = parseParagraphs(text)
  let longestUsage = 0

  for (const paragraph of paragraphs) {
    for (const line of paragraph) {
      const usage = measureTextWidth(line, fontSize, "body") / Math.max(1, blockWidth)
      longestUsage = Math.max(longestUsage, usage)
    }
  }

  return Math.min(1.2, longestUsage)
}

function getSourceLineComfortTarget(
  format: SlideFormat,
  contentStats: ContentStats,
): number {
  if (format !== "story") return 0.94
  if (isVeryPoeticProfile(contentStats)) return 0.978
  if (isPoeticProfile(contentStats)) return 0.984
  if (isShortProfile(contentStats)) return 0.988
  return 0.992
}

function withRtlEmbedding(text: string): string {
  return `${RTL_EMBED}${text}${RTL_POP}`
}

function buildTextureOverlay({
  theme,
  palette,
  width,
  height,
}: {
  theme: "light" | "dark"
  palette: Palette
  width: number
  height: number
}): string {
  const random = createPrng(theme === "dark" ? 29 : 11)
  const washes: string[] = []
  const fibers: string[] = []
  const specks: string[] = []
  const washCount = theme === "dark" ? 7 : 5
  const fiberCount = theme === "dark" ? 80 : 110
  const speckCount = theme === "dark" ? 210 : 240

  for (let i = 0; i < washCount; i++) {
    const cx = random() * width
    const cy = random() * height
    const rx = (theme === "dark" ? 220 : 180) + random() * (theme === "dark" ? 320 : 240)
    const ry = (theme === "dark" ? 90 : 70) + random() * (theme === "dark" ? 150 : 110)
    const rotate = -35 + random() * 70
    const opacity = theme === "dark" ? 0.018 + random() * 0.018 : 0.02 + random() * 0.014
    const color = i % 2 === 0 ? palette.textureAlt : palette.texture
    washes.push(
      `<ellipse cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" rx="${rx.toFixed(1)}" ry="${ry.toFixed(1)}" fill="${color}" opacity="${opacity.toFixed(3)}" transform="rotate(${rotate.toFixed(1)} ${cx.toFixed(1)} ${cy.toFixed(1)})"/>`,
    )
  }

  for (let i = 0; i < fiberCount; i++) {
    const length = (theme === "dark" ? 8 : 6) + random() * (theme === "dark" ? 18 : 14)
    const angle = (theme === "dark" ? -25 : -10) + random() * (theme === "dark" ? 50 : 20)
    const angleRad = angle * (Math.PI / 180)
    const x1 = random() * width
    const y1 = random() * height
    const x2 = x1 + Math.cos(angleRad) * length
    const y2 = y1 + Math.sin(angleRad) * length
    const opacity = theme === "dark" ? 0.008 + random() * 0.012 : 0.008 + random() * 0.01
    const strokeWidth = theme === "dark" ? 0.28 + random() * 0.42 : 0.25 + random() * 0.34
    const stroke = i % 5 === 0 ? palette.textureAlt : palette.texture
    fibers.push(
      `<line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}" ` +
      `stroke="${stroke}" stroke-width="${strokeWidth.toFixed(2)}" stroke-linecap="round" opacity="${opacity.toFixed(3)}"/>`,
    )
  }

  for (let i = 0; i < speckCount; i++) {
    const cx = random() * width
    const cy = random() * height
    const radius = 0.35 + random() * (theme === "dark" ? 1.1 : 0.9)
    const opacity = theme === "dark" ? 0.016 + random() * 0.018 : 0.01 + random() * 0.012
    const fill = i % 4 === 0 ? palette.textureAlt : palette.texture
    specks.push(
      `<circle cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="${radius.toFixed(2)}" fill="${fill}" opacity="${opacity.toFixed(3)}"/>`,
    )
  }

  return `<g>${washes.join("")}${fibers.join("")}${specks.join("")}</g>`
}

function createPrng(seed: number): () => number {
  let value = seed >>> 0
  return () => {
    value += 0x6d2b79f5
    let t = value
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function escapeXml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;")
}

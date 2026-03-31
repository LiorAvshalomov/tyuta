import { measureTextWidth } from "./textMeasure"
import { analyzeTextProfile, type SlideFormat } from "./textProfile"

export type { SlideFormat } from "./textProfile"

type FormatMetrics = {
  height: number
  horizontalPadding: number
  titleTop: number
  bottomReserved: number
}

type WrappedParagraph = {
  groups: string[][]
  lines: string[]
  height: number
}

export type BodyLayout = {
  paragraphs: string[][]
  lineHeight: number
  paragraphGapsBefore: number[]
  totalHeight: number
  lineCount: number
}

export type TitleLayout = {
  lines: string[]
  fontSize: number
  lineHeight: number
  height: number
  gapAfter: number
  totalHeight: number
}

const CARD_WIDTH = 1080
const MAX_TITLE_LINES = 2
const MIN_FONT_SIZE = 30

const METRICS: Record<SlideFormat, FormatMetrics> = {
  story: {
    height: 1920,
    horizontalPadding: 64,
    titleTop: 70,
    bottomReserved: 158,
  },
  portrait: {
    height: 1350,
    horizontalPadding: 76,
    titleTop: 84,
    bottomReserved: 172,
  },
  square: {
    height: 1080,
    horizontalPadding: 70,
    titleTop: 80,
    bottomReserved: 158,
  },
}

type TextKind = "body" | "title"

export function getFormatMetrics(format: SlideFormat): FormatMetrics {
  return METRICS[format]
}

export function getBlockWidth(format: SlideFormat): number {
  return CARD_WIDTH - METRICS[format].horizontalPadding * 2
}

export function bodyLineHeightFor(fontSize: number, format: SlideFormat): number {
  const ratio = format === "story"
    ? fontSize >= 62 ? 1.30 : fontSize >= 44 ? 1.34 : 1.38
    : format === "portrait"
      ? fontSize >= 56 ? 1.28 : fontSize >= 40 ? 1.32 : 1.36
      : fontSize >= 50 ? 1.27 : fontSize >= 36 ? 1.30 : 1.34
  return Math.round(fontSize * ratio)
}

export function paragraphGapFor(fontSize: number, format: SlideFormat): number {
  const lineHeight = bodyLineHeightFor(fontSize, format)
  const ratio = format === "story" ? 0.26 : format === "portrait" ? 0.24 : 0.22
  return Math.round(lineHeight * ratio)
}

export function blankParagraphGapFor(fontSize: number, format: SlideFormat): number {
  const lineHeight = bodyLineHeightFor(fontSize, format)
  const ratio = format === "story" ? 0.65 : format === "portrait" ? 0.62 : 0.60
  return Math.round(lineHeight * ratio)
}

export function titleFontSizeFor(bodyFontSize: number, format: SlideFormat): number {
  return Math.max(
    format === "story" ? 52 : format === "portrait" ? 48 : 45,
    Math.round(bodyFontSize + (format === "story" ? 9 : format === "portrait" ? 8 : 7)),
  )
}

export function measureTitleLayout(
  title: string,
  {
    bodyFontSize,
    format,
    maxWidth,
  }: {
    bodyFontSize: number
    format: SlideFormat
    maxWidth: number
  },
): TitleLayout {
  const trimmed = title.trim()
  if (!trimmed) {
    return {
      lines: [],
      fontSize: titleFontSizeFor(bodyFontSize, format),
      lineHeight: 0,
      height: 0,
      gapAfter: 0,
      totalHeight: 0,
    }
  }

  const fontSize = titleFontSizeFor(bodyFontSize, format)
  const lineHeight = Math.round(fontSize * 1.06)
  const lines = wrapTextToWidth(trimmed, maxWidth, fontSize, "title", format, MAX_TITLE_LINES)
  const height = lines.length > 0
    ? fontSize + Math.max(0, lines.length - 1) * lineHeight
    : 0
  const gapAfter = lines.length > 0
    ? Math.round(bodyLineHeightFor(bodyFontSize, format) * 0.80)
    : 0

  return {
    lines,
    fontSize,
    lineHeight,
    height,
    gapAfter,
    totalHeight: height + gapAfter,
  }
}

export function getContinuationBodyTop(
  title: string,
  {
    bodyFontSize,
    format,
    maxWidth,
  }: {
    bodyFontSize: number
    format: SlideFormat
    maxWidth: number
  },
): number {
  const metrics = getFormatMetrics(format)
  return metrics.titleTop + measureTitleLayout(title, { bodyFontSize, format, maxWidth }).totalHeight
}

export function getBodyAvailableHeight(
  title: string,
  {
    bodyFontSize,
    format,
    maxWidth,
  }: {
    bodyFontSize: number
    format: SlideFormat
    maxWidth: number
  },
): number {
  const metrics = getFormatMetrics(format)
  return metrics.height - metrics.bottomReserved - getContinuationBodyTop(title, { bodyFontSize, format, maxWidth })
}

export function layoutBodyText(
  text: string,
  {
    fontSize,
    format,
    maxWidth,
  }: {
    fontSize: number
    format: SlideFormat
    maxWidth: number
  },
): BodyLayout {
  const paragraphs = parseParagraphs(text)
  const lineHeight = bodyLineHeightFor(fontSize, format)
  const paragraphGap = paragraphGapFor(fontSize, format)
  const blankParagraphGap = blankParagraphGapFor(fontSize, format)
  const renderedParagraphs: string[][] = []
  const paragraphGapsBefore: number[] = []
  let lineCount = 0
  let totalHeight = 0
  let hasContent = false
  let pendingBlankGap = 0

  for (const paragraph of paragraphs) {
    if (paragraph.length === 0) {
      if (hasContent) {
        pendingBlankGap += blankParagraphGap
      }
      continue
    }

    const wrapped = wrapParagraph(paragraph, maxWidth, fontSize, format)
    const gapBefore = hasContent ? paragraphGap + pendingBlankGap : 0

    renderedParagraphs.push(wrapped.lines)
    paragraphGapsBefore.push(gapBefore)
    totalHeight += gapBefore + wrapped.height
    lineCount += wrapped.lines.length
    hasContent = true
    pendingBlankGap = 0
  }

  return {
    paragraphs: renderedParagraphs,
    lineHeight,
    paragraphGapsBefore,
    totalHeight,
    lineCount,
  }
}

export function parseParagraphs(text: string): string[][] {
  const paragraphs: string[][] = []
  const parts = text.split(/(\n{2,})/)

  for (let index = 0; index < parts.length; index += 2) {
    const chunk = parts[index] ?? ""
    const lines = chunk.split("\n").map(normalizeInlineText).filter(Boolean)
    if (lines.length > 0) {
      paragraphs.push(lines)
    }

    const separator = parts[index + 1] ?? ""
    const blankParagraphs = Math.max(0, Math.floor(separator.length / 2) - 1)
    for (let i = 0; i < blankParagraphs; i += 1) {
      paragraphs.push([])
    }
  }

  return paragraphs
}

export function normalizeInlineText(line: string): string {
  return line.replace(/\s+/g, " ").trim()
}

export function measureTextUnits(text: string): number {
  const paragraphs = parseParagraphs(text)
  return paragraphs.reduce((total, paragraph, paragraphIndex) => {
    const chars = paragraph.reduce((count, line) => count + Array.from(line).length, 0)
    const hardBreakCost = Math.max(0, paragraph.length - 1) * 10
    const paragraphCost = paragraphIndex > 0 ? (paragraph.length === 0 ? 56 : 42) : 0
    return total + chars + hardBreakCost + paragraphCost
  }, 0)
}

export function preferredFontSizeFor(
  text: string,
  format: SlideFormat,
  densityHint?: number,
): number {
  const units = measureTextUnits(text)
  const profile = analyzeTextProfile(text)
  const explicitLines = text.split("\n").map((line) => line.trim()).filter(Boolean).length
  const densityShift = densityHint
    ? densityHint >= 1500
      ? 1
      : densityHint >= 900
        ? 0
        : -1
    : 0

  const baseSize =
    format === "story"
      ? units <= 260
        ? 63
        : units <= 420
          ? 55
          : units <= 700
            ? 49
            : units <= 980
              ? 43
              : units <= 1320
                ? 38
                : 34
      : format === "portrait"
        ? units <= 220
          ? 58
          : units <= 360
            ? 52
            : units <= 580
              ? 45
              : units <= 820
                ? 39
                : 34
      : units <= 220
        ? 52
        : units <= 360
          ? 45
          : units <= 600
            ? 41
            : units <= 850
              ? 37
              : 34

  const lengthShift = format === "story"
    ? profile.lengthClass === "veryShort"
      ? 8
      : profile.lengthClass === "short"
        ? 5
        : profile.lengthClass === "medium"
          ? 1
          : profile.lengthClass === "long"
            ? -2
            : -5
    : format === "portrait"
      ? profile.lengthClass === "veryShort"
        ? 6
        : profile.lengthClass === "short"
          ? 4
          : profile.lengthClass === "medium"
            ? 1
            : profile.lengthClass === "long"
              ? -1
              : -4
      : profile.lengthClass === "veryShort"
        ? 5
        : profile.lengthClass === "short"
          ? 3
          : profile.lengthClass === "medium"
            ? 1
            : profile.lengthClass === "long"
              ? -1
              : -3
  const shapeShift = profile.shapeClass === "poetic"
    ? format === "story" ? 2 : 1
    : profile.shapeClass === "prose"
      ? -1
      : 0
  const densityClassShift = profile.densityClass === "dense"
    ? format === "story" ? -3 : -2
    : profile.densityClass === "airy"
      ? 1
      : 0
  const adjustedBaseSize = Math.round(baseSize * 1.05) + lengthShift + shapeShift + densityClassShift

  if (explicitLines >= 18) return Math.max(MIN_FONT_SIZE, adjustedBaseSize - 7 + densityShift)
  if (explicitLines >= 14) return Math.max(MIN_FONT_SIZE, adjustedBaseSize - 6 + densityShift)
  if (explicitLines >= 10) return Math.max(MIN_FONT_SIZE, adjustedBaseSize - 4 + densityShift)
  return Math.max(MIN_FONT_SIZE, adjustedBaseSize + densityShift)
}

export function wrapParagraphGroups(
  paragraph: string[],
  {
    maxWidth,
    fontSize,
    format,
  }: {
    maxWidth: number
    fontSize: number
    format: SlideFormat
  },
): string[][] {
  return wrapParagraph(paragraph, maxWidth, fontSize, format).groups
}

function wrapParagraph(
  paragraph: string[],
  maxWidth: number,
  fontSize: number,
  format: SlideFormat,
): WrappedParagraph {
  const sourceLines = mergeShortSourceLines(paragraph, maxWidth, fontSize, format)
  const groups = sourceLines
    .flatMap((line) => splitLineForPagination(line, sourceLines.length))
    .map((line) => wrapTextToWidth(line, maxWidth, fontSize, "body", format))
  const lines = groups.flat()
  return {
    groups,
    lines,
    height: lines.length * bodyLineHeightFor(fontSize, format),
  }
}

function wrapTextToWidth(
  text: string,
  maxWidth: number,
  fontSize: number,
  kind: TextKind,
  format: SlideFormat,
  maxLines = Number.POSITIVE_INFINITY,
): string[] {
  const safeMaxWidth = getSafeMaxWidth(maxWidth, fontSize, kind, format)
  const words = text.split(/\s+/).filter(Boolean)
  if (words.length === 0) return []

  const fittedWords = words.flatMap((word) =>
    fitsWithinWidth(word, safeMaxWidth, fontSize, kind) ? [word] : hardWrapWord(word, safeMaxWidth, fontSize, kind),
  )

  if (fittedWords.length === 0) return []

  if (kind === "body" && maxLines === Number.POSITIVE_INFINITY) {
    return balanceWordsToWidth(fittedWords, safeMaxWidth, fontSize, format)
  }

  return greedyWrapWords(fittedWords, safeMaxWidth, fontSize, kind, maxLines)
}

function balanceWordsToWidth(
  words: string[],
  maxWidth: number,
  fontSize: number,
  format: SlideFormat,
): string[] {
  if (words.length === 1) {
    return [words[0]]
  }

  const spaceWidth = measureTextWidth(" ", fontSize, "body")
  const wordWidths = words.map((word) => measureTextWidth(word, fontSize, "body"))
  const prefixWidths = [0]

  for (const width of wordWidths) {
    prefixWidths.push(prefixWidths[prefixWidths.length - 1] + width)
  }

  const totalChars = words.reduce((sum, word) => sum + Array.from(word).length, 0)
  const shortPhrase = totalChars <= 22 || words.length <= 4
  const mediumShortPhrase = totalChars <= 36 && words.length <= 8
  const longPhrase = totalChars >= 42 && words.length >= 7
  const targetFill = format === "story"
    ? longPhrase
      ? 0.92
      : shortPhrase
        ? 0.86
        : mediumShortPhrase
          ? 0.90
        : 0.88
    : format === "portrait"
      ? longPhrase
        ? 0.86
        : shortPhrase
          ? 0.80
          : mediumShortPhrase
            ? 0.84
          : 0.82
      : longPhrase
        ? 0.84
        : shortPhrase
          ? 0.78
          : mediumShortPhrase
            ? 0.82
          : 0.80
  const minFill = format === "story"
    ? longPhrase
      ? 0.60
      : shortPhrase
        ? 0.40
        : 0.54
    : format === "portrait"
      ? longPhrase
        ? 0.58
        : shortPhrase
          ? 0.38
          : 0.52
      : longPhrase
        ? 0.56
        : shortPhrase
          ? 0.36
          : 0.50
  const targetWidth = maxWidth * targetFill
  const count = words.length
  const bestCost = Array<number>(count + 1).fill(Number.POSITIVE_INFINITY)
  const nextBreak = Array<number>(count + 1).fill(count)
  bestCost[count] = 0

  function lineWidth(start: number, end: number): number {
    const wordsWidth = prefixWidths[end] - prefixWidths[start]
    const spacesWidth = Math.max(0, end - start - 1) * spaceWidth
    return wordsWidth + spacesWidth
  }

  for (let start = count - 1; start >= 0; start -= 1) {
    for (let end = start + 1; end <= count; end += 1) {
      const width = lineWidth(start, end)
      if (width > maxWidth) {
        break
      }

      const fill = width / maxWidth
      const isLast = end === count
      const shortage = Math.max(0, targetWidth - width) / maxWidth
      const overflow = Math.max(0, width - targetWidth) / maxWidth
      let cost = shortPhrase ? 0.38 : mediumShortPhrase ? 0.24 : longPhrase ? 0.05 : 0.08

      cost += shortage * shortage * (isLast ? 2.4 : 10)
      cost += overflow * overflow * 6

      if (!isLast && fill < minFill) {
        const delta = minFill - fill
        cost += delta * delta * 18
      }

      if (isLast && fill < minFill * 0.82) {
        const delta = minFill * 0.82 - fill
        cost += delta * delta * 8
      }

      if (!isLast && end - start === 1) {
        cost += 1.2
      }

      if (!isLast && (shortPhrase || mediumShortPhrase) && fill >= 0.8) {
        cost -= 0.14
      }

      const totalCost = cost + bestCost[end]
      if (totalCost < bestCost[start]) {
        bestCost[start] = totalCost
        nextBreak[start] = end
      }
    }
  }

  if (!Number.isFinite(bestCost[0])) {
    return greedyWrapWords(words, maxWidth, fontSize, "body", Number.POSITIVE_INFINITY)
  }

  const lines: string[] = []
  let index = 0

  while (index < count) {
    const end = nextBreak[index]
    if (end <= index) {
      return greedyWrapWords(words, maxWidth, fontSize, "body", Number.POSITIVE_INFINITY)
    }
    lines.push(words.slice(index, end).join(" "))
    index = end
  }

  return lines
}

function greedyWrapWords(
  words: string[],
  maxWidth: number,
  fontSize: number,
  kind: TextKind,
  maxLines: number,
): string[] {
  const lines: string[] = []
  let current = ""

  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word
    if (fitsWithinWidth(candidate, maxWidth, fontSize, kind)) {
      current = candidate
      continue
    }

    if (current) {
      lines.push(current)
      current = ""
      if (lines.length >= maxLines) {
        break
      }
    }

    if (fitsWithinWidth(word, maxWidth, fontSize, kind)) {
      current = word
      continue
    }

    const hardSlices = hardWrapWord(word, maxWidth, fontSize, kind)
    for (const slice of hardSlices) {
      if (lines.length >= maxLines) break
      lines.push(slice)
    }
  }

  if (current && lines.length < maxLines) {
    lines.push(current)
  }

  if (lines.length > maxLines) {
    lines.length = maxLines
  }

  if (maxLines !== Number.POSITIVE_INFINITY && lines.length === maxLines) {
    const usedWords = lines.join(" ").split(/\s+/).filter(Boolean).length
    if (usedWords < words.length) {
      lines[lines.length - 1] = appendEllipsis(lines[lines.length - 1], maxWidth, fontSize, kind)
    }
  }

  return lines
}

function hardWrapWord(word: string, maxWidth: number, fontSize: number, kind: TextKind): string[] {
  const slices: string[] = []
  let current = ""

  for (const char of Array.from(word)) {
    const candidate = `${current}${char}`
    if (fitsWithinWidth(candidate, maxWidth, fontSize, kind)) {
      current = candidate
      continue
    }

    if (current) {
      slices.push(current)
    }
    current = char
  }

  if (current) {
    slices.push(current)
  }

  return slices
}

function appendEllipsis(text: string, maxWidth: number, fontSize: number, kind: TextKind): string {
  const ellipsis = "..."
  let current = text.replace(/[.!?,;:]+$/u, "")

  while (current && measureTextWidth(`${current}${ellipsis}`, fontSize, kind) > maxWidth) {
    current = current.slice(0, -1)
  }

  return `${current}${ellipsis}`
}

function fitsWithinWidth(text: string, maxWidth: number, fontSize: number, kind: TextKind): boolean {
  return measureTextWidth(text, fontSize, kind) <= maxWidth
}

function splitLineForPagination(line: string, paragraphLineCount: number): string[] {
  if (paragraphLineCount > 1) {
    return [line]
  }

  const normalized = normalizeInlineText(line)
  if (Array.from(normalized).length < 44) {
    return [normalized]
  }

  const sentenceParts = normalized
    .split(/(?<=[.!?…])\s+/u)
    .map((part) => part.trim())
    .filter(Boolean)

  if (sentenceParts.length <= 1) {
    return [normalized]
  }

  const segments: string[] = []
  let current = ""

  for (const part of sentenceParts) {
    if (!current) {
      current = part
      continue
    }

    const currentLength = Array.from(current).length
    const partLength = Array.from(part).length
    if (currentLength < 22 || currentLength + partLength <= 52) {
      current = `${current} ${part}`
      continue
    }

    segments.push(current)
    current = part
  }

  if (current) {
    segments.push(current)
  }

  return segments.length > 0 ? segments : [normalized]
}

function mergeShortSourceLines(
  paragraph: string[],
  maxWidth: number,
  fontSize: number,
  format: SlideFormat,
): string[] {
  if (format !== "story" || paragraph.length < 2) {
    return paragraph
  }

  const mergeWidth = getSafeMaxWidth(maxWidth, fontSize, "body", format) * 0.96
  const merged: string[] = []

  for (const rawLine of paragraph) {
    const line = normalizeInlineText(rawLine)
    if (!line) continue

    const previous = merged[merged.length - 1]
    if (!previous) {
      merged.push(line)
      continue
    }

    const previousLength = Array.from(previous).length
    const lineLength = Array.from(line).length
    const previousEndsSentence = /[.!?…:;]$/u.test(previous)
    const lineStartsDash = /^[\-–—]/u.test(line)
    const candidate = `${previous} ${line}`
    const candidateWidth = measureTextWidth(candidate, fontSize, "body")

    const shouldMerge =
      !previousEndsSentence &&
      !lineStartsDash &&
      previousLength <= 38 &&
      lineLength <= 38 &&
      previousLength + lineLength <= 74 &&
      candidateWidth <= mergeWidth

    if (shouldMerge) {
      merged[merged.length - 1] = candidate
    } else {
      merged.push(line)
    }
  }

  return merged.length > 0 ? merged : paragraph
}

function getSafeMaxWidth(
  maxWidth: number,
  fontSize: number,
  kind: TextKind,
  format: SlideFormat,
): number {
  const inset = kind === "title"
    ? Math.max(20, Math.round(fontSize * 0.18))
    : format === "story"
      ? Math.max(28, Math.round(fontSize * 0.20))
      : format === "portrait"
        ? Math.max(34, Math.round(fontSize * 0.22))
        : Math.max(28, Math.round(fontSize * 0.20))
  return Math.max(80, maxWidth - inset)
}

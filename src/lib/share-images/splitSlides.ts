import {
  getBlockWidth,
  getBodyAvailableHeight,
  layoutBodyText,
  parseParagraphs,
  preferredFontSizeFor,
  wrapParagraphGroups,
  type SlideFormat,
} from "./layout"
import { analyzeTextProfile, type TextProfile } from "./textProfile"

const MAX_SLIDES = 8
const MIN_FONT_SIZE = 28
const COMPACT_MIN_FONT_SIZE = 24
const MAX_MERGE_FONT_DROP = 6
const SPARSE_TAIL_LINE_THRESHOLD = 5
const MEDIUM_TAIL_LINE_THRESHOLD = 9

export type { SlideFormat }

export type Slide = {
  text: string
  fontSize: number
}

type SplitSlidesOptions = {
  maxUnitsPerSlide?: number
  format?: SlideFormat
  title?: string
}

type PaginationCandidate = {
  slides: string[]
  fontSize: number
  slideCount: number
  lastSlideFill: number
  lastSlideLineCount: number
  averageFill: number
  totalLineCount: number
  maxSlideLineCount: number
  densityClass: number
  sparseClass: number
  // Number of the author's source lines that were forced to wrap at this font size.
  // Only computed for story+poetic content where authorial lineation carries meaning.
  // Used as a tiebreaker after sparseClass so we prefer font sizes that preserve
  // the author's line intent. Zero for prose/portrait/square (no semantic value there).
  sourceWrapCount: number
}

export function splitSlides(
  plainText: string,
  { maxUnitsPerSlide = 380, format = "square", title = "" }: SplitSlidesOptions = {},
): { slides: Slide[]; truncated: boolean } {
  const paragraphs = parseParagraphs(plainText)
  const profile = analyzeTextProfile(plainText)
  const blockWidth = getBlockWidth(format)
  const preferredFontSize = preferredFontSizeFor(plainText, format, maxUnitsPerSlide)
  const candidates = collectCandidates(paragraphs, {
    startFontSize: preferredFontSize,
    minFontSize: MIN_FONT_SIZE,
    format,
    title,
    blockWidth,
    profile,
  })

  // If every downward-scan candidate squeezes into a single overcrowded slide, run an
  // upward scan with larger font sizes that naturally overflow the slide height into 2+
  // slides, giving the layout engine readable multi-slide candidates to choose from.
  // We use upwardCandidates *exclusively* (not mixed with the original 1-slide overcrowded
  // ones) so that pickBestCandidate cannot fall back to minimumSlideCount=1.
  const allSingleOvercrowded =
    candidates.length > 0 && candidates.every((c) => c.slideCount === 1 && c.densityClass >= 2)
  const upwardCandidates = allSingleOvercrowded
    ? collectUpwardCandidates(paragraphs, {
        startFontSize: preferredFontSize + 1,
        maxFontSize: preferredFontSize + 40,
        format,
        title,
        blockWidth,
        profile,
      })
    : []
  const allCandidates = upwardCandidates.length > 0 ? upwardCandidates : candidates

  if (allCandidates.length > 0) {
    const best = maybeMergeSparseTail({
      best: pickBestCandidate(allCandidates),
      paragraphs,
      format,
      title,
      blockWidth,
      profile,
    })
    return { slides: best.slides.map((text) => ({ text, fontSize: best.fontSize })), truncated: false }
  }

  const fallbackSlides = paginateParagraphs(paragraphs, {
    fontSize: MIN_FONT_SIZE,
    format,
    title,
    blockWidth,
  })

  const truncated = fallbackSlides.length > MAX_SLIDES
  const truncatedSlides = fallbackSlides.slice(0, MAX_SLIDES)
  if (truncated && truncatedSlides.length > 0) {
    truncatedSlides[truncatedSlides.length - 1] = appendContinuationMarker(
      truncatedSlides[truncatedSlides.length - 1],
    )
  }

  return { slides: truncatedSlides.map((text) => ({ text, fontSize: MIN_FONT_SIZE })), truncated }
}

// Scan font sizes upward from startFontSize so that longer content overflows the slide
// height and distributes across 2+ slides. Only collects multi-slide results; stops after
// finding two consecutively readable (densityClass === 0) candidates.
function collectUpwardCandidates(
  paragraphs: string[][],
  {
    startFontSize,
    maxFontSize,
    format,
    title,
    blockWidth,
    profile,
  }: {
    startFontSize: number
    maxFontSize: number
    format: SlideFormat
    title: string
    blockWidth: number
    profile: TextProfile
  },
): PaginationCandidate[] {
  const candidates: PaginationCandidate[] = []
  let readableFound = false

  for (let fontSize = startFontSize; fontSize <= maxFontSize; fontSize += 1) {
    const slides = paginateParagraphs(paragraphs, { fontSize, format, title, blockWidth })
    // Larger fonts always produce >= as many slides; once we exceed MAX_SLIDES we can stop.
    if (slides.length > MAX_SLIDES) break
    // Skip single-slide results — those are the overcrowded cases we're trying to escape.
    if (slides.length <= 1) continue

    const c = buildCandidate({ slides, fontSize, format, title, blockWidth, profile })
    candidates.push(c)

    if (c.densityClass === 0) {
      if (readableFound) break // two readable found, enough
      readableFound = true
    }
  }

  return candidates
}

function collectCandidates(
  paragraphs: string[][],
  {
    startFontSize,
    minFontSize,
    format,
    title,
    blockWidth,
    profile,
  }: {
    startFontSize: number
    minFontSize: number
    format: SlideFormat
    title: string
    blockWidth: number
    profile: TextProfile
  },
): PaginationCandidate[] {
  const candidates: PaginationCandidate[] = []

  for (let fontSize = startFontSize; fontSize >= minFontSize; fontSize -= 1) {
    const slides = paginateParagraphs(paragraphs, { fontSize, format, title, blockWidth })
    if (slides.length > MAX_SLIDES) {
      continue
    }

    candidates.push(
      buildCandidate({
        slides,
        fontSize,
        format,
        title,
        blockWidth,
        profile,
      }),
    )
  }

  return candidates
}

function paginateParagraphs(
  paragraphs: string[][],
  {
    fontSize,
    format,
    title,
    blockWidth,
  }: {
    fontSize: number
    format: SlideFormat
    title: string
    blockWidth: number
  },
): string[] {
  const availableHeight = getBodyAvailableHeight(title, { bodyFontSize: fontSize, format, maxWidth: blockWidth })
  const slides: string[] = []
  let currentParagraphs: string[][] = []

  const flushCurrent = () => {
    const serialized = serializeParagraphs(currentParagraphs)
    if (!serialized.trim()) return
    slides.push(serialized)
    currentParagraphs = []
  }

  for (const paragraph of paragraphs) {
    const candidateParagraphs = [...currentParagraphs, paragraph]
    const candidateText = serializeParagraphs(candidateParagraphs)
    const candidateLayout = layoutBodyText(candidateText, { fontSize, format, maxWidth: blockWidth })

    if (candidateLayout.totalHeight <= availableHeight) {
      currentParagraphs = candidateParagraphs
      continue
    }

    if (currentParagraphs.some((item) => item.length > 0)) {
      flushCurrent()
    }

    if (paragraph.length === 0) {
      currentParagraphs = [[]]
      continue
    }

    const wrappedGroups = wrapParagraphGroups(paragraph, {
      fontSize,
      format,
      maxWidth: blockWidth,
    })
    const pieces = splitOversizedParagraph(wrappedGroups, fontSize, format, availableHeight, blockWidth)

    for (let i = 0; i < pieces.length; i += 1) {
      const piece = pieces[i]
      if (i === pieces.length - 1) {
        currentParagraphs = [piece]
      } else {
        slides.push(serializeParagraphs([piece]))
      }
    }
  }

  flushCurrent()
  return rebalanceSlides(slides, { fontSize, format, title, blockWidth })
}

function splitOversizedParagraph(
  wrappedGroups: string[][],
  fontSize: number,
  format: SlideFormat,
  availableHeight: number,
  blockWidth: number,
): string[][] {
  const pieces: string[][] = []
  let currentGroups: string[][] = []

  for (const group of wrappedGroups) {
    const candidateGroups = [...currentGroups, group]
    const candidateLayout = layoutBodyText(flattenGroups(candidateGroups).join("\n"), {
      fontSize,
      format,
      maxWidth: blockWidth,
    })

    if (candidateLayout.totalHeight <= availableHeight) {
      currentGroups = candidateGroups
      continue
    }

    if (currentGroups.length > 0) {
      pieces.push(flattenGroups(currentGroups))
      currentGroups = []
    }

    const groupLayout = layoutBodyText(group.join("\n"), {
      fontSize,
      format,
      maxWidth: blockWidth,
    })
    if (groupLayout.totalHeight <= availableHeight) {
      currentGroups = [group]
      continue
    }

    const linePieces = splitOversizedLineGroup(group, fontSize, format, availableHeight, blockWidth)
    for (let index = 0; index < linePieces.length; index += 1) {
      const piece = linePieces[index]
      if (index === linePieces.length - 1) {
        currentGroups = [piece]
      } else {
        pieces.push(piece)
      }
    }
  }

  if (currentGroups.length) {
    pieces.push(flattenGroups(currentGroups))
  }

  return pieces
}

function splitOversizedLineGroup(
  wrappedLines: string[],
  fontSize: number,
  format: SlideFormat,
  availableHeight: number,
  blockWidth: number,
): string[][] {
  const pieces: string[][] = []
  let current: string[] = []

  for (const line of wrappedLines) {
    const candidate = [...current, line]
    const candidateLayout = layoutBodyText(candidate.join("\n"), {
      fontSize,
      format,
      maxWidth: blockWidth,
    })

    if (candidateLayout.totalHeight <= availableHeight) {
      current = candidate
      continue
    }

    if (current.length > 0) {
      pieces.push(current)
      current = [line]
      continue
    }

    current = [line]
  }

  if (current.length) {
    pieces.push(current)
  }

  return pieces
}

function flattenGroups(groups: string[][]): string[] {
  return groups.flat()
}

function serializeParagraphs(paragraphs: string[][]): string {
  return paragraphs.map((paragraph) => paragraph.join("\n")).join("\n\n")
}

function rebalanceSlides(
  slides: string[],
  {
    fontSize,
    format,
    title,
    blockWidth,
  }: {
    fontSize: number
    format: SlideFormat
    title: string
    blockWidth: number
  },
): string[] {
  if (slides.length < 2) return slides

  const availableHeight = getBodyAvailableHeight(title, {
    bodyFontSize: fontSize,
    format,
    maxWidth: blockWidth,
  })
  const balanced = [...slides]
  const seenStates = new Set<string>()
  const maxPasses = Math.max(6, balanced.length * 6)
  let passes = 0
  let changed = true

  while (changed && passes < maxPasses) {
    const signature = balanced.join("\n<<<slide>>>\n")
    if (seenStates.has(signature)) {
      break
    }
    seenStates.add(signature)
    passes += 1
    changed = false

    for (let index = 0; index < balanced.length - 1; index += 1) {
      const currentParagraphs = parseParagraphs(balanced[index])
      const nextParagraphs = parseParagraphs(balanced[index + 1])
      const currentLayout = layoutBodyText(balanced[index], { fontSize, format, maxWidth: blockWidth })
      const nextLayout = layoutBodyText(balanced[index + 1], { fontSize, format, maxWidth: blockWidth })

      const pulled = tryPullLeadingGroup({
        balanced,
        index,
        currentParagraphs,
        nextParagraphs,
        currentLayout,
        nextLayout,
        fontSize,
        format,
        blockWidth,
        availableHeight,
      })

      if (pulled) {
        changed = true
        continue
      }

      const movedGroup = takeTrailingParagraphGroup(currentParagraphs)
      if (!movedGroup) continue

      const nextCurrent = currentParagraphs.slice(0, currentParagraphs.length - movedGroup.length)
      if (countContentParagraphs(nextCurrent) === 0) continue

      const nextSlideParagraphs = [...movedGroup, ...nextParagraphs]
      const nextCurrentText = serializeParagraphs(nextCurrent)
      const nextSlideText = serializeParagraphs(nextSlideParagraphs)
      const candidateCurrentLayout = layoutBodyText(nextCurrentText, { fontSize, format, maxWidth: blockWidth })
      const candidateNextLayout = layoutBodyText(nextSlideText, { fontSize, format, maxWidth: blockWidth })

      if (
        candidateCurrentLayout.totalHeight > availableHeight ||
        candidateNextLayout.totalHeight > availableHeight
      ) {
        continue
      }

      const currentDiff = Math.abs(currentLayout.totalHeight - nextLayout.totalHeight)
      const nextDiff = Math.abs(candidateCurrentLayout.totalHeight - candidateNextLayout.totalHeight)
      if (nextDiff + 16 >= currentDiff) {
        continue
      }

      balanced[index] = nextCurrentText
      balanced[index + 1] = nextSlideText
      changed = true
    }
  }

  return balanced
}

function tryPullLeadingGroup(
  {
    balanced,
    index,
    currentParagraphs,
    nextParagraphs,
    currentLayout,
    nextLayout,
    fontSize,
    format,
    blockWidth,
    availableHeight,
  }: {
    balanced: string[]
    index: number
    currentParagraphs: string[][]
    nextParagraphs: string[][]
    currentLayout: ReturnType<typeof layoutBodyText>
    nextLayout: ReturnType<typeof layoutBodyText>
    fontSize: number
    format: SlideFormat
    blockWidth: number
    availableHeight: number
  },
): boolean {
  const movedGroup = takeLeadingParagraphGroup(nextParagraphs)
  if (!movedGroup) return false

  const nextRemaining = nextParagraphs.slice(movedGroup.length)
  const candidateCurrentParagraphs = [...currentParagraphs, ...movedGroup]
  const candidateCurrentText = serializeParagraphs(candidateCurrentParagraphs)
  const candidateCurrentLayout = layoutBodyText(candidateCurrentText, {
    fontSize,
    format,
    maxWidth: blockWidth,
  })

  if (candidateCurrentLayout.totalHeight > availableHeight) {
    return false
  }

  const nextRemainingText = serializeParagraphs(nextRemaining)
  const candidateNextLayout = nextRemainingText.trim()
    ? layoutBodyText(nextRemainingText, { fontSize, format, maxWidth: blockWidth })
    : null

  if (candidateNextLayout && candidateNextLayout.totalHeight > availableHeight) {
    return false
  }

  const currentDiff = Math.abs(currentLayout.totalHeight - nextLayout.totalHeight)
  const nextDiff = Math.abs(
    candidateCurrentLayout.totalHeight - (candidateNextLayout?.totalHeight ?? 0),
  )
  const currentFill = currentLayout.totalHeight / Math.max(1, availableHeight)
  const candidateFill = candidateCurrentLayout.totalHeight / Math.max(1, availableHeight)
  const shouldPull =
    nextRemaining.length === 0 ||
    nextDiff + 12 < currentDiff ||
    (currentFill <= 0.84 && candidateFill <= 0.94)

  if (!shouldPull) {
    return false
  }

  balanced[index] = candidateCurrentText
  if (nextRemaining.length === 0 || countContentParagraphs(nextRemaining) === 0) {
    balanced.splice(index + 1, 1)
  } else {
    balanced[index + 1] = nextRemainingText
  }

  return true
}

function takeTrailingParagraphGroup(paragraphs: string[][]): string[][] | null {
  let end = paragraphs.length - 1
  while (end >= 0 && paragraphs[end]?.length === 0) {
    end -= 1
  }
  if (end < 0) return null

  let start = end
  while (start < paragraphs.length - 1 && paragraphs[start + 1]?.length === 0) {
    start += 1
  }

  return paragraphs.slice(end, start + 1)
}

function takeLeadingParagraphGroup(paragraphs: string[][]): string[][] | null {
  let firstContent = 0
  while (firstContent < paragraphs.length && paragraphs[firstContent]?.length === 0) {
    firstContent += 1
  }
  if (firstContent >= paragraphs.length) return null

  let end = firstContent
  while (end + 1 < paragraphs.length && paragraphs[end + 1]?.length === 0) {
    end += 1
  }

  return paragraphs.slice(0, end + 1)
}

function countContentParagraphs(paragraphs: string[][]): number {
  return paragraphs.reduce((count, paragraph) => count + (paragraph.length > 0 ? 1 : 0), 0)
}

function buildCandidate(
  {
    slides,
    fontSize,
    format,
    title,
    blockWidth,
    profile,
  }: {
    slides: string[]
    fontSize: number
    format: SlideFormat
    title: string
    blockWidth: number
    profile: TextProfile
  },
): PaginationCandidate {
  const availableHeight = getBodyAvailableHeight(title, {
    bodyFontSize: fontSize,
    format,
    maxWidth: blockWidth,
  })
  const fills = slides.map((slideText) => {
    const layout = layoutBodyText(slideText, {
      fontSize,
      format,
      maxWidth: blockWidth,
    })
    return availableHeight > 0 ? layout.totalHeight / availableHeight : 1
  })
  const lineCounts = slides.map((slideText) => {
    const layout = layoutBodyText(slideText, {
      fontSize,
      format,
      maxWidth: blockWidth,
    })
    return layout.lineCount
  })
  const totalLineCount = lineCounts.reduce((count, lineCount) => count + lineCount, 0)
  const maxSlideLineCount = lineCounts.reduce((max, lineCount) => Math.max(max, lineCount), 0)
  const lastSlideFill = fills[fills.length - 1] ?? 1
  const lastSlideLineCount = lineCounts[lineCounts.length - 1] ?? 0
  const averageFill = fills.reduce((total, fill) => total + fill, 0) / Math.max(fills.length, 1)

  // For story+poetic content, count source lines that were forced to wrap (too wide for
  // the selected font). This explicit metric lets pickBestCandidate prefer font sizes that
  // preserve authorial lineation — even when two candidates have equal totalLineCount.
  const sourceWrapCount =
    format === "story" && profile.shapeClass === "poetic"
      ? slides.reduce((total, slideText) => {
          return (
            total +
            parseParagraphs(slideText).reduce((count, paragraph) => {
              if (paragraph.length === 0) return count
              const groups = wrapParagraphGroups(paragraph, {
                fontSize,
                format,
                maxWidth: blockWidth,
              })
              return count + groups.reduce((c, group) => c + (group.length > 1 ? 1 : 0), 0)
            }, 0)
          )
        }, 0)
      : 0

  return {
    slides,
    fontSize,
    slideCount: slides.length,
    lastSlideFill,
    lastSlideLineCount,
    averageFill,
    totalLineCount,
    maxSlideLineCount,
    densityClass: classifyDensity(format, profile, maxSlideLineCount, averageFill, slides.length),
    sparseClass: classifySparseLastSlide(slides.length, lastSlideFill),
    sourceWrapCount,
  }
}

function maybeMergeSparseTail(
  {
    best,
    paragraphs,
    format,
    title,
    blockWidth,
    profile,
  }: {
    best: PaginationCandidate
    paragraphs: string[][]
    format: SlideFormat
    title: string
    blockWidth: number
    profile: TextProfile
  },
): PaginationCandidate {
  if (!shouldAttemptSparseTailMerge(best)) {
    return best
  }

  const compactStartFont = Math.min(best.fontSize - 1, MIN_FONT_SIZE - 1)
  if (compactStartFont < COMPACT_MIN_FONT_SIZE) {
    return best
  }

  const compactCandidates = collectCandidates(paragraphs, {
    startFontSize: compactStartFont,
    minFontSize: COMPACT_MIN_FONT_SIZE,
    format,
    title,
    blockWidth,
    profile,
  }).filter((candidate) =>
    candidate.slideCount <= best.slideCount - 1 &&
    best.fontSize - candidate.fontSize <= MAX_MERGE_FONT_DROP
  )

  if (compactCandidates.length === 0) {
    return best
  }

  // Only merge when the result is truly readable — merging into a dense slide
  // trades slide count for cramped text, which hurts readability more than it helps.
  const readableMerge = compactCandidates.filter((c) => c.densityClass === 0)
  if (readableMerge.length === 0) return best
  return pickBestCandidate(readableMerge)
}

function pickBestCandidate(candidates: PaginationCandidate[]): PaginationCandidate {
  const acceptable = candidates.filter((candidate) => candidate.densityClass <= 1)

  let pool: PaginationCandidate[]
  if (acceptable.length > 0) {
    // Among acceptable candidates, prefer fewer slides first, then readability metrics.
    const minimumSlideCount = acceptable.reduce(
      (min, candidate) => Math.min(min, candidate.slideCount),
      Number.POSITIVE_INFINITY,
    )
    const sameCount = acceptable.filter((candidate) => candidate.slideCount === minimumSlideCount)
    const nonAiry = sameCount.filter((candidate) =>
      candidate.averageFill >= (candidate.slideCount === 1 ? 0.34 : 0.35)
    )
    pool = nonAiry.length > 0 ? nonAiry : sameCount
  } else {
    // All candidates are overcrowded (density=2). Don't bias toward fewer slides —
    // a single 98%-fill slide is worse than two 50%-fill slides. Let the sort metrics
    // (maxSlideLineCount, averageFill) pick the least-bad layout.
    const nonAiry = candidates.filter((candidate) =>
      candidate.averageFill >= (candidate.slideCount === 1 ? 0.34 : 0.35)
    )
    pool = nonAiry.length > 0 ? nonAiry : candidates
  }

  if (acceptable.length > 0) {
    // Acceptable pool: sparse tail is a real concern — penalize it before line count.
    // sourceWrapCount: prefer font sizes that preserve the author's source lines (poetic
    // story content only; zero for prose/other formats, so no effect there).
    pool.sort((a, b) => {
      if (a.densityClass !== b.densityClass) return a.densityClass - b.densityClass
      if (a.sparseClass !== b.sparseClass) return a.sparseClass - b.sparseClass
      if (a.sourceWrapCount !== b.sourceWrapCount) return a.sourceWrapCount - b.sourceWrapCount
      if (a.maxSlideLineCount !== b.maxSlideLineCount) return a.maxSlideLineCount - b.maxSlideLineCount
      if (a.totalLineCount !== b.totalLineCount) return a.totalLineCount - b.totalLineCount
      if (a.lastSlideFill !== b.lastSlideFill) return b.lastSlideFill - a.lastSlideFill
      if (a.averageFill !== b.averageFill) return b.averageFill - a.averageFill
      return b.fontSize - a.fontSize
    })
  } else {
    // Fallback (all overcrowded): line density is the priority. A slightly sparse tail on
    // a 2-slide layout is far better than 98% fill on a 1-slide layout — so skip sparseClass.
    pool.sort((a, b) => {
      if (a.densityClass !== b.densityClass) return a.densityClass - b.densityClass
      if (a.maxSlideLineCount !== b.maxSlideLineCount) return a.maxSlideLineCount - b.maxSlideLineCount
      if (a.totalLineCount !== b.totalLineCount) return a.totalLineCount - b.totalLineCount
      if (a.lastSlideFill !== b.lastSlideFill) return b.lastSlideFill - a.lastSlideFill
      if (a.averageFill !== b.averageFill) return b.averageFill - a.averageFill
      return b.fontSize - a.fontSize
    })
  }

  return pool[0]
}

function classifyDensity(
  format: SlideFormat,
  profile: TextProfile,
  maxSlideLineCount: number,
  averageFill: number,
  slideCount: number,
): number {
  const poetic = profile.shapeClass === "poetic"
  const denseText = profile.densityClass === "dense" || profile.lengthClass === "veryLong"
  // Single-slide layouts earn extra line allowance: the reader expects the full post on
  // one page, so a denser layout is acceptable. This prevents a 22-line poem from being
  // penalised to densityClass=2 just because it crosses the multi-slide readable limit.
  const singleBonus = slideCount === 1 ? 5 : 0

  if (format === "story") {
    const readableLineLimit = (denseText ? 14 : poetic ? 18 : 16) + singleBonus
    const acceptableLineLimit = (denseText ? 18 : poetic ? 22 : 20) + singleBonus * 2
    const readableFillLimit = denseText ? 0.72 : poetic ? 0.80 : 0.76
    const acceptableFillLimit = denseText ? 0.80 : poetic ? 0.88 : 0.84
    if (maxSlideLineCount <= readableLineLimit && averageFill <= readableFillLimit) return 0
    if (maxSlideLineCount <= acceptableLineLimit && averageFill <= acceptableFillLimit) return 1
    return 2
  }

  if (format === "portrait") {
    const readableLineLimit = (denseText ? 15 : poetic ? 19 : 17) + singleBonus
    const acceptableLineLimit = (denseText ? 19 : poetic ? 23 : 21) + singleBonus * 2
    const readableFillLimit = denseText ? 0.76 : poetic ? 0.82 : 0.78
    const acceptableFillLimit = denseText ? 0.84 : poetic ? 0.90 : 0.86
    if (maxSlideLineCount <= readableLineLimit && averageFill <= readableFillLimit) return 0
    if (maxSlideLineCount <= acceptableLineLimit && averageFill <= acceptableFillLimit) return 1
    return 2
  }

  const readableLineLimit = (denseText ? 13 : poetic ? 16 : 14) + singleBonus
  const acceptableLineLimit = (denseText ? 17 : poetic ? 20 : 18) + singleBonus * 2
  const readableFillLimit = denseText ? 0.78 : poetic ? 0.84 : 0.80
  const acceptableFillLimit = denseText ? 0.86 : poetic ? 0.92 : 0.88
  if (maxSlideLineCount <= readableLineLimit && averageFill <= readableFillLimit) return 0
  if (maxSlideLineCount <= acceptableLineLimit && averageFill <= acceptableFillLimit) return 1
  return 2
}

function classifySparseLastSlide(slideCount: number, lastSlideFill: number): number {
  if (slideCount <= 1) return 0
  if (lastSlideFill >= 0.58) return 0
  if (lastSlideFill >= 0.4) return 1
  return 2
}

function shouldAttemptSparseTailMerge(candidate: PaginationCandidate): boolean {
  return (
    candidate.slideCount > 1 &&
    (
      (candidate.lastSlideLineCount <= SPARSE_TAIL_LINE_THRESHOLD && candidate.lastSlideFill <= 0.28) ||
      (candidate.lastSlideLineCount <= MEDIUM_TAIL_LINE_THRESHOLD && candidate.lastSlideFill <= 0.5)
    )
  )
}

function appendContinuationMarker(text: string): string {
  return /[.!?]$/u.test(text) ? text : `${text}...`
}

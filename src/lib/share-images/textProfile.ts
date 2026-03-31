export type SlideFormat = "square" | "story" | "portrait"

export type TextLengthClass = "veryShort" | "short" | "medium" | "long" | "veryLong"
export type TextShapeClass = "poetic" | "mixed" | "prose"
export type TextDensityClass = "airy" | "balanced" | "dense"

export type TextProfile = {
  charCount: number
  wordCount: number
  explicitLineCount: number
  paragraphCount: number
  blankParagraphCount: number
  averageLineLength: number
  longestLineLength: number
  shortLineRatio: number
  longLineRatio: number
  manualBreakDensity: number
  lineLengthVariance: number
  lengthClass: TextLengthClass
  shapeClass: TextShapeClass
  densityClass: TextDensityClass
}

export function analyzeTextProfile(text: string): TextProfile {
  const lines = text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
  const lineLengths = lines.map((line) => Array.from(line).length)
  const charCount = lineLengths.reduce((sum, length) => sum + length, 0)
  const wordCount = lines.reduce((sum, line) => sum + line.split(/\s+/).filter(Boolean).length, 0)
  const paragraphChunks = text.split(/\n{2,}/)
  const paragraphCount = paragraphChunks.filter((chunk) => chunk.trim().length > 0).length
  const blankParagraphCount = Math.max(0, paragraphChunks.length - Math.max(paragraphCount, 1))
  const averageLineLength = lineLengths.length > 0 ? charCount / lineLengths.length : 0
  const longestLineLength = lineLengths.reduce((max, length) => Math.max(max, length), 0)
  const shortLineRatio = lineLengths.length > 0
    ? lineLengths.reduce((count, length) => count + (length <= 24 ? 1 : 0), 0) / lineLengths.length
    : 0
  const longLineRatio = lineLengths.length > 0
    ? lineLengths.reduce((count, length) => count + (length >= 42 ? 1 : 0), 0) / lineLengths.length
    : 0
  const manualBreakDensity = paragraphCount > 0 ? lineLengths.length / paragraphCount : lineLengths.length
  const variance = lineLengths.length > 0
    ? lineLengths.reduce((sum, length) => sum + (length - averageLineLength) ** 2, 0) / lineLengths.length
    : 0

  return {
    charCount,
    wordCount,
    explicitLineCount: lineLengths.length,
    paragraphCount,
    blankParagraphCount,
    averageLineLength,
    longestLineLength,
    shortLineRatio,
    longLineRatio,
    manualBreakDensity,
    lineLengthVariance: Math.sqrt(variance),
    lengthClass: classifyLength(charCount, lineLengths.length),
    shapeClass: classifyShape({
      averageLineLength,
      shortLineRatio,
      longLineRatio,
      manualBreakDensity,
      paragraphCount,
      explicitLineCount: lineLengths.length,
    }),
    densityClass: classifyDensity(charCount, lineLengths.length, longLineRatio),
  }
}

export function isPoeticProfile(profile: TextProfile): boolean {
  return profile.shapeClass === "poetic"
}

export function isVeryPoeticProfile(profile: TextProfile): boolean {
  return profile.shapeClass === "poetic" && (
    profile.averageLineLength <= 22 ||
    profile.shortLineRatio >= 0.5
  )
}

export function isShortProfile(profile: TextProfile): boolean {
  return profile.lengthClass === "veryShort" || profile.lengthClass === "short"
}

function classifyLength(charCount: number, explicitLineCount: number): TextLengthClass {
  if (charCount <= 120 && explicitLineCount <= 6) return "veryShort"
  if (charCount <= 260 && explicitLineCount <= 10) return "short"
  if (charCount <= 520 && explicitLineCount <= 18) return "medium"
  if (charCount <= 900 && explicitLineCount <= 30) return "long"
  return "veryLong"
}

function classifyShape(
  {
    averageLineLength,
    shortLineRatio,
    longLineRatio,
    manualBreakDensity,
    paragraphCount,
    explicitLineCount,
  }: {
    averageLineLength: number
    shortLineRatio: number
    longLineRatio: number
    manualBreakDensity: number
    paragraphCount: number
    explicitLineCount: number
  },
): TextShapeClass {
  if (
    averageLineLength <= 24 ||
    shortLineRatio >= 0.42 ||
    manualBreakDensity >= 2.1 ||
    (explicitLineCount <= 16 && paragraphCount >= Math.max(3, explicitLineCount - 1))
  ) {
    return "poetic"
  }

  if (
    averageLineLength >= 34 &&
    shortLineRatio <= 0.18 &&
    longLineRatio >= 0.14 &&
    manualBreakDensity <= 1.45 &&
    paragraphCount <= 5
  ) {
    return "prose"
  }

  return "mixed"
}

function classifyDensity(
  charCount: number,
  explicitLineCount: number,
  longLineRatio: number,
): TextDensityClass {
  if (explicitLineCount <= 7 && charCount <= 180) return "airy"
  if (explicitLineCount >= 26 || charCount >= 960 || (explicitLineCount >= 18 && longLineRatio >= 0.35)) {
    return "dense"
  }
  return "balanced"
}

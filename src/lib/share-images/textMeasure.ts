import fontkit from "fontkit"
import * as path from "path"

type FontKind = "body" | "title"

type FontLayoutRun = {
  glyphs?: Array<{ advanceWidth?: number }>
  positions?: Array<{ xAdvance?: number }>
}

type FontInstance = {
  unitsPerEm: number
  layout: (text: string) => FontLayoutRun
}

const FONTS_DIR = path.join(process.cwd(), "src", "lib", "share-images", "fonts")

const FONT_PATHS: Record<FontKind, string> = {
  body: path.join(FONTS_DIR, "MiriamLibre-Regular.ttf"),
  title: path.join(FONTS_DIR, "Assistant-Variable.ttf"),
}

const fontCache = new Map<FontKind, FontInstance>()
const widthCache = new Map<string, number>()

export function measureTextWidth(text: string, fontSize: number, kind: FontKind): number {
  if (!text) return 0
  const measurementText = stripWidthNeutralMarks(text)

  const cacheKey = `${kind}:${fontSize}:${measurementText}`
  const cached = widthCache.get(cacheKey)
  if (cached !== undefined) {
    return cached
  }

  try {
    const font = loadFont(kind)
    const run = font.layout(measurementText)
    const advanceWidth = run.glyphs?.reduce((total, glyph, index) => {
      const xAdvance = run.positions?.[index]?.xAdvance
      return total + (xAdvance ?? glyph.advanceWidth ?? 0)
    }, 0) ?? 0

    const width = advanceWidth * (fontSize / font.unitsPerEm)
    widthCache.set(cacheKey, width)
    return width
  } catch {
    const fallback = measureHeuristicWidth(measurementText, fontSize, kind)
    widthCache.set(cacheKey, fallback)
    return fallback
  }
}

function loadFont(kind: FontKind): FontInstance {
  const cached = fontCache.get(kind)
  if (cached) return cached

  const font = fontkit.openSync(FONT_PATHS[kind])
  fontCache.set(kind, font)
  return font
}

function measureHeuristicWidth(text: string, fontSize: number, kind: FontKind): number {
  return Array.from(text).reduce((width, char) => width + fontSize * charWidthFactor(char, kind), 0)
}

function stripWidthNeutralMarks(text: string): string {
  return text.replace(/[\u0591-\u05C7]/gu, "")
}

function charWidthFactor(char: string, kind: FontKind): number {
  if (char === " ") return 0.25
  if (/[\u0591-\u05C7]/u.test(char)) return 0
  if (/[\u05D0-\u05EA]/u.test(char)) return kind === "title" ? 0.45 : 0.5
  if (/[A-Z]/.test(char)) return kind === "title" ? 0.54 : 0.5
  if (/[a-z]/.test(char)) return kind === "title" ? 0.42 : 0.44
  if (/[0-9]/.test(char)) return 0.48
  if (/[.,!?;:]/.test(char)) return 0.2
  if (/["'\u05F3\u201C\u201D]/u.test(char)) return 0.18
  if (/[(){}\[\]\\/|-]/.test(char)) return 0.24
  return kind === "title" ? 0.5 : 0.48
}

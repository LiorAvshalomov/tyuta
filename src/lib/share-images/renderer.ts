/**
 * Renders a share-image card to PNG using @resvg/resvg-js.
 *
 * Fonts are resolved from the bundled TTF files via process.cwd()
 * (Vercel: outputFileTracingIncludes in next.config.ts keeps them with the route).
 */
import { Resvg, type ResvgRenderOptions } from "@resvg/resvg-js"
import * as path from "path"
import { buildSvg, type CardOptions } from "./buildSvg"

const FONTS_DIR = path.join(process.cwd(), "src", "lib", "share-images", "fonts")

const FONT_FILES = [
  path.join(FONTS_DIR, "Assistant-Variable.ttf"),
  path.join(FONTS_DIR, "GveretLevin-Regular.ttf"),
  path.join(FONTS_DIR, "MiriamLibre-Regular.ttf"),
  path.join(FONTS_DIR, "NotoSerifHebrew-Regular.ttf"),
  path.join(FONTS_DIR, "Pacifico-Regular.ttf"),
  path.join(FONTS_DIR, "ShadowsIntoLight-Regular.ttf"),
  path.join(FONTS_DIR, "Caveat-Variable.ttf"),
]

export function renderCard(opts: CardOptions): Buffer {
  const svg = buildSvg(opts)
  const options: ResvgRenderOptions = {
    font: {
      fontFiles: FONT_FILES,
      loadSystemFonts: false,
      defaultFontFamily: "Miriam Libre",
      sansSerifFamily: "Assistant",
      cursiveFamily: "Caveat",
    },
    fitTo: { mode: "width", value: 1080 },
  }

  const resvg = new Resvg(svg, options)
  const rendered = resvg.render()
  return rendered.asPng()
}

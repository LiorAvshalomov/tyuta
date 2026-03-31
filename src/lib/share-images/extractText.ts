/**
 * Extracts plain text from a TipTap JSON document.
 * Walks the node tree, joining paragraphs with double-newline,
 * hard breaks with single-newline. Skips images, relatedPosts,
 * and other non-text nodes.
 */

type TipTapNode = {
  type?: string
  text?: string
  content?: TipTapNode[]
}

const SKIP_TYPES = new Set(["image", "relatedPosts", "youtube", "horizontalRule"])

export function extractText(doc: TipTapNode): string {
  const parts: string[] = []

  function walk(node: TipTapNode): void {
    if (!node) return

    if (node.type === "text") {
      parts.push(node.text ?? "")
      return
    }

    if (node.type === "hardBreak") {
      parts.push("\n")
      return
    }

    if (node.type && SKIP_TYPES.has(node.type)) {
      return
    }

    const isParagraph = node.type === "paragraph" || node.type === "heading"

    if (node.content?.length) {
      for (const child of node.content) {
        walk(child)
      }
    }

    if (isParagraph) {
      parts.push("\n\n")
    }
  }

  walk(doc)

  return parts
    .join("")
    .replace(/\n{8,}/g, "\n\n\n\n\n\n") // keep intentional blank paragraphs, cap pathological runs
    .trim()
}

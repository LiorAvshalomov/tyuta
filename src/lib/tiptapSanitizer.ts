import type { JSONContent } from '@tiptap/react'
import {
  sanitizeRichTextColor,
  sanitizeRichTextHref,
  toYouTubeNoCookieEmbed,
} from '@/lib/richTextSecurity'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const MAX_TEXT_LENGTH = 60_000
const MAX_ALT_LENGTH = 180
const MAX_PATH_LENGTH = 512

type JsonRecord = Record<string, unknown>
type TipTapMark = NonNullable<JSONContent['marks']>[number]

function isRecord(value: unknown): value is JsonRecord {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}

function asContentArray(value: unknown): JSONContent[] {
  return Array.isArray(value) ? value.filter(isRecord).map((item) => item as JSONContent) : []
}

function compactText(value: unknown, maxLength: number): string | null {
  if (typeof value !== 'string') return null
  const text = value.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
  return text.slice(0, maxLength)
}

function safeStoragePath(value: unknown): string | null {
  const path = compactText(value, MAX_PATH_LENGTH)?.trim()
  if (!path || path.includes('..') || path.includes('//') || /[?#\s]/.test(path)) return null
  const parts = path.split('/').filter(Boolean)
  if (parts.length < 3) return null
  return parts.join('/')
}

function safeImageSrc(value: unknown): string | null {
  const src = compactText(value, MAX_PATH_LENGTH)?.trim()
  if (!src) return null
  if (src.startsWith('/api/media/post-image')) return src
  if (/^https:\/\//i.test(src)) return src
  return null
}

function sanitizeMarks(value: unknown): JSONContent['marks'] | undefined {
  if (!Array.isArray(value)) return undefined

  const marks = value
    .filter(isRecord)
    .map((mark): JSONContent | null => {
      const type = typeof mark.type === 'string' ? mark.type : ''
      const attrs = isRecord(mark.attrs) ? mark.attrs : {}

      if (type === 'bold' || type === 'italic' || type === 'underline') return { type }
      if (type === 'link') {
        const href = sanitizeRichTextHref(attrs.href)
        return href ? { type, attrs: { href } } : null
      }
      if (type === 'highlight') {
        const color = sanitizeRichTextColor(attrs.color)
        return color ? { type, attrs: { color } } : { type }
      }
      if (type === 'textStyle') {
        const color = sanitizeRichTextColor(attrs.color)
        return color ? { type, attrs: { color } } : null
      }
      return null
    })
    .filter((mark): mark is TipTapMark => mark !== null)

  return marks.length > 0 ? marks : undefined
}

function sanitizeNode(node: JSONContent): JSONContent | null {
  const type = typeof node.type === 'string' ? node.type : ''
  const attrs = isRecord(node.attrs) ? node.attrs : {}
  const children = asContentArray(node.content).map(sanitizeNode).filter((child): child is JSONContent => child !== null)

  if (type === 'doc') return { type: 'doc', content: children.length ? children : [{ type: 'paragraph' }] }
  if (type === 'text') {
    const text = compactText(node.text, MAX_TEXT_LENGTH)
    if (!text) return null
    const marks = sanitizeMarks(node.marks)
    return marks ? { type: 'text', text, marks } : { type: 'text', text }
  }
  if (type === 'hardBreak' || type === 'horizontalRule') return { type }
  if (type === 'paragraph') return children.length ? { type, content: children } : { type }
  if (type === 'blockquote' || type === 'bulletList' || type === 'orderedList' || type === 'listItem') {
    return children.length ? { type, content: children } : null
  }
  if (type === 'heading') {
    const rawLevel = typeof attrs.level === 'number' ? attrs.level : 2
    const level = rawLevel === 3 || rawLevel === 4 ? rawLevel : 2
    return { type, attrs: { level }, content: children }
  }
  if (type === 'image') {
    const path = safeStoragePath(attrs.path)
    const src = safeImageSrc(attrs.src)
    if (!path && !src) return null
    const rawWidth = typeof attrs.widthPercent === 'number' ? attrs.widthPercent : 100
    const widthPercent = rawWidth === 33 || rawWidth === 66 || rawWidth === 100 ? rawWidth : 100
    return {
      type,
      attrs: {
        ...(src ? { src } : {}),
        ...(path ? { path } : {}),
        alt: compactText(attrs.alt, MAX_ALT_LENGTH) ?? '',
        widthPercent,
      },
    }
  }
  if (type === 'youtube' || type === 'youtubeVideo') {
    const src = toYouTubeNoCookieEmbed(attrs.src)
    return src ? { type, attrs: { src } } : null
  }
  if (type === 'relatedPosts') {
    const postIds = Array.isArray(attrs.postIds)
      ? attrs.postIds.filter((id): id is string => typeof id === 'string' && UUID_RE.test(id)).slice(0, 30)
      : []
    return postIds.length ? { type, attrs: { postIds, hasIntro: attrs.hasIntro === true } } : null
  }

  return children.length ? { type: 'paragraph', content: children } : null
}

export function sanitizeTipTapContent(value: JSONContent | null | undefined): JSONContent {
  const root = value && value.type === 'doc' ? value : { type: 'doc', content: [] }
  const sanitized = sanitizeNode(root)
  return sanitized && sanitized.type === 'doc'
    ? sanitized
    : { type: 'doc', content: [{ type: 'paragraph' }] }
}

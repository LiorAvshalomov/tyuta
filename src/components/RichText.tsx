'use client'

import React, { useEffect, useState } from 'react'
import { RICHTEXT_TYPOGRAPHY } from '@/lib/richtextStyles'
import {
  isPostImageProxySrc,
  postImageProxySrc,
  postImagePublicSrc,
  postImageStoragePath,
} from '@/lib/postImageUrl'
import { supabase } from '@/lib/supabaseClient'

type Mark = {
  type: 'bold' | 'italic' | string
  attrs?: Record<string, unknown>
}

type Attrs = {
  level?: number
  src?: string
  alt?: string
  path?: string
  width?: number
  height?: number
  widthPercent?: number
}

export type RichNode = {
  type?: string
  text?: string
  marks?: Mark[]
  attrs?: Attrs
  content?: RichNode[]
}

type Props = {
  content: RichNode
  /** id של הפוסט הנוכחי (UUID) – match ראשוני לזיהוי "אתה פה" ברשימת פרקי הסדרה */
  currentPostId?: string
  /** slug fallback – בשימוש כאשר currentPostId לא מוגדר */
  currentSlug?: string
}

function toYouTubeNoCookieEmbed(src: string): string | null {
  try {
    const url = new URL(src)
    const host = url.hostname.replace(/^www\./, '')

    // Already an embed URL
    if (host === 'youtube-nocookie.com' && url.pathname.startsWith('/embed/')) return url.toString()
    if (host === 'youtube.com' && url.pathname.startsWith('/embed/')) {
      return `https://www.youtube-nocookie.com${url.pathname}${url.search}`
    }

    // youtu.be/<id>
    if (host === 'youtu.be') {
      const id = url.pathname.split('/').filter(Boolean)[0]
      if (!id) return null
      return `https://www.youtube-nocookie.com/embed/${id}`
    }

    // youtube.com/watch?v=<id>
    if (host.endsWith('youtube.com')) {
      const v = url.searchParams.get('v')
      if (!v) return null
      return `https://www.youtube-nocookie.com/embed/${v}`
    }

    return null
  } catch {
    return null
  }
}

/** Allow only http/https URLs and internal /path or #anchor refs. */
function sanitizeHref(href: unknown): string | null {
  if (typeof href !== 'string') return null
  const h = href.trim()
  if (h.startsWith('/') || h.startsWith('#')) return h
  if (/^https?:\/\//i.test(h)) return h
  return null
}

function renderText(node: RichNode, key: string) {
  const text = node.text ?? ''
  const marks = node.marks ?? []

  // TipTap may include "\n" inside text nodes (e.g. pasted content).
  // Convert them to <br/> so line breaks are preserved.
  const parts = text.split(/\n/)
  let out: React.ReactNode =
    parts.length <= 1
      ? text
      : parts.map((p, i) => (
          <React.Fragment key={`${key}-nl-${i}`}>
            {p}
            {i < parts.length - 1 ? <br /> : null}
          </React.Fragment>
        ))

  for (const mark of marks) {
    if (mark.type === 'bold') out = <strong key={`${key}-b`}>{out}</strong>
    if (mark.type === 'italic') out = <em key={`${key}-i`}>{out}</em>
    if (mark.type === 'underline') out = <u key={`${key}-u`}>{out}</u>
    if (mark.type === 'highlight') {
      const color = typeof mark.attrs?.['color'] === 'string' ? mark.attrs['color'] : undefined
      out = <mark key={`${key}-hl`} style={color ? { backgroundColor: color } : undefined}>{out}</mark>
    }
    if (mark.type === 'textStyle') {
      const color = typeof mark.attrs?.['color'] === 'string' ? mark.attrs['color'] : undefined
      if (color) out = <span key={`${key}-ts`} style={{ color }}>{out}</span>
    }
    if (mark.type === 'link') {
      const href = sanitizeHref(mark.attrs?.['href'])
      if (href) {
        const isExternal = /^https?:\/\//i.test(href)
        out = (
          <a
            key={`${key}-a`}
            href={href}
            {...(isExternal ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
          >
            {out}
          </a>
        )
      }
    }
  }

  return <React.Fragment key={key}>{out}</React.Fragment>
}

function getChapterNumber(index: number, hasIntro: boolean): number {
  return hasIntro ? index : index + 1
}

/**
 * Extracts postIds from relatedPosts attrs.
 * Handles both new format (attrs.postIds) and old format (attrs.items[].id).
 */
function extractPostIds(attrs: Record<string, unknown> | undefined): string[] {
  if (!attrs) return []
  if (Array.isArray(attrs.postIds)) {
    return (attrs.postIds as unknown[]).filter((x): x is string => typeof x === 'string')
  }
  if (Array.isArray(attrs.items)) {
    return (attrs.items as Array<Record<string, unknown>>)
      .map(item => item.id)
      .filter((x): x is string => typeof x === 'string')
  }
  return []
}

type LiveChapter = { id: string; slug: string; title: string; status: string }

/** Fetches live chapter data and renders the ordered list. */
function SerialChaptersList({
  postIds,
  hasIntro,
  currentPostId,
  currentSlug,
}: {
  postIds: string[]
  hasIntro: boolean
  currentPostId?: string
  currentSlug?: string
}) {
  const [chapters, setChapters] = useState<LiveChapter[]>([])
  const [loaded, setLoaded] = useState(false)

  const idsKey = postIds.join(',')

  useEffect(() => {
    if (postIds.length === 0) { setLoaded(true); return }
    let cancelled = false
    supabase
      .from('posts')
      .select('id, slug, title, status')
      .in('id', postIds)
      .then(({ data }) => {
        if (cancelled) return
        const rows = (data ?? []) as LiveChapter[]
        // Preserve the order from postIds (DB returns in any order)
        const ordered = postIds
          .map(id => rows.find(r => r.id === id))
          .filter((r): r is LiveChapter => r != null)
        setChapters(ordered)
        setLoaded(true)
      })
    return () => { cancelled = true }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idsKey])

  if (!loaded) {
    return (
      <div style={{ color: 'var(--color-muted-foreground)', fontSize: 13 }}>
        טוען פרקים…
      </div>
    )
  }
  if (chapters.length === 0) return null

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {chapters.map((item, i) => {
        const chNum = getChapterNumber(i, hasIntro)
        const isCurrent =
          (!!currentPostId && item.id === currentPostId) ||
          (!currentPostId && !!currentSlug && item.slug === currentSlug)
        const isPublished = item.status === 'published'

        return (
          <div key={item.id} style={{ display: 'flex', alignItems: 'baseline', gap: 8, lineHeight: 1.7 }}>
            <span style={{ flexShrink: 0, minWidth: 20, color: 'var(--color-muted-foreground)', fontSize: 13 }}>
              {chNum}.
            </span>
            {isCurrent ? (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, cursor: 'default' }}>
                <span style={{ fontWeight: 600 }}>{item.title}</span>
                <span style={{ fontSize: 11, padding: '1px 6px', borderRadius: 4, border: '1px solid currentColor', color: 'var(--color-muted-foreground)', whiteSpace: 'nowrap' }}>
                  אתה פה
                </span>
              </span>
            ) : isPublished ? (
              <a
                href={`/post/${item.slug}`}
                style={{ textDecoration: 'none' }}
                className="text-blue-700 dark:text-blue-400 hover:underline"
              >
                {item.title}
              </a>
            ) : (
              // Deleted / unpublished – show as disabled text, not a link
              <span style={{ color: 'var(--color-muted-foreground)', textDecoration: 'line-through', fontSize: 14 }}>
                {item.title}
              </span>
            )}
          </div>
        )
      })}
    </div>
  )
}

function renderNode(node: RichNode, key: string, currentPostId?: string, currentSlug?: string): React.ReactNode {
  if (!node || !node.type) return null

  if (node.type === 'text') return renderText(node, key)
  if (node.type === 'hardBreak') return <br key={key} />

  const children = (node.content ?? []).map((c, i) =>
    renderNode(c, `${key}-${i}`, currentPostId, currentSlug)
  )

  switch (node.type) {
    case 'doc':
      return <div key={key}>{children}</div>

    case 'paragraph': {
      const hasContent = Array.isArray(node.content) && node.content.length > 0
      return <p key={key}>{hasContent ? children : <br />}</p>
    }

    case 'heading': {
      const lvl = node.attrs?.level ?? 2
      if (lvl === 3) return <h3 key={key}>{children}</h3>
      if (lvl >= 4) return <h4 key={key}>{children}</h4>
      return <h2 key={key}>{children}</h2>
    }

    case 'blockquote':
      return <blockquote key={key}>{children}</blockquote>

    case 'bulletList':
      return <ul key={key}>{children}</ul>

    case 'orderedList':
      return <ol key={key}>{children}</ol>

    case 'listItem':
      return <li key={key}>{children}</li>

    case 'horizontalRule':
      return <hr key={key} />

    case 'image': {
  const attrs = node.attrs as Attrs | undefined
  const path = postImageStoragePath(attrs?.path, attrs?.src)
  const proxySrc = postImageProxySrc(path, currentPostId)
  const publicSrc = postImagePublicSrc(path, currentPostId)
  const src = publicSrc ?? proxySrc ?? attrs?.src?.trim() ?? null
  if (!src) return null
  // Only allow http/https — block data:, javascript:, and other schemes
  if (!proxySrc && !isPostImageProxySrc(src) && !/^https?:\/\//i.test(src)) return null

  const alt = attrs?.alt ?? ''

  const raw = attrs?.widthPercent
  const wp = raw === 33 || raw === 66 || raw === 100 ? raw : 100

  return (
    <div key={key} className="my-4" style={{ width: `${wp}%` }}>
      {/* eslint-disable-next-line @next/next/no-img-element -- rich-text image sizing and proxy fallback are data-driven here */}
      <img
        src={src}
        alt={alt}
        loading="lazy"
        style={{ width: '100%', height: 'auto', display: 'block' }}
        className="rounded-2xl"
        onError={(event) => {
          if (publicSrc && proxySrc && event.currentTarget.src !== proxySrc) {
            event.currentTarget.src = proxySrc
          }
        }}
      />
    </div>
  )
}

    // TipTap YouTube extension commonly emits a node type of "youtube".
    // Some setups may emit "youtubeVideo".
    case 'youtube':
    case 'youtubeVideo': {
      const src = (node.attrs as Attrs | undefined)?.src
      if (!src) return null
      const embed = toYouTubeNoCookieEmbed(src)
      if (!embed) return null
      return (
        <div key={key} className="my-4 overflow-hidden rounded-2xl">
          <div className="relative w-full" style={{ paddingTop: '56.25%' }}>
            <iframe
              src={embed}
              className="absolute inset-0 h-full w-full"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
              title="YouTube"
            />
          </div>
        </div>
      )
    }

    case 'relatedPosts': {
      const rawAttrs = node.attrs as Record<string, unknown> | undefined
      const postIds = extractPostIds(rawAttrs)
      if (postIds.length === 0) return null
      const hasIntro = !!(rawAttrs?.hasIntro)
      return (
        <div
          key={key}
          dir="rtl"
          className="mt-8 pt-5 border-t border-neutral-200 dark:border-border"
        >
          <h3 style={{ fontSize: 18, fontWeight: 700, marginBottom: 12 }}>
            פרקים בסדרה
          </h3>
          <SerialChaptersList
            postIds={postIds}
            hasIntro={hasIntro}
            currentPostId={currentPostId}
            currentSlug={currentSlug}
          />
        </div>
      )
    }

    default:
      return <span key={key}>{children}</span>
  }
}

export default function RichText({ content, currentPostId, currentSlug }: Props) {
  const normalized: RichNode =
    content && content.type === 'doc'
      ? content
      : { type: 'doc', content: [{ type: 'paragraph', content: [] }] }

  return (
    <div
      dir="rtl"
      className={`richtext-viewer w-full max-w-[72ch] ml-auto whitespace-pre-wrap ${RICHTEXT_TYPOGRAPHY}`}
    >
      {renderNode(normalized, 'root', currentPostId, currentSlug)}
    </div>
  )
}

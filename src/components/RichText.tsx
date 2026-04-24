'use client'

import React, { useEffect, useState } from 'react'

import { RICHTEXT_TYPOGRAPHY } from '@/lib/richtextStyles'
import {
  isPostImageProxySrc,
  postImageProxySrc,
  postImagePublicSrc,
  postImageStoragePath,
} from '@/lib/postImageUrl'
import {
  formatRelatedPostPosition,
  getPostSeriesConfig,
} from '@/lib/postSeries'
import {
  sanitizeRichTextColor,
  sanitizeRichTextHref,
  toYouTubeNoCookieEmbed,
} from '@/lib/richTextSecurity'
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
  currentPostId?: string
  currentSlug?: string
  currentChannelName?: string | null
  currentChannelId?: number | null
  currentSubcategoryName?: string | null
  currentSubcategoryTagId?: number | null
}

type SeriesContext = {
  currentChannelName?: string | null
  currentChannelId?: number | null
  currentSubcategoryName?: string | null
  currentSubcategoryTagId?: number | null
}

function renderText(node: RichNode, key: string) {
  const text = node.text ?? ''
  const marks = node.marks ?? []

  const parts = text.split(/\n/)
  let out: React.ReactNode =
    parts.length <= 1
      ? text
      : parts.map((part, index) => (
          <React.Fragment key={`${key}-nl-${index}`}>
            {part}
            {index < parts.length - 1 ? <br /> : null}
          </React.Fragment>
        ))

  for (const mark of marks) {
    if (mark.type === 'bold') out = <strong key={`${key}-b`}>{out}</strong>
    if (mark.type === 'italic') out = <em key={`${key}-i`}>{out}</em>
    if (mark.type === 'underline') out = <u key={`${key}-u`}>{out}</u>
    if (mark.type === 'highlight') {
      const color = sanitizeRichTextColor(mark.attrs?.color)
      out = <mark key={`${key}-hl`} style={color ? { backgroundColor: color } : undefined}>{out}</mark>
    }
    if (mark.type === 'textStyle') {
      const color = sanitizeRichTextColor(mark.attrs?.color)
      if (color) out = <span key={`${key}-ts`} style={{ color }}>{out}</span>
    }
    if (mark.type === 'link') {
      const href = sanitizeRichTextHref(mark.attrs?.href)
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

function extractPostIds(attrs: Record<string, unknown> | undefined): string[] {
  if (!attrs) return []
  if (Array.isArray(attrs.postIds)) {
    return (attrs.postIds as unknown[]).filter((value): value is string => typeof value === 'string')
  }
  if (Array.isArray(attrs.items)) {
    return (attrs.items as Array<Record<string, unknown>>)
      .map(item => item.id)
      .filter((value): value is string => typeof value === 'string')
  }
  return []
}

type LiveChapter = {
  id: string
  slug: string
  title: string
  status: string
  channel_id: number | null
  subcategory_tag_id: number | null
}

function SerialChaptersList({
  postIds,
  hasIntro,
  currentPostId,
  currentSlug,
  currentChannelId,
  currentSubcategoryTagId,
  currentPostBadge,
  loadingLabel,
  introBadge,
}: {
  postIds: string[]
  hasIntro: boolean
  currentPostId?: string
  currentSlug?: string
  currentChannelId?: number | null
  currentSubcategoryTagId?: number | null
  currentPostBadge: string
  loadingLabel: string
  introBadge: string
}) {
  const [chapters, setChapters] = useState<LiveChapter[]>([])
  const [loaded, setLoaded] = useState(false)

  const idsKey = postIds.join(',')

  useEffect(() => {
    if (postIds.length === 0) {
      setLoaded(true)
      return
    }

    let cancelled = false

    supabase
      .from('posts')
      .select('id, slug, title, status, channel_id, subcategory_tag_id')
      .in('id', postIds)
      .then(({ data }) => {
        if (cancelled) return

        const rows = (data ?? []) as LiveChapter[]
        const ordered = postIds
          .map(id => rows.find(row => row.id === id))
          .filter((row): row is LiveChapter => row != null)

        setChapters(ordered)
        setLoaded(true)
      })

    return () => {
      cancelled = true
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idsKey])

  if (!loaded) {
    return (
      <div style={{ color: 'var(--color-muted-foreground)', fontSize: 13 }}>
        {loadingLabel}
      </div>
    )
  }

  if (chapters.length === 0) return null

  const visibleChapters = chapters.filter(item => {
    if (item.status !== 'published') return false
    if (currentChannelId != null && item.channel_id !== currentChannelId) return false
    if (currentSubcategoryTagId != null && item.subcategory_tag_id !== currentSubcategoryTagId) return false
    return true
  })

  if (visibleChapters.length <= 1) return null

  const firstVisibleOriginalIndex = chapters.findIndex(item => item.id === visibleChapters[0]?.id)
  const showIntroBadge = hasIntro && firstVisibleOriginalIndex === 0

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {visibleChapters.map((item, index) => {
        const positionLabel = formatRelatedPostPosition(index, showIntroBadge, introBadge)
        const isCurrent =
          (!!currentPostId && item.id === currentPostId) ||
          (!currentPostId && !!currentSlug && item.slug === currentSlug)

        return (
          <div key={item.id} style={{ display: 'flex', alignItems: 'baseline', gap: 8, lineHeight: 1.7 }}>
            <span
              style={{
                flexShrink: 0,
                minWidth: 42,
                color: 'var(--color-muted-foreground)',
                fontSize: 12,
                fontWeight: 700,
                padding: '3px 8px',
                borderRadius: 999,
                border: '1px solid var(--color-border, rgba(0,0,0,0.12))',
                textAlign: 'center',
              }}
            >
              {positionLabel}
            </span>

            {isCurrent ? (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, cursor: 'default' }}>
                <span style={{ fontWeight: 600 }}>{item.title}</span>
                <span
                  style={{
                    fontSize: 11,
                    padding: '1px 6px',
                    borderRadius: 4,
                    border: '1px solid currentColor',
                    color: 'var(--color-muted-foreground)',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {currentPostBadge}
                </span>
              </span>
            ) : (
              <a
                href={`/post/${item.slug}`}
                style={{ textDecoration: 'none' }}
                className="text-blue-700 dark:text-blue-400 hover:underline"
              >
                {item.title}
              </a>
            )}
          </div>
        )
      })}
    </div>
  )
}

function renderNode(
  node: RichNode,
  key: string,
  currentPostId?: string,
  currentSlug?: string,
  seriesContext?: SeriesContext,
): React.ReactNode {
  if (!node || !node.type) return null

  if (node.type === 'text') return renderText(node, key)
  if (node.type === 'hardBreak') return <br key={key} />

  const children = (node.content ?? []).map((child, index) =>
    renderNode(child, `${key}-${index}`, currentPostId, currentSlug, seriesContext),
  )

  switch (node.type) {
    case 'doc':
      return <div key={key}>{children}</div>

    case 'paragraph': {
      const hasContent = Array.isArray(node.content) && node.content.length > 0
      return <p key={key}>{hasContent ? children : <br />}</p>
    }

    case 'heading': {
      const level = node.attrs?.level ?? 2
      if (level === 3) return <h3 key={key}>{children}</h3>
      if (level >= 4) return <h4 key={key}>{children}</h4>
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
      const rawSrc = typeof attrs?.src === 'string' ? attrs.src.trim() : null
      const src = publicSrc ?? proxySrc ?? rawSrc
      if (!src) return null
      if (!proxySrc && !isPostImageProxySrc(src) && !/^https?:\/\//i.test(src)) return null

      const alt = typeof attrs?.alt === 'string' ? attrs.alt : ''
      const rawWidth = attrs?.widthPercent
      const widthPercent = rawWidth === 33 || rawWidth === 66 || rawWidth === 100 ? rawWidth : 100

      return (
        <div key={key} className="my-4" style={{ width: `${widthPercent}%` }}>
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

    case 'youtube':
    case 'youtubeVideo': {
      const embed = toYouTubeNoCookieEmbed((node.attrs as Attrs | undefined)?.src)
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

      const hasIntro = !!rawAttrs?.hasIntro
      const seriesConfig = getPostSeriesConfig(
        seriesContext?.currentChannelName,
        seriesContext?.currentSubcategoryName,
      )

      return (
        <div
          key={key}
          dir="rtl"
          className="mt-8 pt-5 border-t border-neutral-200 dark:border-border"
        >
          <h3 style={{ fontSize: 18, fontWeight: 700, marginBottom: 12 }}>
            {seriesConfig?.publicHeading ?? 'חלקים בסדרה'}
          </h3>

          <SerialChaptersList
            postIds={postIds}
            hasIntro={hasIntro}
            currentPostId={currentPostId}
            currentSlug={currentSlug}
            currentChannelId={seriesContext?.currentChannelId}
            currentSubcategoryTagId={seriesContext?.currentSubcategoryTagId}
            currentPostBadge={seriesConfig?.currentPostBadge ?? 'אתה פה'}
            loadingLabel={seriesConfig?.loadingLabel ?? 'טוען חלקים...'}
            introBadge={seriesConfig?.introBadge ?? 'פתיח'}
          />
        </div>
      )
    }

    default:
      return <span key={key}>{children}</span>
  }
}

export default function RichText({
  content,
  currentPostId,
  currentSlug,
  currentChannelName,
  currentChannelId,
  currentSubcategoryName,
  currentSubcategoryTagId,
}: Props) {
  const normalized: RichNode =
    content && content.type === 'doc'
      ? content
      : { type: 'doc', content: [{ type: 'paragraph', content: [] }] }

  return (
    <div
      dir="rtl"
      className={`richtext-viewer w-full max-w-[72ch] ml-auto whitespace-pre-wrap ${RICHTEXT_TYPOGRAPHY}`}
    >
      {renderNode(normalized, 'root', currentPostId, currentSlug, {
        currentChannelName,
        currentChannelId,
        currentSubcategoryName,
        currentSubcategoryTagId,
      })}
    </div>
  )
}

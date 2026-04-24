'use client'

import Image from 'next/image'
import { useState } from 'react'
import type { CSSProperties, ReactNode } from 'react'
import Link from '@/components/ContentLink'
import Badge from '@/components/Badge'
import { coverProxySrc } from '@/lib/coverUrl'
import { formatDateTimeHe, formatRelativeHe, isNewPost } from '@/lib/time'
import GifCoverImage from '@/components/GifCoverImage'

export type PostCardMedals = { gold: number; silver: number; bronze: number }

export type PostCardPost = {
  /** Optional: used for owner actions (edit/delete) in some views */
  id?: string
  slug: string
  title: string
  excerpt?: string | null
  created_at: string
  cover_image_url?: string | null
  channel_name?: string | null
  author_name?: string | null
  author_username?: string | null
  tags?: { name_he: string; slug: string }[]
  medals?: Partial<PostCardMedals> | null
}

type Variant = 'list-row' | 'list-featured' | 'tile'

/**
 * NOTE:
 * We intentionally avoid wrapping the whole card with <Link>.
 * This prevents nested-link issues (e.g. author link / category link inside a post link)
 * and makes inner links reliably clickable everywhere.
 */
function channelHrefByName(name?: string | null) {
  if (!name) return null
  if (name === 'פריקה') return '/c/release'
  if (name === 'סיפורים') return '/c/stories'
  if (name === 'מגזין') return '/c/magazine'
  return null
}


/**
 * IMPORTANT:
 * We hard-enforce image sizing via width/height + inline styles,
 * so the UI never breaks even if Tailwind utilities/plugins (e.g. aspect-ratio)
 * are missing or overridden.
 */
function CoverImage({
  src,
  alt,
  width,
  height,
  className,
  cardHovered,
}: {
  src: string
  alt: string
  width: number
  height: number
  className?: string
  cardHovered?: boolean
}) {
  const isGif = src.toLowerCase().includes('.gif')
  const quality = width >= 680 ? 86 : 82

  if (isGif) {
    return (
      <div style={{ width: '100%', height: '100%', display: 'block' }} className={className ?? ''}>
        <GifCoverImage src={src} alt={alt} cardHovered={cardHovered ?? false} />
      </div>
    )
  }

  return (
    <Image
      src={src}
      alt={alt}
      width={width}
      height={height}
      loading="lazy"
      sizes={`${width}px`}
      quality={quality}
      style={{
        width: '100%',
        height: '100%',
        maxWidth: '100%',
        maxHeight: '100%',
        objectFit: 'cover',
        display: 'block',
      }}
      className={`!w-full !h-full object-cover block ${className ?? ''}`}
    />
  )
}

function CoverFrame({
  children,
  className,
  style,
}: {
  children: ReactNode
  className?: string
  style?: CSSProperties
}) {
  return (
    <div className={'overflow-hidden rounded border bg-card ' + (className ?? '')} style={style}>
      {children}
    </div>
  )
}

export default function PostCard({
  post,
  variant = 'list-row',
}: {
  post: PostCardPost
  variant?: Variant
}) {
  const coverSrc = coverProxySrc(post.cover_image_url) ?? null
  const hasCover = Boolean(coverSrc)
  const medals = post.medals ?? null
  const showMedals = Boolean(
    medals && ((medals.gold ?? 0) > 0 || (medals.silver ?? 0) > 0 || (medals.bronze ?? 0) > 0)
  )

  const chHref = channelHrefByName(post.channel_name)
  const [hovered, setHovered] = useState(false)

  const hoverHandlers = {
    onMouseEnter: () => setHovered(true),
    onMouseLeave: () => setHovered(false),
  }

  if (variant === 'list-featured') {
    // Featured: title/excerpt/author above a constrained image.
    return (
      <article
        className="block rounded-2xl border bg-gradient-to-b from-card to-muted/40 dark:to-muted/10 p-4 shadow-sm transition hover:shadow-md"
        {...hoverHandlers}
      >
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          {post.channel_name ? (
            chHref ? (
              <Link href={chHref} className="hover:underline">
                <Badge>{post.channel_name}</Badge>
              </Link>
            ) : (
              <Badge>{post.channel_name}</Badge>
            )
          ) : null}
          <span title={formatDateTimeHe(post.created_at)}>{formatRelativeHe(post.created_at)}</span>
          {isNewPost(post.created_at) ? <Badge>חדש</Badge> : null}
        </div>

        <div className="mt-2 text-2xl font-extrabold leading-tight break-words">
          <Link href={`/post/${post.slug}`} className="hover:underline">
            {post.title}
          </Link>
        </div>

        {post.author_name ? (
          <div className="mt-1 text-sm text-muted-foreground">
            מאת:{' '}
            {post.author_username ? (
              <Link href={`/u/${post.author_username}`} className="text-blue-700 hover:underline dark:text-blue-400">
                {post.author_name}
              </Link>
            ) : (
              <span>{post.author_name}</span>
            )}
          </div>
        ) : null}

        {post.excerpt ? (
          <div className="mt-2 text-sm leading-6 text-foreground/80 line-clamp-3">{post.excerpt}</div>
        ) : null}
        {hasCover ? (
          <div className="mt-4">
            <div className="mx-auto w-full max-w-[680px]">
              <Link href={`/post/${post.slug}`} className="block">
                <CoverFrame className="rounded-xl" style={{ width: '100%' }}>
                  <div style={{ width: '100%', height: 260 }}>
                    <CoverImage src={coverSrc!} alt="" width={1280} height={720} cardHovered={hovered} />
                  </div>
                </CoverFrame>
              </Link>
            </div>
          </div>
        ) : null}


        <Link href={`/post/${post.slug}`} className="mt-3 inline-block text-xs text-blue-700 dark:text-blue-400 underline">
          קרא עוד
        </Link>
      </article>
    )
  }

  if (variant === 'tile') {
    // Small category tiles
    return (
      <article
        className="group block overflow-hidden rounded border bg-gradient-to-b from-card to-muted/40 dark:to-muted/10 shadow-sm transition hover:shadow-md"
        {...hoverHandlers}
      >
        <div className="relative">
          {hasCover ? (
            <Link href={`/post/${post.slug}`} className="block">
              <CoverFrame className="rounded-none border-0" style={{ borderRadius: 0, width: '100%', height: 160 }}>
                <CoverImage src={coverSrc!} alt="" width={320} height={200} cardHovered={hovered} />
              </CoverFrame>
            </Link>
          ) : (
            <Link href={`/post/${post.slug}`} className="block">
              <div className="h-40 w-full bg-muted" />
            </Link>
          )}
        </div>
        <div className="p-3">
          <div className="text-sm font-bold leading-snug line-clamp-2">
            <Link href={`/post/${post.slug}`} className="hover:underline">
              {post.title}
            </Link>
          </div>
          <Link href={`/post/${post.slug}`} className="mt-2 inline-block text-[11px] text-muted-foreground">
            קרא עוד
          </Link>
        </div>
      </article>
    )
  }

  // Default: list row
  return (
    <article
      className="block rounded border bg-gradient-to-b from-card to-muted/40 dark:to-muted/10 p-3 shadow-sm transition hover:shadow-md"
      {...hoverHandlers}
    >
      <div className="flex flex-row-reverse items-start gap-3">
        {/* IMAGE on the right (fixed size, never overflows) */}
        <div className="shrink-0">
          {hasCover ? (
            <Link href={`/post/${post.slug}`} className="block">
              <CoverFrame className="rounded" style={{ width: 140, height: 90 }}>
                <CoverImage src={coverSrc!} alt="" width={140} height={90} cardHovered={hovered} />
              </CoverFrame>
            </Link>
          ) : (
            <Link href={`/post/${post.slug}`} className="block">
              <div className="h-[90px] w-[140px] rounded border bg-muted" />
            </Link>
          )}
        </div>

        {/* TEXT */}
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1 text-sm font-bold leading-snug break-words line-clamp-2 text-right">
              <Link href={`/post/${post.slug}`} className="hover:underline">
                {post.title}
              </Link>
            </div>

            {showMedals ? (
              <div dir="ltr" className="shrink-0 flex items-center gap-2 text-xs text-muted-foreground">
                <span>{medals?.gold ?? 0} 🥇</span>
                <span>{medals?.silver ?? 0} 🥈</span>
                <span>{medals?.bronze ?? 0} 🥉</span>
              </div>
            ) : null}
          </div>

          <div className="mt-1 text-xs text-muted-foreground">
            מאת:{' '}
            {post.author_username ? (
              <Link href={`/u/${post.author_username}`} className="text-blue-700 dark:text-blue-400 hover:underline">
                {post.author_name ?? 'אנונימי'}
              </Link>
            ) : (
              <span>{post.author_name ?? 'אנונימי'}</span>
            )}
            <span className="mx-2">•</span>
            <span title={formatDateTimeHe(post.created_at)}>{formatRelativeHe(post.created_at)}</span>
          </div>

          {post.excerpt ? (
            <div className="mt-2 text-sm leading-6 text-foreground/80 line-clamp-2">{post.excerpt}</div>
          ) : null}

          <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
            {post.channel_name ? (
              chHref ? (
                <Link href={chHref} className="text-muted-foreground hover:underline">
                  {post.channel_name}
                </Link>
              ) : (
                <span className="text-muted-foreground">{post.channel_name}</span>
              )
            ) : null}

          </div>
          <Link href={`/post/${post.slug}`} className="mt-2 inline-block text-xs text-blue-700 dark:text-blue-400 underline">
            קרא עוד
          </Link>
        </div>
      </div>
    </article>
  )
}

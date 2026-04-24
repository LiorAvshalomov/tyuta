// src/app/(home)/page.tsx
export const revalidate = 60

import type { Metadata } from 'next'
import Link from '@/components/ContentLink'

export const metadata: Metadata = {
  title: 'Tyuta - המקום לכל הגרסאות שלך',
  description: 'Tyuta (טיוטה): קהילת הכותבים הישראלית. פריקה, סיפורים, כתבות — מהמחשבה הראשונה ועד ליצירה הסופית.',
  alternates: { canonical: 'https://tyuta.net' },
  openGraph: {
    type: 'website',
    url: 'https://tyuta.net',
    title: 'Tyuta - המקום לכל הגרסאות שלך',
    description: 'Tyuta (טיוטה): קהילת הכותבים הישראלית. פריקה, סיפורים, כתבות — מהמחשבה הראשונה ועד ליצירה הסופית.',
    siteName: 'Tyuta',
    locale: 'he_IL',
    images: [{ url: '/web-app-manifest-512x512.png', width: 512, height: 512, alt: 'Tyuta' }],
  },
  twitter: {
    card: 'summary',
    title: 'Tyuta - המקום לכל הגרסאות שלך',
    description: 'Tyuta (טיוטה): קהילת הכותבים הישראלית. פריקה, סיפורים, כתבות — מהמחשבה הראשונה ועד ליצירה הסופית.',
    images: ['/web-app-manifest-512x512.png'],
  },
}
import Image from 'next/image'
import { RelativeTime } from '@/components/RelativeTime'
import HomeWriteCTA from '@/components/HomeWriteCTA'
import StickySidebar from '@/components/StickySidebar'
import Avatar from '@/components/Avatar'
import AuthorHover from '@/components/AuthorHover'
import FeedAutoRefresh from '@/components/FeedAutoRefresh'
import FeedIntentLink from '@/components/FeedIntentLink'
import { coverProxySrc, isProxySrc, isGifUrl } from '@/lib/coverUrl'
import { FeaturedImageGlow } from '@/components/FeaturedImageGlow'
import { FeaturedColorSync } from '@/components/FeaturedColorSync'
import GifCoverCard from '@/components/GifCoverCard'
import { getFeedVersionForPath, type FeedPath } from '@/lib/freshness/serverVersions'
import { CHANNEL_PAGE_CONFIGS } from '@/lib/home/channelPageConfig'
import { createPublicServerClient } from '@/lib/supabase/createPublicServerClient'
import ClampedText from '@/components/ClampedText'
import CoverImgResilient from '@/components/CoverImgResilient'

const MEDAL_EMOJIS = {
  gold: '🥇',
  silver: '🥈',
  bronze: '🥉',
} as const

const SEPARATOR = '•'
const READ_POST_SR_LABEL = 'לקריאה'
const VIEW_ALL_LABEL = 'הכל ←'
const RECENT_POSTS_LABEL = 'פוסטים אחרונים'
const NO_RECENT_POSTS_LABEL = 'אין עדיין פוסטים אחרונים.'
const HOME_ERROR_TITLE = 'שגיאת מערכת'
const HOME_ERROR_DESCRIPTION = 'לא ניתן לטעון את דף הבית כרגע.'
const HOME_EMPTY_TITLE = 'אין עדיין פוסטים להצגה'
const HOME_EMPTY_DESCRIPTION = 'ברגע שיפורסמו פוסטים, הם יופיעו כאן.'
const WRITERS_OF_WEEK_LABEL = 'כותבי השבוע'
const WRITERS_OF_MONTH_LABEL = 'כותבי החודש'
const NO_WEEK_ACTIVITY_LABEL = 'אין עדיין פעילות לשבוע הזה.'
const NO_MONTH_ACTIVITY_LABEL = 'אין עדיין פעילות לחודש הזה.'
const WRITER_REACTIONS_LABEL = '❤️'

function postAriaLabel(title: string) {
  return `לקריאת ${title}`
}


type PostRow = {
  id: string
  title: string
  slug: string
  created_at: string
  published_at: string | null
  excerpt: string | null
  cover_image_url: string | null
  subcategory_tag_id: number | null

  channel: { slug: string; name_he: string }[] | null
  author: { username: string; display_name: string | null; avatar_url: string | null }[] | null
  post_tags:
  | {
    tag:
    | {
      name_he: string
      slug: string
    }[]
    | null
  }[]
  | null
}

type TagRow = {
  id: number
  name_he: string
  slug: string
}

type CardPost = {
  id: string
  slug: string
  title: string
  excerpt: string | null
  created_at: string
  cover_image_url: string | null
  subcategory_tag_id: number | null
  channel_slug: string | null
  channel_name: string | null
  author_username: string | null
  author_name: string
  author_avatar_url: string | null
  subcategory: { name_he: string; slug: string } | null
  tags: { name_he: string; slug: string }[]
  weekReactionsTotal: number
  weekCommentsTotal: number
  weekReactionsByKey: Record<string, number>
  allTimeMedals: { gold: number; silver: number; bronze: number }
}

function firstRel<T>(rel: T[] | T | null | undefined): T | null {
  if (!rel) return null
  return Array.isArray(rel) ? (rel[0] ?? null) : rel
}

/** Render a cover image: GifCoverImage for .gif URLs, Next/Image otherwise. */
function CoverImg({
  src,
  alt,
  priority,
  sizes,
  quality,
  className,
}: {
  src: string
  alt: string
  priority?: boolean
  sizes?: string
  quality?: number
  className?: string
}) {
  if (isGifUrl(src)) {
    return (
      <div className={`absolute inset-0 overflow-hidden ${className ?? ''}`}>
        <GifCoverCard src={src} alt={alt} />
      </div>
    )
  }
  // Proxy URLs are already unoptimized (served from /api/media/cover).
  // Direct Supabase CDN URLs go through Next.js optimizer — use resilient
  // wrapper so onError retries with the unoptimized URL if Vercel's
  // on-demand image generation fails (e.g. new DPR variant not yet cached).
  if (isProxySrc(src)) {
    return (
      <Image
        src={src}
        alt={alt}
        fill
        priority={priority}
        sizes={sizes}
        quality={quality}
        className={className}
        unoptimized
      />
    )
  }
  return (
    <CoverImgResilient
      src={src}
      alt={alt}
      priority={priority}
      sizes={sizes}
      quality={quality}
      className={className}
    />
  )
}


function takeUnique(arr: CardPost[], n: number, used: Set<string>) {
  const out: CardPost[] = []
  for (const p of arr) {
    if (used.has(p.id)) continue
    used.add(p.id)
    out.push(p)
    if (out.length >= n) break
  }
  return out
}


function channelBadgeColor(slug: string | null) {
  if (slug === 'stories') return 'tyuta-badge-stories'
  if (slug === 'release') return 'tyuta-badge-release'
  if (slug === 'magazine') return 'tyuta-badge-magazine'
  return 'bg-muted text-foreground'
}

function SectionHeader({ title, href, accent }: { title: string; href: string; accent?: string }) {
  return (
    <div className={`flex items-center justify-between mb-5 ${accent ?? ''}`}>
      <h2 className="tyuta-section-rule text-[1.375rem] font-black tracking-tight leading-tight m-0">
        <FeedIntentLink href={href} className="tyuta-hover">{title}</FeedIntentLink>
      </h2>
      <FeedIntentLink href={href} className="text-xs font-semibold text-muted-foreground tyuta-hover">
        {VIEW_ALL_LABEL}
      </FeedIntentLink>
    </div>
  )
}

function FeaturedPost({ post }: { post: CardPost }) {
  const hasCover = Boolean(post.cover_image_url)
  // When a cover is present, text panel uses adaptive classes driven by --panel-fg-* CSS vars
  // set by FeaturedColorSync (based on sampled image edge color).
  // Without a cover, fall back to standard theme tokens.
  const tc = hasCover
    ? { name: 'tyuta-panel-strong', meta: 'tyuta-panel-soft', tags: 'tyuta-panel-soft', title: 'tyuta-panel-strong', excerpt: 'tyuta-panel-soft' }
    : { name: 'text-foreground', meta: 'text-muted-foreground', tags: 'text-muted-foreground/60', title: 'text-foreground', excerpt: 'text-muted-foreground' }
  return (
    <article className="group relative font-sans">
      {/* ג"€ג"€ Mobile: restored old-style card (image on top, content right, stacked on small screens) ג"€ג"€ */}
      <div className="lg:hidden relative bg-gradient-to-b from-card to-muted/40 dark:to-muted/10 rounded-2xl overflow-hidden tyuta-featured-border tyuta-card-hover">
        <Link href={`/post/${post.slug}`} className="absolute inset-0 z-10 rounded-2xl" aria-label={postAriaLabel(post.title)}><span className="sr-only">{READ_POST_SR_LABEL}</span></Link>
        {/* Medals: top-left of mobile card */}
        {post.allTimeMedals && (post.allTimeMedals.gold > 0 || post.allTimeMedals.silver > 0 || post.allTimeMedals.bronze > 0) ? (
          <div
            dir="ltr"
            className="absolute top-0 left-0 z-30 pointer-events-none flex items-center gap-1 text-[13px] leading-none px-2 py-1.5"
            style={{
              backdropFilter: 'blur(5px)',
              WebkitBackdropFilter: 'blur(5px)',
              background: 'rgba(0,0,0,0.28)',
              borderBottomRightRadius: '10px',
              color: 'white',
            }}
          >
            {post.allTimeMedals.gold > 0 ? <span>{post.allTimeMedals.gold}&nbsp;{MEDAL_EMOJIS.gold}</span> : null}
            {post.allTimeMedals.silver > 0 ? <span>{post.allTimeMedals.silver}&nbsp;{MEDAL_EMOJIS.silver}</span> : null}
            {post.allTimeMedals.bronze > 0 ? <span>{post.allTimeMedals.bronze}&nbsp;{MEDAL_EMOJIS.bronze}</span> : null}
          </div>
        ) : null}
        <div className="relative z-20 pointer-events-none grid grid-cols-1 sm:grid-cols-2 sm:min-h-[320px]">
          {/* Image */}
          <div className="sm:order-2">
            <Link href={`/post/${post.slug}`} className="block h-full pointer-events-auto">
              <div className="relative aspect-[16/10] sm:aspect-auto sm:h-full overflow-hidden bg-muted">
                {post.cover_image_url ? (
                  <CoverImg
                    src={coverProxySrc(post.cover_image_url)!}
                    alt={post.title}
                    priority
                    sizes="(max-width: 640px) 100vw, 50vw"
                    quality={90}
                    className="object-cover will-change-transform transition-transform duration-300 ease-out group-hover:scale-[1.03]"
                  />
                ) : null}
              </div>
            </Link>
          </div>
          {/* Content */}
          <div className="sm:order-1 p-5 sm:p-6 flex flex-col justify-center">
            <div className="flex items-start gap-3 mb-3">
              <div className="flex items-center gap-3 min-w-0">
                {post.author_username ? (
                  <AuthorHover username={post.author_username}>
                    <Link href={`/u/${post.author_username}`} className="tyuta-avatar-ring pointer-events-auto">
                      <Avatar src={post.author_avatar_url} name={post.author_name} size={36} />
                    </Link>
                  </AuthorHover>
                ) : (
                  <span className="tyuta-avatar-ring"><Avatar src={post.author_avatar_url} name={post.author_name} size={36} /></span>
                )}
                <div className="min-w-0">
                  {post.author_username ? (
                    <AuthorHover username={post.author_username}>
                      <Link href={`/u/${post.author_username}`} className="font-bold text-sm tyuta-hover pointer-events-auto">
                        {post.author_name}
                      </Link>
                    </AuthorHover>
                  ) : (
                    <span className="font-bold text-sm">{post.author_name}</span>
                  )}
                  <div className="text-xs text-muted-foreground mt-0.5">
                    <RelativeTime iso={post.created_at} />
                    {post.subcategory ? (
                      <><span className="mx-2">{SEPARATOR}</span><span className="font-semibold">{post.subcategory.name_he}</span></>
                    ) : null}
                    {post.tags.length > 0 ? (
                      <span className={`${!post.subcategory ? 'ms-2' : 'ms-1'} text-muted-foreground/70`}>
                        <span className="mx-2">{SEPARATOR}</span>
                        {post.tags.slice(0, 2).map((t, i) => (
                          <span key={t.slug} className={i > 0 ? 'ms-1' : ''}>#&nbsp;{t.name_he}</span>
                        ))}
                      </span>
                    ) : null}
                  </div>
                </div>
              </div>
            </div>
            {post.channel_name && post.channel_slug ? (
              <div className="mb-2">
                <FeedIntentLink href={`/c/${post.channel_slug}`} className="pointer-events-auto">
                  <span className={`inline-flex px-3 py-1 rounded-full font-semibold text-xs ${channelBadgeColor(post.channel_slug)}`}>
                    {post.channel_name}
                  </span>
                </FeedIntentLink>
              </div>
            ) : null}
            <h1 className="text-[1.625rem] sm:text-[2rem] lg:text-[2.75rem] font-black leading-[1.1] tracking-[-0.025em] mb-4 line-clamp-3">
              <Link href={`/post/${post.slug}`} className="tyuta-hover pointer-events-auto">{post.title}</Link>
            </h1>
            {post.excerpt ? (
              <p className="text-muted-foreground text-sm leading-[1.7] line-clamp-3">{post.excerpt}</p>
            ) : null}
          </div>
        </div>
      </div>

      {/* ג"€ג"€ Desktop: cinematic full-bleed image with right-side readability veil ג"€ג"€ */}
      <div className={`hidden lg:block tyuta-featured-desktop${hasCover ? ' has-cover' : ''}`}>

        {/* Full-card click target ג€" below frame and panel, handles empty-area clicks */}
        <Link href={`/post/${post.slug}`} className="absolute inset-0 z-[1]" aria-label={postAriaLabel(post.title)} tabIndex={-1}><span className="sr-only">{READ_POST_SR_LABEL}</span></Link>

        {/* Image layer ג€" fills the full desktop block, clips at rounded boundary */}
        <div className="tyuta-featured-img-frame z-[2]">
          <Link href={`/post/${post.slug}`} className="absolute inset-0 block" tabIndex={-1} aria-hidden="true">
            {post.cover_image_url ? (
              <CoverImg
                src={coverProxySrc(post.cover_image_url)!}
                alt={post.title}
                priority
                sizes="(max-width: 1280px) 100vw, 784px"
                quality={92}
                className="object-cover [object-position:left_55%]"
              />
            ) : null}
          </Link>
        </div>

        {/* Mouse spotlight glow ג€" sibling to frame, above all frame pseudo-elements */}
        {hasCover ? <FeaturedImageGlow /> : null}

        {/* Color sync ג€" samples image right-edge pixels, sets --img-edge-* CSS vars */}
        {post.cover_image_url ? <FeaturedColorSync src={coverProxySrc(post.cover_image_url)!} /> : null}

        {/* Medals: bottom-left of block, larger overlay with blurred backdrop */}
        {post.allTimeMedals && (post.allTimeMedals.gold > 0 || post.allTimeMedals.silver > 0 || post.allTimeMedals.bronze > 0) ? (
          <div
            dir="ltr"
            className="absolute top-0 left-0 z-[5] pointer-events-none flex items-center gap-1.5 text-[15px] leading-none px-3 py-2"
            style={{
              backdropFilter: 'blur(6px)',
              WebkitBackdropFilter: 'blur(6px)',
              background: 'rgba(0,0,0,0.28)',
              borderBottomRightRadius: '12px',
              color: 'white',
            }}
          >
            {post.allTimeMedals.gold > 0 ? <span>{post.allTimeMedals.gold}&nbsp;{MEDAL_EMOJIS.gold}</span> : null}
            {post.allTimeMedals.silver > 0 ? <span>{post.allTimeMedals.silver}&nbsp;{MEDAL_EMOJIS.silver}</span> : null}
            {post.allTimeMedals.bronze > 0 ? <span>{post.allTimeMedals.bronze}&nbsp;{MEDAL_EMOJIS.bronze}</span> : null}
          </div>
        ) : null}

        {/* Text panel ג€" right 46%, floats over image, text in white */}
        <div className="tyuta-featured-text-panel absolute top-0 bottom-0 right-0 w-[46%] flex flex-col justify-center px-10 py-8 z-[3] pointer-events-none">
          <div className="flex items-start gap-3 mb-4">
            <div className="flex items-center gap-3 min-w-0 flex-1">
              {post.author_username ? (
                <AuthorHover username={post.author_username}>
                  <Link href={`/u/${post.author_username}`} className="tyuta-avatar-ring shrink-0 pointer-events-auto">
                    <Avatar src={post.author_avatar_url} name={post.author_name} size={40} />
                  </Link>
                </AuthorHover>
              ) : (
                <span className="tyuta-avatar-ring shrink-0"><Avatar src={post.author_avatar_url} name={post.author_name} size={40} /></span>
              )}
              <div className="min-w-0">
                {post.author_username ? (
                  <AuthorHover username={post.author_username}>
                    <Link href={`/u/${post.author_username}`} className={`font-bold text-sm ${tc.name} tyuta-hover block truncate tyuta-panel-author pointer-events-auto`}>
                      {post.author_name}
                    </Link>
                  </AuthorHover>
                ) : (
                  <span className={`font-bold text-sm ${tc.name} block truncate tyuta-panel-author`}>{post.author_name}</span>
                )}
                <div className={`text-xs ${tc.meta} mt-0.5`}>
                  <RelativeTime iso={post.created_at} />
                  {post.subcategory ? (
                    <><span className="mx-2">{SEPARATOR}</span><span className="font-semibold">{post.subcategory.name_he}</span></>
                  ) : null}
                  {post.tags.length > 0 ? (
                    <span className={`${!post.subcategory ? 'ms-2' : 'ms-1'} ${tc.tags}`}>
                      <span className="mx-2">{SEPARATOR}</span>
                      {post.tags.slice(0, 2).map((t, i) => (
                        <span key={t.slug} className={i > 0 ? 'ms-1' : ''}>#&nbsp;{t.name_he}</span>
                      ))}
                    </span>
                  ) : null}
                </div>
              </div>
            </div>
          </div>

          {post.channel_name && post.channel_slug ? (
            <div className="mb-3">
              <FeedIntentLink href={`/c/${post.channel_slug}`} className="pointer-events-auto group/channel">
                <span className={`inline-flex px-3 py-1 rounded-full font-semibold text-xs transition-all duration-200 ease-out group-hover/channel:scale-[1.07] group-hover/channel:brightness-105 group-hover/channel:shadow-sm cursor-pointer ${channelBadgeColor(post.channel_slug)}`}>
                  {post.channel_name}
                </span>
              </FeedIntentLink>
            </div>
          ) : null}

          <h1 className={`text-[1.875rem] xl:text-[2.375rem] font-black leading-[1.08] tracking-[-0.03em] mb-4 ${tc.title}`}>
            <Link href={`/post/${post.slug}`} className="tyuta-hover pointer-events-auto">
              {post.title}
            </Link>
          </h1>

          {post.excerpt ? (
            <p className={`${tc.excerpt} text-sm leading-[1.75]`}>
              {post.excerpt}
            </p>
          ) : null}
        </div>
      </div>
    </article>
  )
}

function SimplePostCard({ post }: { post: CardPost }) {
  const showMedals = Boolean(post.allTimeMedals && (post.allTimeMedals.gold > 0 || post.allTimeMedals.silver > 0 || post.allTimeMedals.bronze > 0))
  const coverSrc = post.cover_image_url ? coverProxySrc(post.cover_image_url)! : null
  return (
    <article className="group relative bg-gradient-to-b from-card to-muted/40 dark:to-muted/10 rounded-2xl border border-border overflow-hidden tyuta-card-hover tyuta-gold-border flex flex-col">
      <Link href={`/post/${post.slug}`} className="absolute inset-0 z-10 rounded-2xl" aria-label={postAriaLabel(post.title)}><span className="sr-only">{READ_POST_SR_LABEL}</span></Link>

      <div className="relative z-20 pointer-events-none flex flex-col flex-1">

        {/* IMAGE — top, full width */}
        <Link href={`/post/${post.slug}`} className="block pointer-events-auto relative">
          <div className="relative aspect-[4/3] bg-muted tyuta-img-hover">
            {coverSrc ? (
              <CoverImg
                src={coverSrc}
                alt={post.title}
                sizes="(max-width: 640px) 100vw, (max-width: 1024px) 48vw, 360px"
                quality={90}
                className="object-cover transition-transform duration-300 ease-out group-hover:scale-[1.03]"
              />
            ) : null}
          </div>
          {/* Medals: top-left of image, blurred backdrop */}
          {showMedals ? (
            <div
              dir="ltr"
              className="absolute top-0 left-0 z-10 pointer-events-none flex items-center gap-1 text-[13px] leading-none px-2 py-1.5"
              style={{
                backdropFilter: 'blur(5px)',
                WebkitBackdropFilter: 'blur(5px)',
                background: 'rgba(0,0,0,0.25)',
                borderBottomRightRadius: '10px',
                color: 'white',
              }}
            >
              {post.allTimeMedals.gold > 0 ? <span>{post.allTimeMedals.gold}&nbsp;{MEDAL_EMOJIS.gold}</span> : null}
              {post.allTimeMedals.silver > 0 ? <span>{post.allTimeMedals.silver}&nbsp;{MEDAL_EMOJIS.silver}</span> : null}
              {post.allTimeMedals.bronze > 0 ? <span>{post.allTimeMedals.bronze}&nbsp;{MEDAL_EMOJIS.bronze}</span> : null}
            </div>
          ) : null}
        </Link>

        {/* Text: title + excerpt + author/meta */}
        <div className="p-4 text-right flex-1 flex flex-col">
          <h2 className="text-base sm:text-[17px] font-black leading-[1.3] tracking-[-0.01em] m-0">
            <Link href={`/post/${post.slug}`} className="tyuta-hover pointer-events-auto">
              <ClampedText text={post.title} lines={2} as="span" className="block" />
            </Link>
          </h2>
          <div className="mt-2 min-h-[2.6em] text-xs sm:text-sm text-muted-foreground leading-relaxed">
            {post.excerpt ? (
              <ClampedText text={post.excerpt} lines={2} />
            ) : null}
          </div>

          {/* Author + smart meta: avatar right (first in RTL flex), name+meta left */}
          <div className="mt-auto pt-3 flex items-start gap-2.5 min-w-0">
            {post.author_username ? (
              <AuthorHover username={post.author_username}>
                <Link href={`/u/${post.author_username}`} className="shrink-0 pointer-events-auto">
                  <Avatar src={post.author_avatar_url} name={post.author_name} size={36} />
                </Link>
              </AuthorHover>
            ) : (
              <span className="shrink-0"><Avatar src={post.author_avatar_url} name={post.author_name} size={36} /></span>
            )}
            <div className="min-w-0 flex-1 flex flex-col text-right overflow-hidden pt-0.5">
              {post.author_username ? (
                <AuthorHover username={post.author_username}>
                  <Link href={`/u/${post.author_username}`} className="font-bold text-[13px] leading-snug tyuta-hover pointer-events-auto truncate">
                    {post.author_name}
                  </Link>
                </AuthorHover>
              ) : (
                <span className="font-bold text-[13px] leading-snug truncate">{post.author_name}</span>
              )}
              {/* Smart meta: date • subcategory • tags — flex-wrap + max-h = 1 visible line */}
              <div className="flex flex-wrap overflow-hidden max-h-[1.4em] leading-[1.4] text-[11px] text-muted-foreground mt-0.5">
                <span className="shrink-0 whitespace-nowrap"><RelativeTime iso={post.created_at} /></span>
                {post.subcategory ? (
                  <span className="shrink-0 whitespace-nowrap">
                    <span className="mx-1.5">{SEPARATOR}</span>
                    <span className="font-semibold">{post.subcategory.name_he}</span>
                  </span>
                ) : null}
                {post.tags.map((t, i) => (
                  <span key={t.slug} className="shrink-0 whitespace-nowrap text-muted-foreground/70">
                    {i === 0 ? <span className="mx-1.5">{SEPARATOR}</span> : <span className="ms-1" />}
                    # {t.name_he}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </div>

      </div>
    </article>
  )
}

function ListRowCompact({ post, accentClass }: { post: CardPost; accentClass?: string }) {
  const showMedals = Boolean(post.allTimeMedals && (post.allTimeMedals.gold > 0 || post.allTimeMedals.silver > 0 || post.allTimeMedals.bronze > 0))
  return (
    <article className={`group relative bg-gradient-to-b from-card to-muted/40 dark:to-muted/10 rounded-2xl border border-border overflow-hidden tyuta-card-hover active:scale-[0.99] ${accentClass ?? ''}`}>
      {/* Full-card click target */}
      <Link href={`/post/${post.slug}`} aria-label={postAriaLabel(post.title)} className="absolute inset-0 rounded-2xl z-10">
        <span className="sr-only">{READ_POST_SR_LABEL}</span>
      </Link>

      <div className="relative z-20 pointer-events-none flex flex-row-reverse items-stretch min-h-[118px] sm:min-h-[128px]">

        {/* IMAGE — left side, full card height, rounded by card overflow-hidden */}
        <div className="w-[108px] sm:w-[180px] shrink-0 relative self-stretch">
          <Link href={`/post/${post.slug}`} className="block h-full pointer-events-auto">
            <div className="relative h-full bg-muted tyuta-img-hover">
              {post.cover_image_url ? (
                <CoverImg
                  src={coverProxySrc(post.cover_image_url)!}
                  alt={post.title}
                  sizes="(max-width: 640px) 108px, 180px"
                  quality={85}
                  className="object-cover transition-transform duration-300 ease-out group-hover:scale-[1.03]"
                />
              ) : null}
            </div>
          </Link>
          {/* Medals overlay — top-left of image, blurred backdrop under the badges only */}
          {showMedals ? (
            <div
              dir="ltr"
              className="absolute top-0 left-0 z-10 pointer-events-none flex items-center gap-0.5 text-[12px] leading-none px-1.5 py-1"
              style={{
                backdropFilter: 'blur(5px)',
                WebkitBackdropFilter: 'blur(5px)',
                background: 'rgba(0,0,0,0.22)',
                borderBottomRightRadius: '10px',
                color: 'white',
              }}
            >
              {post.allTimeMedals.gold > 0 ? <span>{post.allTimeMedals.gold}&nbsp;{MEDAL_EMOJIS.gold}</span> : null}
              {post.allTimeMedals.silver > 0 ? <span>{post.allTimeMedals.silver}&nbsp;{MEDAL_EMOJIS.silver}</span> : null}
              {post.allTimeMedals.bronze > 0 ? <span>{post.allTimeMedals.bronze}&nbsp;{MEDAL_EMOJIS.bronze}</span> : null}
            </div>
          ) : null}
        </div>

        {/* TEXT — right side */}
        <div className="min-w-0 flex-1 text-right flex flex-col p-3 sm:p-4">

          {/* Title */}
          <h3 className="text-[15px] sm:text-base font-black leading-[1.35] tracking-[-0.01em]">
            <Link href={`/post/${post.slug}`} className="tyuta-hover pointer-events-auto">
              <ClampedText text={post.title} lines={1} as="span" className="block" />
            </Link>
          </h3>

          {/* Excerpt — 2 lines, word-boundary clamped */}
          <div className="mt-1.5 min-h-[2.6em] text-xs sm:text-sm text-muted-foreground leading-relaxed">
            {post.excerpt ? (
              <ClampedText text={post.excerpt} lines={2} />
            ) : null}
          </div>

          {/* Author + meta — bottom */}
          <div className="mt-auto pt-3.5 flex items-center gap-2 min-w-0">
            {/* Avatar */}
            {post.author_username ? (
              <AuthorHover username={post.author_username}>
                <Link href={`/u/${post.author_username}`} className="shrink-0 pointer-events-auto">
                  <Avatar src={post.author_avatar_url} name={post.author_name} size={30} />
                </Link>
              </AuthorHover>
            ) : (
              <span className="shrink-0">
                <Avatar src={post.author_avatar_url} name={post.author_name} size={30} />
              </span>
            )}

            {/* Name + meta stacked */}
            <div className="min-w-0 flex-1 flex flex-col text-right overflow-hidden">
              {post.author_username ? (
                <AuthorHover username={post.author_username}>
                  <Link href={`/u/${post.author_username}`} className="font-bold text-[13px] leading-snug tyuta-hover pointer-events-auto truncate">
                    {post.author_name}
                  </Link>
                </AuthorHover>
              ) : (
                <span className="font-bold text-[13px] leading-snug truncate">{post.author_name}</span>
              )}
              {/* Meta: date · subcategory · tags
                  flex-wrap + max-h = one visible line.
                  Items that don't fit wrap to line 2 → hidden entirely (no mid-word clip).
                  • separator only between groups, not between tags. */}
              <div className="flex flex-wrap overflow-hidden max-h-[1.4em] leading-[1.4] text-[11px] text-muted-foreground mt-0.5">
                <span className="shrink-0 whitespace-nowrap">
                  <RelativeTime iso={post.created_at} />
                </span>
                {post.subcategory ? (
                  <span className="shrink-0 whitespace-nowrap">
                    <span className="mx-1.5">{SEPARATOR}</span>
                    <span className="font-semibold">{post.subcategory.name_he}</span>
                  </span>
                ) : null}
                {post.tags.map((t, i) => (
                  <span key={t.slug} className="shrink-0 whitespace-nowrap text-muted-foreground/70">
                    {i === 0 ? <span className="mx-1.5">{SEPARATOR}</span> : <span className="ms-1" />}
                    #&nbsp;{t.name_he}
                  </span>
                ))}
              </div>
            </div>
          </div>

        </div>
      </div>
    </article>
  )
}

function RecentMiniRow({ post }: { post: CardPost }) {
  const showMedals = Boolean(post.allTimeMedals && (post.allTimeMedals.gold > 0 || post.allTimeMedals.silver > 0 || post.allTimeMedals.bronze > 0))
  return (
    <div data-gif-card="" className="group relative rounded-2xl border border-border bg-gradient-to-b from-card to-amber-50/20 dark:to-amber-900/5 overflow-hidden tyuta-card-hover active:scale-[0.99]">
      <Link href={`/post/${post.slug}`} aria-label={postAriaLabel(post.title)} className="absolute inset-0 rounded-2xl z-10">
        <span className="sr-only">{READ_POST_SR_LABEL}</span>
      </Link>

      <div className="relative z-20 pointer-events-none flex flex-row-reverse items-stretch min-h-[100px]">

        {/* IMAGE — left side, full card height, card overflow-hidden handles rounding */}
        <div className="w-[96px] shrink-0 relative self-stretch">
          <Link href={`/post/${post.slug}`} className="block h-full pointer-events-auto">
            <div className="relative h-full bg-muted tyuta-img-hover">
              {post.cover_image_url ? (
                <CoverImg
                  src={coverProxySrc(post.cover_image_url)!}
                  alt={post.title}
                  sizes="192px"
                  quality={90}
                  className="object-cover transition-transform duration-300 ease-out group-hover:scale-[1.03]"
                />
              ) : null}
            </div>
          </Link>
          {/* Medals — top-left overlay with blurred backdrop */}
          {showMedals ? (
            <div
              dir="ltr"
              className="absolute top-0 left-0 z-10 pointer-events-none flex items-center gap-0.5 text-[11px] leading-none px-1.5 py-1"
              style={{
                backdropFilter: 'blur(5px)',
                WebkitBackdropFilter: 'blur(5px)',
                background: 'rgba(0,0,0,0.22)',
                borderBottomRightRadius: '10px',
                color: 'white',
              }}
            >
              {post.allTimeMedals.gold > 0 ? <span>{post.allTimeMedals.gold}&nbsp;{MEDAL_EMOJIS.gold}</span> : null}
              {post.allTimeMedals.silver > 0 ? <span>{post.allTimeMedals.silver}&nbsp;{MEDAL_EMOJIS.silver}</span> : null}
              {post.allTimeMedals.bronze > 0 ? <span>{post.allTimeMedals.bronze}&nbsp;{MEDAL_EMOJIS.bronze}</span> : null}
            </div>
          ) : null}
        </div>

        {/* TEXT */}
        <div className="min-w-0 flex-1 flex flex-col p-2.5 sm:p-3 text-right">

          {/* Title */}
          <h4 className="text-sm font-black leading-snug tracking-tight">
            <Link href={`/post/${post.slug}`} className="tyuta-hover pointer-events-auto">
              <ClampedText text={post.title} lines={1} as="span" className="block" />
            </Link>
          </h4>

          {/* Excerpt — min-height reserves 2 lines, word-boundary clamped */}
          <div className="mt-1 min-h-[2.5em] text-xs leading-[1.25] text-muted-foreground">
            {post.excerpt ? (
              <ClampedText text={post.excerpt} lines={2} />
            ) : null}
          </div>

          {/* Author + time — avatar right, name+time stacked left */}
          <div className="mt-auto pt-1.5 flex items-center gap-2 min-w-0">
            {post.author_username ? (
              <AuthorHover username={post.author_username}>
                <Link href={`/u/${post.author_username}`} className="shrink-0 pointer-events-auto">
                  <Avatar src={post.author_avatar_url} name={post.author_name} size={26} />
                </Link>
              </AuthorHover>
            ) : (
              <span className="shrink-0">
                <Avatar src={post.author_avatar_url} name={post.author_name} size={26} />
              </span>
            )}
            <div className="min-w-0 flex-1 flex flex-col text-right overflow-hidden">
              {post.author_username ? (
                <AuthorHover username={post.author_username}>
                  <Link href={`/u/${post.author_username}`} className="font-bold text-[12px] leading-snug tyuta-hover pointer-events-auto truncate">
                    {post.author_name}
                  </Link>
                </AuthorHover>
              ) : (
                <span className="font-bold text-[12px] leading-snug truncate">{post.author_name}</span>
              )}
              <RelativeTime iso={post.created_at} className="text-[11px] text-muted-foreground" />
            </div>
          </div>

        </div>
      </div>
    </div>
  )
}

export type HomePageProps = {
  forcedChannelSlug?: string
  forcedChannelName?: string
  forcedSubtitle?: string
  forcedSubcategories?: { name_he: string }[]
}

export default async function HomePage(props: HomePageProps = {}) {
  const supabase = createPublicServerClient()
  if (!supabase) {
    return (
      <main className="min-h-screen" dir="rtl">
        <div className="mx-auto max-w-6xl px-4 py-8 sm:py-10">
          <div className="rounded-2xl border border-border bg-card/60 p-8 text-center">
            <div className="text-lg font-black text-foreground">{HOME_ERROR_TITLE}</div>
            <div className="mt-2 text-sm text-muted-foreground">{HOME_ERROR_DESCRIPTION}</div>
          </div>
        </div>
      </main>
    )
  }

  type RankedRow = {
    post_id: string
    reactions_total: number
    comments_total: number
    reactions_by_key: Record<string, number>
    gold: number
    silver: number
    bronze: number
    window_start: string
    window_end: string
  }

  const nowIso = new Date().toISOString()

  const isChannelPage = Boolean(props.forcedChannelSlug)
  const channelSlug = props.forcedChannelSlug ?? null
  const channelName = props.forcedChannelName ?? null
  const channelSubtitle = props.forcedSubtitle ?? null
  const forcedSubcategories = props.forcedSubcategories ?? []
  const feedPath: FeedPath = channelSlug === 'release'
    ? '/c/release'
    : channelSlug === 'stories'
      ? '/c/stories'
      : channelSlug === 'magazine'
        ? '/c/magazine'
        : '/'
  const initialFeedVersionPromise = getFeedVersionForPath(feedPath)

  // Resolve channel id + subcategory tag ids in parallel (both independent on channel pages)
  const forcedSubcatIdsByName = new Map<string, number>()
  const forcedSubcategoryPostsById = new Map<number, PostRow[]>()

  let channelId: number | null = null
  if (isChannelPage && channelSlug) {
    if (forcedSubcategories.length > 0) {
      const names = forcedSubcategories.map(s => s.name_he)
      const [channelRes, tagsRes] = await Promise.all([
        supabase.from('channels').select('id').eq('slug', channelSlug).maybeSingle(),
        supabase.from('tags').select('id,name_he').in('name_he', names),
      ])
      channelId = channelRes.data?.id ?? null
      ;(tagsRes.data ?? []).forEach(r => {
        const rr = r as { id: number; name_he: string }
        forcedSubcatIdsByName.set(rr.name_he, rr.id)
      })
    } else {
      channelId = ((await supabase.from('channels').select('id').eq('slug', channelSlug).maybeSingle()).data?.id ?? null)
    }
  }
  
  // Kick off subcategory posts fetch as a real Promise (via .then()) so it fires the HTTP request
  // immediately and runs in parallel with Phase 2 RPCs below.
  // Supabase builders are lazy thenables ג€" calling .then(r=>r) converts to a real Promise that starts now.
  const subcatIdsForFetch = (isChannelPage && channelId !== null && forcedSubcatIdsByName.size > 0)
    ? Array.from(new Set(Array.from(forcedSubcatIdsByName.values())))
    : []
  const subcatPostsPromise = (subcatIdsForFetch.length > 0 && channelId !== null)
    ? supabase
        .from('posts')
        .select(
          `
          id,
          title,
          slug,
          created_at,
          published_at,
          excerpt,
          cover_image_url,
          subcategory_tag_id,
          channel:channels ( slug, name_he ),
          author:profiles!posts_author_id_fkey ( username, display_name, avatar_url ),
          post_tags:post_tags!post_tags_post_id_fkey ( tag:tags!post_tags_tag_id_fkey ( name_he, slug ) )
          `
        )
        .is('deleted_at', null)
        .eq('status', 'published')
        .eq('channel_id', channelId)
        .in('subcategory_tag_id', subcatIdsForFetch)
        .order('published_at', { ascending: false })
        .limit(250)
        .then(r => r)  // convert to real Promise ג†' HTTP request fires immediately
    : null

  const [rankedCombinedRes, rankedStoriesRes, rankedReleaseRes, rankedMagazineRes, rankedAllRes, recentRes] =
    isChannelPage
      ? await (async () => {
        // Monthly ranking for this channel page. The same ranking also powers
        // writers-of-month, so reuse the promise instead of issuing a duplicate RPC.
        const channelMonthlyRankingPromise = supabase.rpc('pendemic_ranked_posts_monthly', {
          ref_ts: nowIso,
          channel_slugs: channelSlug ? [channelSlug] : null,
          limit_count: 500,
        }).then(r => r)

        return Promise.all([
          channelMonthlyRankingPromise,
          // Keep these placeholders for compatibility with existing rendering code (not used on channel pages)
          supabase.rpc('pendemic_ranked_posts_monthly', {
            ref_ts: nowIso,
            channel_slugs: ['stories'],
            limit_count: 0,
          }),
          supabase.rpc('pendemic_ranked_posts_monthly', {
            ref_ts: nowIso,
            channel_slugs: ['release'],
            limit_count: 0,
          }),
          supabase.rpc('pendemic_ranked_posts_monthly', {
            ref_ts: nowIso,
            channel_slugs: ['magazine'],
            limit_count: 0,
          }),
          channelMonthlyRankingPromise,
          // Recent posts for the sidebar (filtered by channel on channel pages)
          (() => {
            let q = supabase
              .from('posts')
              .select(
                `
                  id,
                  title,
                  slug,
                  created_at,
                  published_at,
                  excerpt,
                  cover_image_url,
                  subcategory_tag_id,
                  channel:channels ( slug, name_he ),
                  author:profiles!posts_author_id_fkey ( username, display_name, avatar_url ),
                  post_tags:post_tags!post_tags_post_id_fkey ( tag:tags!post_tags_tag_id_fkey ( name_he, slug ) )
                  `
              )
              .is('deleted_at', null)
              .eq('status', 'published')
              .order('published_at', { ascending: false })
              .limit(60)

            if (channelId != null) q = q.eq('channel_id', channelId)
            return q
          })(),
        ])
      })()
      : await Promise.all([
        supabase.rpc('pendemic_ranked_posts_weekly', {
          ref_ts: nowIso,
          channel_slugs: ['stories', 'release'],
          limit_count: 120,
        }),
        supabase.rpc('pendemic_ranked_posts_weekly', {
          ref_ts: nowIso,
          channel_slugs: ['stories'],
          limit_count: 120,
        }),
        supabase.rpc('pendemic_ranked_posts_weekly', {
          ref_ts: nowIso,
          channel_slugs: ['release'],
          limit_count: 120,
        }),
        supabase.rpc('pendemic_ranked_posts_weekly', {
          ref_ts: nowIso,
          channel_slugs: ['magazine'],
          limit_count: 120,
        }),
        // For writers-of-week scoring we want broader coverage.
        supabase.rpc('pendemic_ranked_posts_weekly', {
          ref_ts: nowIso,
          channel_slugs: null,
          limit_count: 500,
        }),
        // Recent posts for the sidebar (not ranked)
        supabase
          .from('posts')
          .select(
            `
              id,
              title,
              slug,
              created_at,
              published_at,
              excerpt,
              cover_image_url,
              subcategory_tag_id,
              channel:channels ( slug, name_he ),
              author:profiles!posts_author_id_fkey ( username, display_name, avatar_url ),
              post_tags:post_tags!post_tags_post_id_fkey ( tag:tags!post_tags_tag_id_fkey ( name_he, slug ) )
              `
          )
          .is('deleted_at', null)
          .eq('status', 'published')
          .order('published_at', { ascending: false })
          .limit(12),
      ])

  const rpcError =
    rankedCombinedRes.error ||
    rankedStoriesRes.error ||
    rankedReleaseRes.error ||
    rankedMagazineRes.error ||
    rankedAllRes.error
  const initialFeedVersion = await initialFeedVersionPromise

  if (rpcError) {
    return (
      <main className="min-h-screen" dir="rtl">
        <FeedAutoRefresh initialVersion={initialFeedVersion} />
        <div className="mx-auto max-w-6xl px-4 py-10">
          <h1 className="text-xl font-bold">שגיאה בטעינת דירוג השבוע</h1>
          <pre className="mt-4 rounded border bg-white p-4 text-xs">{JSON.stringify(rpcError, null, 2)}</pre>
        </div>
      </main>
    )
  }

  // Resolve subcatPostsPromise now ג€" it started before Phase 2 so it was running in parallel
  if (subcatPostsPromise) {
    const { data: subcatPostRows } = await subcatPostsPromise
    ;(subcatPostRows ?? []).forEach(r => {
      const row = r as PostRow
      const sid = row.subcategory_tag_id
      if (typeof sid !== 'number') return
      const prev = forcedSubcategoryPostsById.get(sid) ?? []
      prev.push(row)
      forcedSubcategoryPostsById.set(sid, prev)
    })
  }

  const rankedCombined = (rankedCombinedRes.data ?? []) as RankedRow[]
  const rankedForPage = rankedCombined
  const rankedStories = (rankedStoriesRes.data ?? []) as RankedRow[]
  const rankedRelease = (rankedReleaseRes.data ?? []) as RankedRow[]
  const rankedMagazine = (rankedMagazineRes.data ?? []) as RankedRow[]
  const rankedAll = (rankedAllRes.data ?? []) as RankedRow[]

  const used = new Set<string>()

  // Pick featured by combined score: reactions are primary (×2), comments add a
  // quality boost (×1). A post with many reactions always wins over one with only comments.
  const featuredRank = rankedCombined.length === 0 ? null :
    [...rankedCombined].sort(
      (a, b) => (b.reactions_total * 2 + b.comments_total) - (a.reactions_total * 2 + a.comments_total)
    )[0] ?? null
  const featuredId = featuredRank?.post_id ?? null
  if (featuredId) used.add(featuredId)

  const pickTopByKey = (key: string): RankedRow | null => {
    let best: RankedRow | null = null
    let bestScore = -1
    for (const r of rankedForPage) {
      if (used.has(r.post_id)) continue
      const v = r.reactions_by_key?.[key] ?? 0
      const score = v * 2 + r.comments_total
      if (score > bestScore) {
        bestScore = score
        best = r
      }
    }
    return best
  }

  const top1Rank = pickTopByKey('funny')
  if (top1Rank) used.add(top1Rank.post_id)
  const top2Rank = pickTopByKey('moving')
  if (top2Rank) used.add(top2Rank.post_id)
  const top3Rank = pickTopByKey('creative')
  if (top3Rank) used.add(top3Rank.post_id)

  const pickRankedList = (rows: RankedRow[], n: number): RankedRow[] => {
    const out: RankedRow[] = []
    for (const r of rows) {
      if (used.has(r.post_id)) continue
      used.add(r.post_id)
      out.push(r)
      if (out.length >= n) break
    }
    return out
  }

  const pickRankedListPeek = (rows: RankedRow[], n: number): RankedRow[] => {
    const out: RankedRow[] = []
    for (const r of rows) {
      if (used.has(r.post_id)) continue
      out.push(r)
      if (out.length >= n) break
    }
    return out
  }

  const storiesRanks = pickRankedList(rankedStories, 5)
  const releaseRanks = pickRankedList(rankedRelease, 5)
  const magazineRanks = pickRankedList(rankedMagazine, 3) // requested: ONLY 3

  const channelRanks = isChannelPage ? pickRankedListPeek(rankedForPage, 60) : []

  // Collect post IDs we need full data for
  const idsNeeded = Array.from(
    new Set(
      [
        featuredId,
        top1Rank?.post_id,
        top2Rank?.post_id,
        top3Rank?.post_id,
        ...storiesRanks.map(r => r.post_id),
        ...releaseRanks.map(r => r.post_id),
        ...magazineRanks.map(r => r.post_id),
        ...(isChannelPage ? rankedForPage.slice(0, 200).map(r => r.post_id) : []),
      ].filter((v): v is string => typeof v === 'string')
    )
  )

  // Batch 3: postsRows, medalsRows, writerPostRows all depend only on Phase 2 ג€" run in parallel
  const rankedAllIds = rankedAll.map(r => r.post_id)
  const [
    { data: postsRows, error: postsErr },
    { data: medalsRows, error: medalsErr },
    { data: writerPostRows },
  ] = await Promise.all([
    supabase
      .from('posts')
      .select(
        `
      id,
      title,
      slug,
      created_at,
      published_at,
      excerpt,
      cover_image_url,
      subcategory_tag_id,
      channel:channels ( slug, name_he ),
      author:profiles!posts_author_id_fkey ( username, display_name, avatar_url ),
      post_tags:post_tags!post_tags_post_id_fkey ( tag:tags!post_tags_tag_id_fkey ( name_he, slug ) )
      `
      )
      .in('id', idsNeeded)
      .is('deleted_at', null)
      .eq('status', 'published'),
    supabase
      .from('post_medals_all_time')
      .select('post_id, gold, silver, bronze')
      .in('post_id', idsNeeded),
    supabase
      .from('posts')
      .select(
        `
      id,
      author:profiles!posts_author_id_fkey ( username, display_name, avatar_url )
      `
      )
      .in('id', rankedAllIds),
  ])

  if (postsErr) {
    return (
      <main className="min-h-screen" dir="rtl">
        <div className="mx-auto max-w-6xl px-4 py-10">
          <h1 className="text-xl font-bold">שגיאה בטעינת פוסטים</h1>
          <pre className="mt-4 rounded border bg-white p-4 text-xs">{JSON.stringify(postsErr, null, 2)}</pre>
        </div>
      </main>
    )
  }

  if (medalsErr) {
    console.error('post_medals_all_time error:', medalsErr)
  }

  const medalsByPostId = new Map<string, { gold: number; silver: number; bronze: number }>()
    ; (medalsRows ?? []).forEach(r => {
      const row = r as { post_id: string; gold: number; silver: number; bronze: number }
      medalsByPostId.set(row.post_id, {
        gold: row.gold ?? 0,
        silver: row.silver ?? 0,
        bronze: row.bronze ?? 0,
      })
    })

  const postsById = new Map<string, PostRow>()
    ; ((postsRows ?? []) as PostRow[]).forEach(p => postsById.set(p.id, p))

  // Subcategory tags map (only for posts we render)
  const subcatIds = Array.from(
    new Set(
      idsNeeded
        .map(id => postsById.get(id)?.subcategory_tag_id)
        .filter((v): v is number => typeof v === 'number')
    )
  )
  const tagsMap = new Map<number, { name_he: string; slug: string }>()
  if (subcatIds.length > 0) {
    const { data: tagRows } = await supabase.from('tags').select('id,name_he,slug').in('id', subcatIds)
      ; (tagRows ?? []).forEach(r => {
        const tr = r as TagRow
        tagsMap.set(tr.id, { name_he: tr.name_he, slug: tr.slug })
      })
  }

  const rankByPostId = new Map<string, RankedRow>()
  for (const r of [...rankedCombined, ...rankedStories, ...rankedRelease, ...rankedMagazine]) {
    rankByPostId.set(r.post_id, r)
  }

  const toCard = (p: PostRow, rank?: RankedRow): CardPost => {
    const channel = firstRel(p.channel)
    const author = firstRel(p.author)

    const tags = (p.post_tags ?? [])
      .flatMap(pt => {
        const t = firstRel(pt.tag)
        return t ? [t] : []
      })
      .map(t => ({ name_he: t.name_he, slug: t.slug }))

    const createdAt = p.published_at ?? p.created_at
    const subcategory = p.subcategory_tag_id != null ? (tagsMap.get(p.subcategory_tag_id) ?? null) : null

    return {
      id: p.id,
      slug: p.slug,
      title: p.title,
      excerpt: p.excerpt,
      created_at: createdAt,
      cover_image_url: p.cover_image_url,
      subcategory_tag_id: p.subcategory_tag_id,
      channel_slug: channel?.slug ?? null,
      channel_name: channel?.name_he ?? null,
      author_username: author?.username ?? null,
      author_name: author?.display_name ?? author?.username ?? 'אנונימי',
      author_avatar_url: author?.avatar_url ?? null,
      subcategory,
      tags,
      weekReactionsTotal: rank?.reactions_total ?? 0,
      weekCommentsTotal: rank?.comments_total ?? 0,
      weekReactionsByKey: rank?.reactions_by_key ?? {},
      allTimeMedals: medalsByPostId.get(p.id) ?? { gold: 0, silver: 0, bronze: 0 },
    }
  }

  const featured = featuredId ? (postsById.get(featuredId) ? toCard(postsById.get(featuredId) as PostRow, featuredRank ?? undefined) : null) : null

  const top1 = top1Rank?.post_id ? (postsById.get(top1Rank.post_id) ? toCard(postsById.get(top1Rank.post_id) as PostRow, top1Rank) : null) : null
  const top2 = top2Rank?.post_id ? (postsById.get(top2Rank.post_id) ? toCard(postsById.get(top2Rank.post_id) as PostRow, top2Rank) : null) : null
  const top3 = top3Rank?.post_id ? (postsById.get(top3Rank.post_id) ? toCard(postsById.get(top3Rank.post_id) as PostRow, top3Rank) : null) : null

  const stories = storiesRanks
    .map(r => {
      const p = postsById.get(r.post_id)
      return p ? toCard(p, r) : null
    })
    .filter((x): x is CardPost => x !== null)

  const release = releaseRanks
    .map(r => {
      const p = postsById.get(r.post_id)
      return p ? toCard(p, r) : null
    })
    .filter((x): x is CardPost => x !== null)

  const magazine = magazineRanks
    .map(r => {
      const p = postsById.get(r.post_id)
      return p ? toCard(p, r) : null
    })
    .filter((x): x is CardPost => x !== null)

  const recentPosts = ((recentRes.data ?? []) as PostRow[]).map(p => toCard(p, rankByPostId.get(p.id)))
  const recentMini = recentPosts.slice(0, 8)

  // Sparse blend: when fewer than 3 posts in a section had actual engagement this
  // period, pad with recent posts so the feed never looks empty after a quiet stretch.
  const SPARSE_THRESHOLD = 3
  const blendWithRecent = (ranked: CardPost[], channelSlug: string, max: number): CardPost[] => {
    const activeCount = ranked.filter(p => p.weekReactionsTotal > 0 || p.weekCommentsTotal > 0).length
    if (activeCount >= SPARSE_THRESHOLD) return ranked
    const usedIds = new Set(ranked.map(p => p.id))
    const fill = recentPosts.filter(
      p => p.channel_slug === channelSlug && !usedIds.has(p.id) && !used.has(p.id)
    )
    return [...ranked, ...fill].slice(0, max)
  }
  const storiesFinal = blendWithRecent(stories, 'stories', 5)
  const releaseFinal = blendWithRecent(release, 'release', 5)
  const magazineFinal = blendWithRecent(magazine, 'magazine', 3)

  const homeHasAnyPosts = Boolean(featured) || Boolean(top1) || Boolean(top2) || Boolean(top3) || storiesFinal.length > 0 || releaseFinal.length > 0 || magazineFinal.length > 0

  // Writers of week: medals first, fallback to total weekly reactions.
  // writerPostRows already fetched in parallel above (Batch 3).
  const authorByPostId = new Map<string, { username: string | null; name: string; avatar_url: string | null }>()
    ; ((writerPostRows ?? []) as { id: string; author: { username: string; display_name: string | null; avatar_url: string | null }[] | null }[]).forEach(r => {
      const a = firstRel(r.author)
      authorByPostId.set(r.id, {
        username: a?.username ?? null,
        name: a?.display_name ?? a?.username ?? 'אנונימי',
        avatar_url: a?.avatar_url ?? null,
      })
    })

  const writerScores = (() => {
    const map = new Map<
      string,
      {
        username: string | null
        name: string
        avatar_url: string | null
        gold: number
        silver: number
        bronze: number
        reactions: number
      }
    >()

    for (const r of rankedAll) {
      const a = authorByPostId.get(r.post_id)
      if (!a) continue
      const key = a.username ?? a.name
      const prev = map.get(key) ?? {
        username: a.username,
        name: a.name,
        avatar_url: a.avatar_url,
        gold: 0,
        silver: 0,
        bronze: 0,
        reactions: 0,
      }
      prev.gold += r.gold ?? 0
      prev.silver += r.silver ?? 0
      prev.bronze += r.bronze ?? 0
      prev.reactions += r.reactions_total ?? 0
      if (!prev.avatar_url && a.avatar_url) prev.avatar_url = a.avatar_url
      map.set(key, prev)
    }

    const arr = Array.from(map.values()).map(v => {
      // Apply base-4 rollover: 4 bronze → 1 silver, 4 silver → 1 gold (mirrors calcMedalsReset4)
      const silverFromBronze = Math.floor(v.bronze / 4)
      const bronze = v.bronze % 4
      const totalSilver = v.silver + silverFromBronze
      const goldFromSilver = Math.floor(totalSilver / 4)
      const silver = totalSilver % 4
      const gold = Math.min(v.gold + goldFromSilver, 6)
      const medalScore = gold * 3 + silver * 2 + bronze
      return { ...v, gold, silver, bronze, medalScore }
    })

    arr.sort((a, b) => {
      if (b.medalScore !== a.medalScore) return b.medalScore - a.medalScore
      if (b.reactions !== a.reactions) return b.reactions - a.reactions
      if (b.gold !== a.gold) return b.gold - a.gold
      if (b.silver !== a.silver) return b.silver - a.silver
      return b.bronze - a.bronze
    })

    return arr.filter(a => a.reactions > 0).slice(0, 5)
  })()

  return (
    <main className="min-h-screen" dir="rtl">
      <FeedAutoRefresh initialVersion={initialFeedVersion} />
      <div className="mx-auto max-w-6xl px-4 py-8 sm:py-10">
        
{isChannelPage ? (
          <div className="space-y-8">
            {/* Channel header */}
            {channelName ? (
              <div className="space-y-1.5">
                <h1 className="text-2xl sm:text-3xl font-black tracking-tight leading-[1.15]">{channelName}</h1>
                {channelSubtitle ? (
                  <p className="text-sm text-muted-foreground leading-relaxed">{channelSubtitle}</p>
                ) : null}
              </div>
            ) : null}

            {/* Top of page: featured + top posts (monthly, filtered) */}
            <div className="space-y-6">
              {featured ? (
                <div>
                  <FeaturedPost post={featured} />
                </div>
              ) : null}

              <div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5 lg:items-end">
                  {top1 ? <SimplePostCard post={top1} /> : null}
                  {top2 ? (
                    <div className="flex flex-col">
                      <div className="hidden lg:block h-4 shrink-0" />
                      <SimplePostCard post={top2} />
                    </div>
                  ) : null}
                  {top3 ? (
                    <div className="flex flex-col">
                      <div className="hidden lg:block h-8 shrink-0" />
                      <SimplePostCard post={top3} />
                    </div>
                  ) : null}
                </div>
              </div>
            </div>

            {/* Below: subcategories (HOT monthly) + sidebar */}
            <div className="grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-8 items-start">
              <div className="space-y-8">
                {forcedSubcategories.map(sc => {
                  const rankedItems = channelRanks
                    .map(r => (postsById.get(r.post_id) ? toCard(postsById.get(r.post_id) as PostRow, r) : null))
                    .filter((x): x is CardPost => x !== null)
                  const forcedId = forcedSubcatIdsByName.get(sc.name_he)
                  const subcategoryRowLimit = channelSlug === 'magazine' ? 3 : 5

                  // Subcategory sections on channel pages should be HOT (monthly ranking), not recent.
                  // We filter ranked items by subcategory_tag_id (stable), and also allow tag-name fallback.
                  const hotItems = rankedItems.filter(p => {
                    return forcedId != null
                      ? (p.subcategory_tag_id === forcedId || p.subcategory?.name_he === sc.name_he || p.tags.some(t => t.name_he === sc.name_he))
                      : (p.subcategory?.name_he === sc.name_he || p.tags.some(t => t.name_he === sc.name_he))
                  })

                  const rows = takeUnique(hotItems, subcategoryRowLimit, used)

                  return (
                    <div key={sc.name_he}>
                      <div className="flex items-center justify-between mb-4">
                        <h2 className="tyuta-section-rule text-lg font-black tracking-tight m-0">{sc.name_he}</h2>
                      </div>
                      <div className="space-y-3">
                        {rows.length > 0 ? rows.map(p => (
                          <ListRowCompact key={p.id} post={p} />
                        )) : (
                          <div className="rounded-2xl border border-border bg-card/60 p-4">
                            <div className="text-sm font-bold text-foreground">עדיין אין פוסטים כאן</div>
                            <div className="mt-1 text-xs text-muted-foreground">רוצה לפתוח את זה עם משהו קצר?</div>
                            <Link
                              href={`/write?channel=${encodeURIComponent(channelSlug ?? '')}&subcategory=${encodeURIComponent(sc.name_he)}&return=${encodeURIComponent(`/c/${channelSlug}`)}`}
                              className="mt-3 inline-flex items-center justify-center rounded-xl bg-sky-500 px-3 py-2 text-xs font-black text-white shadow-sm transition hover:bg-sky-600 active:scale-[0.99] dark:bg-sky-600 dark:hover:bg-sky-700"
                            >
                              כתוב/י ראשון/ה בקטגוריה הזו
                            </Link>
                          </div>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>

              <div className="lg:col-span-1">

              {/* Sidebar (sticky, NO internal scrolling) */}
              <StickySidebar containerId="main-content">
                <div className="space-y-8">
                  {/* Recent posts FIRST */}
                  <div className="bg-card rounded-2xl p-5 shadow-sm border border-border">
                    <Link href={channelSlug ? `/search?sort=recent&channel=${channelSlug}` : "/search?sort=recent"} scroll={true} className="tyuta-panel-title tyuta-hover mb-4 inline-flex">{RECENT_POSTS_LABEL}</Link>
                    <div className="space-y-3">
                      {recentMini.length > 0 ? (
                        recentMini.slice(0, 8).map(p => (
                          <RecentMiniRow key={p.id} post={p} />
                        ))
                      ) : (
                        <div className="text-sm text-muted-foreground">{NO_RECENT_POSTS_LABEL}</div>
                      )}
                    </div>
                  </div>

                  {/* Writers of week */}
                  <div className="bg-card rounded-2xl p-5 shadow-sm border border-border">
                    <div className="tyuta-panel-title mb-4">{isChannelPage ? WRITERS_OF_MONTH_LABEL : WRITERS_OF_WEEK_LABEL}</div>

                    {writerScores.length ? (
                      <div className="space-y-3">
                        {writerScores.map((w, idx) => (
                          <div key={w.username ?? `${w.name}-${idx}`} className="flex items-center justify-between">
                            <div className="flex items-center gap-3 min-w-0 flex-1">
                              <div className="w-7 h-7 shrink-0 rounded-full bg-muted border border-border flex items-center justify-center text-xs font-black text-foreground">
                                {idx + 1}
                              </div>

                              {w.username ? (
                                <AuthorHover username={w.username}>
                                  <Link href={`/u/${w.username}`} className="group/writer inline-flex items-center gap-2 min-w-0">
                                    <Avatar src={w.avatar_url} name={w.name} size={36} />
                                    <span className="text-sm font-bold tyuta-hover min-w-0 break-words leading-tight">
                                      {w.name}
                                    </span>
                                  </Link>
                                </AuthorHover>
                              ) : (
                                <div className="inline-flex items-center gap-2 min-w-0 flex-1">
                                  <Avatar src={w.avatar_url} name={w.name} size={36} />
                                  <span className="text-sm font-bold min-w-0 break-words leading-tight">{w.name}</span>
                                </div>
                              )}
                            </div>

                            <div dir="ltr" className="shrink-0 text-xs text-foreground flex items-center gap-2">
                              {w.gold ? <span>{w.gold} {MEDAL_EMOJIS.gold}</span> : null}
                              {w.silver ? <span>{w.silver} {MEDAL_EMOJIS.silver}</span> : null}
                              {w.bronze ? <span>{w.bronze} {MEDAL_EMOJIS.bronze}</span> : null}
                              {!w.gold && !w.silver && !w.bronze ? <span>{w.reactions} {WRITER_REACTIONS_LABEL}</span> : null}
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="text-sm text-muted-foreground">{NO_MONTH_ACTIVITY_LABEL}</div>
                    )}

                    <div className="mt-5">
                      <HomeWriteCTA />
                    </div>
                  </div>
                </div>
              </StickySidebar>
              </div>
            </div>
          </div>
        ) : (
          homeHasAnyPosts ? (
          <div className="space-y-8">
            {/* Top of page: featured + top posts */}
            <div className="space-y-6">
              {featured ? (
                <div>
                  <FeaturedPost post={featured} />
                </div>
              ) : null}

              <div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5 lg:items-end">
                  {top1 ? <SimplePostCard post={top1} /> : null}
                  {top2 ? (
                    <div className="flex flex-col">
                      <div className="hidden lg:block h-4 shrink-0" />
                      <SimplePostCard post={top2} />
                    </div>
                  ) : null}
                  {top3 ? (
                    <div className="flex flex-col">
                      <div className="hidden lg:block h-8 shrink-0" />
                      <SimplePostCard post={top3} />
                    </div>
                  ) : null}
                </div>
              </div>
            </div>

            {/* Below: categories on the right, sidebar on the left */}
            <div className="grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-8 items-start">
              {/* Categories */}
              <div className="space-y-10">
                <div>
                  <SectionHeader title={CHANNEL_PAGE_CONFIGS.release.homeLabel} href="/c/release" accent="tyuta-section-release" />
                  <div className="space-y-3">
                    {releaseFinal.map(p => (
                      <ListRowCompact key={p.id} post={p} accentClass="tyuta-row-accent-release" />
                    ))}
                  </div>
                </div>

                <div>
                  <SectionHeader title={CHANNEL_PAGE_CONFIGS.stories.homeLabel} href="/c/stories" accent="tyuta-section-stories" />
                  <div className="space-y-3">
                    {storiesFinal.map(p => (
                      <ListRowCompact key={p.id} post={p} accentClass="tyuta-row-accent-stories" />
                    ))}
                  </div>
                </div>

                <div>
                  <SectionHeader title={CHANNEL_PAGE_CONFIGS.magazine.homeLabel} href="/c/magazine" accent="tyuta-section-magazine" />
                  <div className="space-y-3">
                    {magazineFinal.map(p => (
                      <ListRowCompact key={p.id} post={p} accentClass="tyuta-row-accent-magazine" />
                    ))}
                  </div>
                </div>
              </div>

              {/* Sidebar (sticky, NO internal scrolling) */}
              <StickySidebar containerId="main-content">
                <div className="space-y-8">
                  {/* Recent posts FIRST */}
                  <div className="bg-card rounded-2xl p-5 shadow-sm border border-border">
                    <Link href="/search?sort=recent" scroll={true} className="tyuta-panel-title tyuta-hover mb-4 inline-flex">{RECENT_POSTS_LABEL}</Link>
                    <div className="space-y-3">
                      {recentMini.length > 0 ? (
                        recentMini.slice(0, 8).map(p => (
                          <RecentMiniRow key={p.id} post={p} />
                        ))
                      ) : (
                        <div className="text-sm text-muted-foreground">{NO_RECENT_POSTS_LABEL}</div>
                      )}
                    </div>
                  </div>

                  {/* Writers of week */}
                  <div className="bg-card rounded-2xl p-5 shadow-sm border border-border">
                    <div className="tyuta-panel-title mb-4">{WRITERS_OF_WEEK_LABEL}</div>

                    {writerScores.length ? (
                      <div className="space-y-3">
                        {writerScores.map((w, idx) => (
                          <div key={w.username ?? `${w.name}-${idx}`} className="flex items-center justify-between">
                            <div className="flex items-center gap-3 min-w-0 flex-1">
                              <div className="w-7 h-7 shrink-0 rounded-full bg-muted border border-border flex items-center justify-center text-xs font-black text-foreground">
                                {idx + 1}
                              </div>

                              {w.username ? (
                                <AuthorHover username={w.username}>
                                  <Link href={`/u/${w.username}`} className="group/writer inline-flex items-center gap-2 min-w-0">
                                    <Avatar src={w.avatar_url} name={w.name} size={36} />
                                    <span className="text-sm font-bold tyuta-hover min-w-0 break-words leading-tight">
                                      {w.name}
                                    </span>
                                  </Link>
                                </AuthorHover>
                              ) : (
                                <div className="inline-flex items-center gap-2 min-w-0 flex-1">
                                  <Avatar src={w.avatar_url} name={w.name} size={36} />
                                  <span className="text-sm font-bold min-w-0 break-words leading-tight">{w.name}</span>
                                </div>
                              )}
                            </div>

                            <div dir="ltr" className="shrink-0 text-xs text-foreground flex items-center gap-2">
                              {w.gold ? <span>{w.gold} {MEDAL_EMOJIS.gold}</span> : null}
                              {w.silver ? <span>{w.silver} {MEDAL_EMOJIS.silver}</span> : null}
                              {w.bronze ? <span>{w.bronze} {MEDAL_EMOJIS.bronze}</span> : null}
                              {!w.gold && !w.silver && !w.bronze ? <span>{w.reactions} {WRITER_REACTIONS_LABEL}</span> : null}
                            </div>
                          </div>
                        ))}

                      </div>
                    ) : (
                      <div className="text-sm text-muted-foreground">{NO_WEEK_ACTIVITY_LABEL}</div>
                    )}

                    <div className="mt-5">
                      <HomeWriteCTA />
                    </div>
                  </div>
                </div>
              </StickySidebar>
            </div>
          </div>
          ) : (
            <div className="rounded-2xl border border-border bg-card/60 p-8 text-center">
              <div className="text-lg font-black text-foreground">{HOME_EMPTY_TITLE}</div>
              <div className="mt-2 text-sm text-muted-foreground">{HOME_EMPTY_DESCRIPTION}</div>
            </div>
          )
        )}
      </div>
    </main>
  )
}

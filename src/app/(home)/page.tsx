// src/app/page.tsx
export const revalidate = 60

import Link from 'next/link'
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
    return <GifCoverCard src={src} alt={alt} />
  }
  return (
    <Image
      src={src}
      alt={alt}
      fill
      priority={priority}
      sizes={sizes}
      quality={quality}
      className={className}
      unoptimized={isProxySrc(src)}
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

function MedalsInline({
  medals,
  size = 'sm',
}: {
  medals: { gold: number; silver: number; bronze: number } | null
  size?: 'sm' | 'xs'
}) {
  if (!medals) return null
  const gold = medals.gold ?? 0
  const silver = medals.silver ?? 0
  const bronze = medals.bronze ?? 0
  if (gold <= 0 && silver <= 0 && bronze <= 0) return null

  const cls = size === 'xs' ? 'text-[11px] gap-2' : 'text-xs gap-3'

  return (
    <div dir="ltr" className={`flex items-center ${cls} text-muted-foreground`}>
      {gold > 0 ? <span className="inline-flex items-center gap-1">{MEDAL_EMOJIS.gold} {gold}</span> : null}
      {silver > 0 ? <span className="inline-flex items-center gap-1">{MEDAL_EMOJIS.silver} {silver}</span> : null}
      {bronze > 0 ? <span className="inline-flex items-center gap-1">{MEDAL_EMOJIS.bronze} {bronze}</span> : null}
    </div>
  )
}

function MedalsCompact({ medals }: { medals: { gold: number; silver: number; bronze: number } | null }) {
  if (!medals) return null
  const items: { emoji: string; count: number }[] = []
  if (medals.gold > 0) items.push({ emoji: MEDAL_EMOJIS.gold, count: medals.gold })
  if (medals.silver > 0) items.push({ emoji: MEDAL_EMOJIS.silver, count: medals.silver })
  if (medals.bronze > 0) items.push({ emoji: MEDAL_EMOJIS.bronze, count: medals.bronze })
  if (items.length === 0) return null
  const shown = items.slice(0, 2)
  const extra = items.length - shown.length
  return (
    <div dir="ltr" className="mt-1 flex items-center gap-1 text-[11px] text-muted-foreground/70">
      {shown.map(m => (
        <span key={m.emoji} className="shrink-0">{m.emoji} {m.count}</span>
      ))}
      {extra > 0 ? <span className="shrink-0 rounded-full bg-muted px-1.5 text-[10px]">+{extra}</span> : null}
    </div>
  )
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
      <FeedIntentLink href={href} className="tyuta-section-rule tyuta-hover text-[1.375rem] font-black tracking-tight leading-tight">
        {title}
      </FeedIntentLink>
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
      {/* ג”€ג”€ Mobile: restored old-style card (image on top, content right, stacked on small screens) ג”€ג”€ */}
      <div className="lg:hidden relative bg-gradient-to-b from-card to-muted/40 dark:to-muted/10 rounded-2xl overflow-hidden tyuta-featured-border tyuta-card-hover">
        <Link href={`/post/${post.slug}`} className="absolute inset-0 z-10 rounded-2xl" aria-label={postAriaLabel(post.title)}><span className="sr-only">{READ_POST_SR_LABEL}</span></Link>
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
                    quality={85}
                    className="object-cover transition-transform duration-300 ease-out group-hover:scale-[1.03]"
                  />
                ) : null}
              </div>
            </Link>
          </div>
          {/* Content */}
          <div className="sm:order-1 p-5 sm:p-6 flex flex-col justify-center">
            <div className="flex items-start justify-between gap-3 mb-3">
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
              <div className="shrink-0 pt-1"><MedalsInline medals={post.allTimeMedals} /></div>
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

      {/* ג”€ג”€ Desktop: cinematic full-bleed image with right-side readability veil ג”€ג”€ */}
      <div className={`hidden lg:block tyuta-featured-desktop${hasCover ? ' has-cover' : ''}`}>

        {/* Full-card click target ג€” below frame and panel, handles empty-area clicks */}
        <Link href={`/post/${post.slug}`} className="absolute inset-0 z-[1]" aria-label={postAriaLabel(post.title)} tabIndex={-1}><span className="sr-only">{READ_POST_SR_LABEL}</span></Link>

        {/* Image layer ג€” fills the full desktop block, clips at rounded boundary */}
        <div className="tyuta-featured-img-frame z-[2]">
          <Link href={`/post/${post.slug}`} className="absolute inset-0 block" tabIndex={-1} aria-hidden="true">
            {post.cover_image_url ? (
              <CoverImg
                src={coverProxySrc(post.cover_image_url)!}
                alt={post.title}
                priority
                sizes="(max-width: 1280px) 100vw, 900px"
                quality={88}
                className="object-cover object-left"
              />
            ) : null}
          </Link>
        </div>

        {/* Mouse spotlight glow ג€” sibling to frame, above all frame pseudo-elements */}
        {hasCover ? <FeaturedImageGlow /> : null}

        {/* Color sync ג€” samples image right-edge pixels, sets --img-edge-* CSS vars */}
        {post.cover_image_url ? <FeaturedColorSync src={coverProxySrc(post.cover_image_url)!} /> : null}

        {/* Text panel ג€” right 46%, floats over image, text in white */}
        <div className="tyuta-featured-text-panel absolute top-0 bottom-0 right-0 w-[46%] flex flex-col justify-center px-10 py-8 z-[3] pointer-events-none">
          <div className="flex items-start justify-between gap-3 mb-4">
            <div className="flex items-center gap-3 min-w-0">
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
            <div className="shrink-0 pt-1"><MedalsInline medals={post.allTimeMedals} /></div>
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
  return (
    <article className="group relative bg-gradient-to-b from-card to-muted/40 dark:to-muted/10 rounded-xl overflow-hidden tyuta-card-hover tyuta-gold-border flex flex-col">
      <Link href={`/post/${post.slug}`} className="absolute inset-0 z-10 rounded-xl" aria-label={postAriaLabel(post.title)}><span className="sr-only">{READ_POST_SR_LABEL}</span></Link>
      <div className="relative z-20 pointer-events-none flex flex-col flex-1">
      <Link href={`/post/${post.slug}`} className="block pointer-events-auto">
        <div className="relative aspect-[4/3] bg-muted tyuta-img-hover">
          {post.cover_image_url ? (
            <CoverImg src={coverProxySrc(post.cover_image_url)!} alt={post.title} sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 260px" quality={85} className="object-cover transition-transform duration-300 ease-out group-hover:scale-[1.03]" />
          ) : null}
        </div>
      </Link>

      <div className="p-4 text-right flex-1 flex flex-col">
        <div className="flex items-center justify-between text-xs text-muted-foreground mb-2">

          <div className="min-w-0">
            <RelativeTime iso={post.created_at} />
            {post.subcategory ? (
              <>
                <span className="mx-2">{SEPARATOR}</span>
                <span className="font-semibold text-muted-foreground">{post.subcategory.name_he}</span>
              </>
            ) : null}
            {post.subcategory && post.tags.length > 0 ? (
              <span className="mx-2 text-muted-foreground/50">{SEPARATOR}</span>
            ) : null}
            {post.tags.length > 0 ? (
              <>
                {/* desktop ג‰¥md: 2 tags + +N */}
                <span className={`hidden md:inline ${!post.subcategory ? 'mx-2 ' : ''}text-muted-foreground/70`}>
                  {post.tags.slice(0, 2).map((t, i) => (
                    <span key={t.slug} className={i > 0 ? 'ms-1' : ''}>#&nbsp;{t.name_he}</span>
                  ))}
                  {post.tags.length > 2 && <span className="ms-1 text-[10px] text-muted-foreground/50">+{post.tags.length - 2}</span>}
                </span>
                {/* mobile <md: up to 3, no +N */}
                <span className={`md:hidden ${!post.subcategory ? 'mx-2 ' : ''}text-muted-foreground/70`}>
                  {post.tags.slice(0, 3).map((t, i) => (
                    <span key={t.slug} className={i > 0 ? 'ms-1' : ''}>#&nbsp;{t.name_he}</span>
                  ))}
                </span>
              </>
            ) : null}
          </div>
          <div className="shrink-0">
            <MedalsInline medals={post.allTimeMedals} />
          </div>
        </div>

        <h3 className="text-base font-black leading-snug tracking-tight line-clamp-2">
          <Link href={`/post/${post.slug}`} className="tyuta-hover pointer-events-auto">
            {post.title}
          </Link>
        </h3>

        {post.excerpt ? (
          <p className="mt-2 text-xs sm:text-sm text-muted-foreground leading-relaxed line-clamp-2">
            {post.excerpt}
          </p>
        ) : (
          <div className="mt-2 h-[28px]" aria-hidden="true" />
        )}
        <div className="mt-auto pt-3 flex items-center justify-start gap-2 text-xs text-foreground min-w-0">
          {post.author_username ? (
            <AuthorHover username={post.author_username}>
              <Link href={`/u/${post.author_username}`} className="group/author inline-flex items-center gap-2 rounded-lg px-2 py-1 hover:bg-muted/80 dark:hover:bg-muted transition-colors duration-200 cursor-pointer min-w-0 max-w-full overflow-hidden pointer-events-auto">
                <Avatar src={post.author_avatar_url} name={post.author_name} size={24} />
                <span className="font-semibold tyuta-hover truncate min-w-0 flex-1">{post.author_name}</span>
              </Link>
            </AuthorHover>
          ) : (
            <div className="inline-flex items-center gap-2 min-w-0 max-w-full overflow-hidden">
              <Avatar src={post.author_avatar_url} name={post.author_name} size={24} />
              <span className="font-semibold truncate min-w-0 flex-1">{post.author_name}</span>
            </div>
          )}
        </div>

        {/* Small proof these are "hot" this week */}
        {/* <div className="mt-2 text-[11px] text-muted-foreground">
          ׳”׳©׳‘׳•׳¢: <span className="font-semibold">{post.weekReactionsTotal}</span> ג₪ן¸
          <span className="mx-1">ג€¢</span>
          <span className="font-semibold">{post.weekCommentsTotal}</span> ׳×׳’׳•׳‘׳•׳×
        </div> */}
      </div>
      </div>
    </article>
  )
}

function ListRowCompact({ post, accentClass }: { post: CardPost; accentClass?: string }) {
  const showMedals = Boolean(post.allTimeMedals && (post.allTimeMedals.gold > 0 || post.allTimeMedals.silver > 0 || post.allTimeMedals.bronze > 0))
  return (
    <article className={`group relative bg-gradient-to-b from-card to-muted/40 dark:to-muted/10 rounded-2xl border border-border p-4 tyuta-card-hover active:scale-[0.99] ${accentClass ?? ''}`}>
      {/* Full-card click target to the post. Other links (author/profile) stay clickable above it. */}
      <Link
        href={`/post/${post.slug}`}
        aria-label={postAriaLabel(post.title)}
        className="absolute inset-0 rounded-2xl z-10"
      >
        <span className="sr-only">{READ_POST_SR_LABEL}</span>
      </Link>

      {/* Make the layout non-interactive so clicks fall through to the overlay link.
          Specific interactive elements opt-in with pointer-events-auto. */}
      <div className="relative z-20 pointer-events-none">
        {/* In RTL, flex-row-reverse keeps the image on the LEFT (as requested) */}
        <div className="flex flex-row-reverse items-stretch gap-4">
          <div className="w-[136px] sm:w-[168px] shrink-0">
            <Link href={`/post/${post.slug}`} className="block pointer-events-auto">
              {/*
              Constrain cover image height to prevent oversized uploads (e.g. desktop images)
              from expanding the card. The aspect ratio keeps a consistent thumbnail size.
            */}
              <div className="relative aspect-[4/3] rounded-xl overflow-hidden bg-muted ring-1 ring-border/50 tyuta-img-hover">
                {post.cover_image_url ? (
                  <CoverImg
                    src={coverProxySrc(post.cover_image_url)!}
                    alt={post.title}
                    sizes="(max-width: 640px) 136px, 168px"
                    quality={85}
                    className="object-cover transition-transform duration-300 ease-out group-hover:scale-[1.03]"
                  />
                ) : null}
              </div>
            </Link>
          </div>

          <div className="min-w-0 flex-1 text-right flex flex-col">
            <div className="flex items-center justify-between text-xs text-muted-foreground mb-2">
              <div className="text-xs text-muted-foreground">
                <RelativeTime iso={post.created_at} />
                {post.subcategory ? (
                  <>
                    <span className="mx-2">{SEPARATOR}</span>
                    <span className="font-semibold text-muted-foreground">{post.subcategory.name_he}</span>
                  </>
                ) : null}
                {post.subcategory && post.tags.length > 0 && !showMedals ? (
                  <span className="mx-2 text-muted-foreground/50">{SEPARATOR}</span>
                ) : null}
                {post.tags.length > 0 && !showMedals ? (() => {
                  const desktopCap = post.channel_slug === 'magazine' ? 3 : 6
                  const leadCls = post.subcategory ? '' : 'mx-2'
                  const mobileOverflow = post.tags.length - 1
                  const desktopOverflow = Math.max(0, post.tags.length - desktopCap)
                  return (
                    <>
                      {/* mobile: 1 tag + overflow count */}
                      <span className={`md:hidden ${leadCls} text-muted-foreground/70`.trimEnd()}>
                        #&nbsp;{post.tags[0].name_he}
                        {mobileOverflow > 0 && <span className="ms-1 text-[10px] text-muted-foreground/50">+{mobileOverflow}</span>}
                      </span>
                      {/* desktop: up to cap + overflow count */}
                      <span className={`hidden md:inline ${leadCls} text-muted-foreground/70`.trimEnd()}>
                        {post.tags.slice(0, desktopCap).map((t, i) => (
                          <span key={t.slug} className={i > 0 ? 'ms-1' : ''}>#&nbsp;{t.name_he}</span>
                        ))}
                        {desktopOverflow > 0 && <span className="ms-1 text-[10px] text-muted-foreground/50">+{desktopOverflow}</span>}
                      </span>
                    </>
                  )
                })() : null}



              </div>
              <div className="shrink-0">
                <MedalsInline medals={post.allTimeMedals} />
              </div>


            </div>

            <div className="mt-1 text-[15px] sm:text-base font-black leading-[1.35] tracking-[-0.01em] line-clamp-2">
              <Link href={`/post/${post.slug}`} className="tyuta-hover pointer-events-auto">
                {post.title}
              </Link>
            </div>


            {post.excerpt ? (
              <p className="mt-1.5 text-xs sm:text-sm text-muted-foreground leading-relaxed line-clamp-2">
                {post.excerpt}
              </p>
            ) : (
              <div className="mt-1.5 h-[24px]" aria-hidden="true" />
            )}

            {/* Author row UNDER excerpt */}
            <div className="mt-auto pt-1.5 flex items-center justify-start gap-2 text-xs text-foreground min-w-0">
              {post.author_username ? (
                <AuthorHover username={post.author_username}>
                  <Link
                    href={`/u/${post.author_username}`}
                    className="group/author inline-flex items-center gap-2 rounded-lg px-2 py-1 hover:bg-neutral-200/70 dark:hover:bg-muted transition-colors duration-200 pointer-events-auto cursor-pointer min-w-0 max-w-full overflow-hidden"
                  >
                    <Avatar src={post.author_avatar_url} name={post.author_name} size={24} />
                    <span className="font-semibold tyuta-hover truncate min-w-0 flex-1">{post.author_name}</span>
                  </Link>
                </AuthorHover>
              ) : (
                <div className="inline-flex items-center gap-2 min-w-0 max-w-full overflow-hidden">
                  <Avatar src={post.author_avatar_url} name={post.author_name} size={24} />
                  <span className="font-semibold truncate min-w-0 flex-1">{post.author_name}</span>
                </div>
              )}
            </div>

          </div>
        </div>
      </div>
    </article>
  )
}

function RecentMiniRow({ post }: { post: CardPost }) {
  return (
    <div data-gif-card="" className="group relative rounded-2xl border border-border bg-gradient-to-b from-card to-amber-50/20 dark:to-amber-900/5 p-3 tyuta-card-hover active:scale-[0.99]">
      {/* Full-card click target to the post. Other links (author/profile) stay clickable above it. */}
      <Link
        href={`/post/${post.slug}`}
        aria-label={postAriaLabel(post.title)}
        className="absolute inset-0 rounded-2xl z-10"
      >
        <span className="sr-only">{READ_POST_SR_LABEL}</span>
      </Link>

      <div className="relative z-20 pointer-events-none">
        {/* In RTL, flex-row-reverse keeps the image on the LEFT (as requested) */}
        <div className="flex flex-row-reverse items-stretch gap-3">
          <div className="w-[94px] shrink-0 relative">
            <Link href={`/post/${post.slug}`} className="block pointer-events-auto">
              <div className="relative aspect-square rounded-xl overflow-hidden bg-muted ring-1 ring-border/50 tyuta-img-hover">
                {post.cover_image_url ? (
                  <CoverImg
                    src={coverProxySrc(post.cover_image_url)!}
                    alt={post.title}
                    sizes="(max-width: 640px) 120px, 140px"
                    quality={90}
                    className="object-cover transition-transform duration-300 ease-out group-hover:scale-[1.03]"
                  />
                ) : null}
              </div>
            </Link>
            {post.allTimeMedals && (post.allTimeMedals.gold > 0 || post.allTimeMedals.silver > 0 || post.allTimeMedals.bronze > 0) ? (
              <div dir="ltr" className="absolute top-1 left-1 z-10 pointer-events-none flex items-center gap-0.5 text-[11px] leading-none" style={{ filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.5))' }}>
                {post.allTimeMedals.gold > 0 ? <span>{MEDAL_EMOJIS.gold} {post.allTimeMedals.gold}</span> : null}
                {post.allTimeMedals.silver > 0 ? <span>{MEDAL_EMOJIS.silver} {post.allTimeMedals.silver}</span> : null}
                {post.allTimeMedals.bronze > 0 ? <span>{MEDAL_EMOJIS.bronze} {post.allTimeMedals.bronze}</span> : null}
              </div>
            ) : null}
          </div>

          <div className="min-w-0 flex-1 text-right flex flex-col justify-between">
            {/* Top: title */}
            <div>
              <div className="text-sm font-black leading-snug tracking-tight">
                <Link href={`/post/${post.slug}`} className="tyuta-hover line-clamp-2 pointer-events-auto">
                  {post.title}
                </Link>
              </div>
            </div>

            {/* Middle: excerpt ג€” sits between title and author via justify-between */}
            {post.excerpt ? (
              <p className="text-xs text-muted-foreground leading-snug line-clamp-1 py-0.5">
                {post.excerpt}
              </p>
            ) : <div />}

            {/* Bottom: author + time */}
            <div className="text-[12px] text-muted-foreground flex items-center gap-2 flex-nowrap min-w-0">
              {/* Author ג€” [&>span]:max-w-full constrains AuthorHover's inline-flex span so truncate fires via CSS */}
              <div className="min-w-0 flex-1 overflow-hidden [&>span]:max-w-full">
                {post.author_username ? (
                  <AuthorHover username={post.author_username}>
                    <Link
                      href={`/u/${post.author_username}`}
                      className="inline-flex items-center gap-1.5 rounded-lg px-1.5 py-0.5 hover:bg-neutral-200/70 dark:hover:bg-muted transition-colors duration-200 pointer-events-auto overflow-hidden cursor-pointer"
                    >
                      <Avatar src={post.author_avatar_url} name={post.author_name} size={22} />
                      <span className="font-semibold tyuta-hover truncate flex-1 min-w-0">{post.author_name}</span>
                    </Link>
                  </AuthorHover>
                ) : (
                  <div className="inline-flex items-center gap-1.5 max-w-full overflow-hidden">
                    <Avatar src={post.author_avatar_url} name={post.author_name} size={22} />
                    <span className="font-semibold truncate flex-1 min-w-0">{post.author_name}</span>
                  </div>
                )}
              </div>

              {/* Time ג€” always fully visible, never shrinks */}
              <RelativeTime iso={post.created_at} className="shrink-0 whitespace-nowrap" />
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
  const initialFeedVersion = await getFeedVersionForPath(feedPath)

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
  // Supabase builders are lazy thenables ג€” calling .then(r=>r) converts to a real Promise that starts now.
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
        .then(r => r)  // convert to real Promise ג†’ HTTP request fires immediately
    : null

  const [rankedCombinedRes, rankedStoriesRes, rankedReleaseRes, rankedMagazineRes, rankedAllRes, recentRes] =
    isChannelPage
      ? await Promise.all([
        // Monthly ranking for this channel page
        supabase.rpc('pendemic_ranked_posts_monthly', {
          ref_ts: nowIso,
          channel_slugs: channelSlug ? [channelSlug] : null,
          limit_count: 500,
        }),
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
        // For writers-of-month scoring: broad coverage but still filtered to this channel
        supabase.rpc('pendemic_ranked_posts_monthly', {
          ref_ts: nowIso,
          channel_slugs: channelSlug ? [channelSlug] : null,
          limit_count: 500,
        }),
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

  // Resolve subcatPostsPromise now ג€” it started before Phase 2 so it was running in parallel
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

  const featuredRank = rankedCombined[0] ?? null
  const featuredId = featuredRank?.post_id ?? null
  if (featuredId) used.add(featuredId)

  const pickTopByKey = (key: string): RankedRow | null => {
    let best: RankedRow | null = null
    let bestCount = -1
    for (const r of rankedForPage) {
      if (used.has(r.post_id)) continue
      const v = r.reactions_by_key?.[key] ?? 0
      if (v > bestCount) {
        bestCount = v
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

  // Batch 3: postsRows, medalsRows, writerPostRows all depend only on Phase 2 ג€” run in parallel
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

  // Home fallback: if weekly ranking returns no posts (e.g., zero reactions this week), fill category sections from recent posts.
  // Filter out IDs already shown in Featured / Leading posts to avoid duplicates.
  const storiesFinal = stories.length > 0 ? stories : recentPosts.filter(p => p.channel_slug === 'stories' && !used.has(p.id)).slice(0, 5)
  const releaseFinal = release.length > 0 ? release : recentPosts.filter(p => p.channel_slug === 'release' && !used.has(p.id)).slice(0, 5)
  const magazineFinal = magazine.length > 0 ? magazine : recentPosts.filter(p => p.channel_slug === 'magazine' && !used.has(p.id)).slice(0, 5)

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
      const medalScore = v.gold * 3 + v.silver * 2 + v.bronze
      return { ...v, medalScore }
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

                  // Subcategory sections on channel pages should be HOT (monthly ranking), not recent.
                  // We filter ranked items by subcategory_tag_id (stable), and also allow tag-name fallback.
                  const hotItems = rankedItems.filter(p => {
                    return forcedId != null
                      ?  (p.subcategory?.name_he === sc.name_he || p.tags.some(t => t.name_he === sc.name_he))
                      : (p.subcategory?.name_he === sc.name_he || p.tags.some(t => t.name_he === sc.name_he))
                  })

                  const rows = takeUnique(hotItems, 3, used)

                  return (
                    <div key={sc.name_he}>
                      <div className="flex items-center justify-between mb-4">
                        <div className="tyuta-section-rule text-lg font-black tracking-tight">{sc.name_he}</div>
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
                          <div key={`${w.username ?? w.name}`} className="flex items-center justify-between">
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
                              {w.gold ? <span>{MEDAL_EMOJIS.gold} {w.gold}</span> : null}
                              {w.silver ? <span>{MEDAL_EMOJIS.silver} {w.silver}</span> : null}
                              {w.bronze ? <span>{MEDAL_EMOJIS.bronze} {w.bronze}</span> : null}
                              {!w.gold && !w.silver && !w.bronze ? <span>{WRITER_REACTIONS_LABEL} {w.reactions}</span> : null}
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
                          <div key={`${w.username ?? w.name}`} className="flex items-center justify-between">
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
                              {w.gold ? <span>{MEDAL_EMOJIS.gold} {w.gold}</span> : null}
                              {w.silver ? <span>{MEDAL_EMOJIS.silver} {w.silver}</span> : null}
                              {w.bronze ? <span>{MEDAL_EMOJIS.bronze} {w.bronze}</span> : null}
                              {!w.gold && !w.silver && !w.bronze ? <span>{WRITER_REACTIONS_LABEL} {w.reactions}</span> : null}
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

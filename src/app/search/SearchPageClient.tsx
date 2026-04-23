'use client'

import Link from 'next/link'
import { useMemo, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'

import AuthorHover from '@/components/AuthorHover'
import Avatar from '@/components/Avatar'
import FeedIntentLink from '@/components/FeedIntentLink'
import GifCoverCard from '@/components/GifCoverCard'
import { coverProxySrc, isGifUrl } from '@/lib/coverUrl'
import type { Option, PostCardVM, SearchPageData, SearchQueryState, SortKey } from '@/lib/search/searchPageData'
import { heRelativeTime } from '@/lib/time/heRelativeTime'

function channelBadgeColor(slug: string | null) {
  if (slug === 'release') return 'bg-red-100 text-red-700 border-red-200 dark:bg-red-900/30 dark:text-red-400 dark:border-red-800/40'
  if (slug === 'stories') return 'bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-900/30 dark:text-blue-400 dark:border-blue-800/40'
  if (slug === 'magazine') return 'bg-purple-100 text-purple-700 border-purple-200 dark:bg-purple-900/30 dark:text-purple-400 dark:border-purple-800/40'
  return 'bg-muted text-foreground border-border'
}

function buildSearchUrl(next: Partial<SearchQueryState>, current: SearchQueryState) {
  const params = new URLSearchParams()

  const q = (next.q ?? current.q).trim()
  const channel = (next.channel ?? current.channel).trim()
  const subcat = (next.subcat ?? current.subcat).trim()
  const sort = (next.sort ?? current.sort).trim() as SortKey
  const page = next.page ?? current.page

  if (q) params.set('q', q)
  if (channel) params.set('channel', channel)
  if (subcat) params.set('subcat', subcat)
  if (sort !== 'recent') params.set('sort', sort)
  if (page > 1) params.set('page', String(page))

  const query = params.toString()
  return `/search${query ? `?${query}` : ''}`
}

function SelectChevron() {
  return (
    <span className="pointer-events-none absolute inset-y-0 left-3.5 flex items-center text-muted-foreground">
      <svg
        aria-hidden="true"
        viewBox="0 0 20 20"
        fill="none"
        className="h-4 w-4"
      >
        <path
          d="M5 7.5L10 12.5L15 7.5"
          stroke="currentColor"
          strokeWidth="1.75"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </span>
  )
}

function SearchSelect({
  value,
  onChange,
  disabled,
  children,
}: {
  value: string
  onChange: (value: string) => void
  disabled?: boolean
  children: React.ReactNode
}) {
  return (
    <div className="relative">
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        disabled={disabled}
        className="h-11 w-full appearance-none rounded-xl border bg-background px-3 pl-10 text-right text-foreground dark:border-border disabled:cursor-not-allowed disabled:opacity-70"
      >
        {children}
      </select>
      <SelectChevron />
    </div>
  )
}

function SearchResultCard({ post }: { post: PostCardVM }) {
  const router = useRouter()
  const coverSrc = coverProxySrc(post.cover_image_url)

  return (
    <div
      role="link"
      tabIndex={0}
      onClick={() => router.push(`/post/${post.slug}`)}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault()
          router.push(`/post/${post.slug}`)
        }
      }}
      className="cursor-pointer rounded-2xl border bg-white p-4 hover:shadow-sm dark:border-border dark:bg-card"
    >
      <div className="flex flex-row-reverse items-stretch gap-3 sm:gap-4">
        {/* Image column — full card height, wider on desktop */}
        <div className="relative w-28 sm:w-40 shrink-0 overflow-hidden rounded-xl bg-muted ring-1 ring-border/30 min-h-[110px] sm:min-h-[128px]">
          {coverSrc ? (
            isGifUrl(coverSrc) ? (
              <div className="absolute inset-0">
                <GifCoverCard src={coverSrc} alt="" />
              </div>
            ) : (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={coverSrc} alt="" className="absolute inset-0 h-full w-full object-cover" />
            )
          ) : null}
        </div>

        {/* Content column */}
        <div className="flex min-w-0 flex-1 flex-col">
          {/* Category + subcategory badges — above the title */}
          {(post.channel || post.subcategory?.name_he) ? (
            <div className="mb-1.5 flex flex-nowrap items-center gap-1 overflow-hidden text-xs">
              {post.channel ? (
                <FeedIntentLink
                  href={`/c/${post.channel.slug}`}
                  onClick={(event) => event.stopPropagation()}
                  className={`shrink-0 rounded-full border px-2 py-0.5 font-medium transition-opacity hover:opacity-80 ${channelBadgeColor(post.channel.slug)}`}
                >
                  {post.channel.name_he}
                </FeedIntentLink>
              ) : null}
              {post.subcategory?.name_he ? (
                <span className="truncate rounded-full border border-border/60 bg-muted/60 px-2 py-0.5 text-muted-foreground">
                  {post.subcategory.name_he}
                </span>
              ) : null}
            </div>
          ) : null}

          <div className="line-clamp-2 cursor-pointer text-base font-bold leading-snug tyuta-hover">
            {post.title}
          </div>

          {post.excerpt ? (
            <div className="mt-1 line-clamp-2 text-sm leading-relaxed text-muted-foreground">
              {post.excerpt}
            </div>
          ) : null}

          <div className="flex-1" />

          <div className="mt-2 flex items-center justify-between gap-2 text-xs text-muted-foreground">
            {post.author?.username ? (
              <div className="min-w-0 flex-1 overflow-hidden [&>span]:max-w-full">
                <AuthorHover username={post.author.username}>
                  <Link
                    href={`/u/${post.author.username}`}
                    onClick={(event) => event.stopPropagation()}
                    className="inline-flex max-w-full items-center gap-1.5 overflow-hidden rounded-lg px-1.5 py-0.5 transition-colors hover:bg-muted"
                  >
                    <Avatar
                      src={post.author.avatar_url ?? null}
                      name={post.author.display_name || post.author.username}
                      size={20}
                    />
                    <span className="min-w-0 truncate font-semibold tyuta-hover">
                      {post.author.display_name || post.author.username}
                    </span>
                  </Link>
                </AuthorHover>
              </div>
            ) : (
              <div className="flex-1" />
            )}

            <div className="flex shrink-0 items-center gap-2 whitespace-nowrap">
              <span>{`💬 ${post.comments_count}`}</span>
              <span>{heRelativeTime(post.published_at || post.created_at)}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default function SearchPageClient({
  initialData,
  pageSize,
}: {
  initialData: SearchPageData
  pageSize: number
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [form, setForm] = useState<SearchQueryState>(initialData.query)
  const pageTopRef = useRef<HTMLDivElement | null>(null)

  const totalPages = Math.max(1, Math.ceil(initialData.total / pageSize))

  const pageNumbers = useMemo(() => {
    const maxButtons = 7
    const currentPage = initialData.query.page
    if (totalPages <= maxButtons) return Array.from({ length: totalPages }, (_, index) => index + 1)

    const list: Array<number | 'ellipsis'> = [1]
    const start = Math.max(2, currentPage - 1)
    const end = Math.min(totalPages - 1, currentPage + 1)

    if (start > 2) list.push('ellipsis')
    for (let page = start; page <= end; page += 1) list.push(page)
    if (end < totalPages - 1) list.push('ellipsis')
    list.push(totalPages)
    return list
  }, [initialData.query.page, totalPages])

  const navigate = (next: Partial<SearchQueryState>, options?: { scroll?: boolean; smoothToTop?: boolean }) => {
    const href = buildSearchUrl(next, form)

    if (options?.smoothToTop) {
      window.scrollTo({ top: 0, behavior: 'smooth' })
    }

    startTransition(() => {
      router.push(href, { scroll: options?.scroll ?? !options?.smoothToTop })
    })
  }

  const onSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    navigate({ ...form, page: 1 })
  }

  const updateField = <K extends keyof SearchQueryState>(key: K, value: SearchQueryState[K]) => {
    setForm((current) => ({
      ...current,
      [key]: value,
      ...(key === 'channel' ? { subcat: '' } : {}),
    }))
  }

  const channels: Option[] = initialData.channels.length ? initialData.channels : [{ value: '', label: 'הכל' }]
  const activeSubcatLabel = form.channel
    ? initialData.subcatLabelsByChannel[form.channel] ?? initialData.subcatLabel
    : 'תת-קטגוריה'
  const subcats: Option[] = form.channel
    ? initialData.subcatsByChannel[form.channel] ?? [{ value: '', label: 'כל תתי-הקטגוריות' }]
    : [{ value: '', label: 'בחר קטגוריה קודם' }]

  return (
    <div ref={pageTopRef} className="mx-auto max-w-5xl px-4 py-10">
      <div className="mb-6">
        <h1 className="text-2xl font-extrabold">חיפוש פוסטים</h1>
      </div>

      <form
        onSubmit={onSubmit}
        className="rounded-2xl border bg-neutral-50/80 p-4 shadow-sm backdrop-blur supports-[backdrop-filter]:bg-neutral-50/70 dark:bg-muted/80 dark:supports-[backdrop-filter]:bg-muted/70"
      >
        <div className="grid grid-cols-1 gap-3 md:grid-cols-5">
          <div className="md:col-span-2">
            <label className="mb-1 block text-sm font-medium">טקסט</label>
            <input
              value={form.q}
              onChange={(event) => updateField('q', event.target.value)}
              placeholder="חפש כותרת או תקציר..."
              className="h-11 w-full rounded-xl border bg-background px-3 text-foreground placeholder:text-muted-foreground dark:border-border"
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium">קטגוריה</label>
            <SearchSelect
              value={form.channel}
              onChange={(value) => updateField('channel', value)}
            >
              {channels.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </SearchSelect>
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium">{activeSubcatLabel}</label>
            <SearchSelect
              value={form.subcat}
              onChange={(value) => updateField('subcat', value)}
              disabled={!form.channel}
            >
              {subcats.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </SearchSelect>
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium">מיון</label>
            <SearchSelect
              value={form.sort}
              onChange={(value) => updateField('sort', value as SortKey)}
            >
              <option value="recent">אחרונים</option>
              <option value="reactions">ריאקשנים</option>
              <option value="comments">תגובות</option>
            </SearchSelect>
          </div>
        </div>

        <div className="mt-3 flex items-end justify-between gap-3">
          <div className="text-xs text-muted-foreground">
            {isPending ? 'טוען...' : `${initialData.total.toLocaleString('he-IL')} תוצאות`}
          </div>

          <button
            type="submit"
            className="cursor-pointer rounded-xl bg-black px-5 py-2.5 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-60"
            disabled={isPending}
          >
            חפש
          </button>
        </div>

        {initialData.error ? (
          <div className="mt-3 text-sm text-red-700">שגיאת חיפוש: {initialData.error}</div>
        ) : null}
      </form>

      <div className="mt-6 min-h-[400px] space-y-3">
        {isPending ? (
          Array.from({ length: 5 }).map((_, index) => (
            <div key={index} className="animate-pulse rounded-2xl border bg-white p-4 dark:border-border dark:bg-card">
              <div className="flex flex-row-reverse items-stretch gap-3 sm:gap-4">
                <div className="w-28 sm:w-40 shrink-0 rounded-xl bg-neutral-200 min-h-[110px] sm:min-h-[128px] dark:bg-muted" />
                <div className="min-w-0 flex-1 space-y-2 pt-1">
                  <div className="h-5 w-3/4 rounded-lg bg-neutral-200 dark:bg-muted" />
                  <div className="h-4 w-full rounded-lg bg-neutral-100 dark:bg-muted/60" />
                  <div className="h-3 w-1/4 rounded-lg bg-neutral-100 dark:bg-muted/60" />
                </div>
              </div>
            </div>
          ))
        ) : initialData.results.length > 0 ? (
          initialData.results.map((post) => <SearchResultCard key={post.id} post={post} />)
        ) : !initialData.error ? (
          <div className="rounded-2xl border bg-white p-6 text-sm text-muted-foreground dark:border-border dark:bg-card">
            לא נמצאו תוצאות תואמות.
          </div>
        ) : null}
      </div>

      {totalPages > 1 ? (
        <div className="mt-6 flex items-center justify-center gap-2">
          {pageNumbers.map((pageNumber, index) =>
            pageNumber === 'ellipsis' ? (
              <span key={`ellipsis-${index}`} className="px-2 text-muted-foreground">
                ...
              </span>
            ) : (
              <button
                key={pageNumber}
                type="button"
                onClick={() => navigate({ page: pageNumber }, { smoothToTop: true })}
                className={`h-9 min-w-9 cursor-pointer rounded-xl border px-3 text-center text-sm leading-9 transition-colors dark:border-border ${
                  pageNumber === initialData.query.page
                    ? 'bg-black text-white dark:bg-foreground dark:text-background'
                    : 'bg-white hover:bg-muted dark:bg-card dark:hover:bg-muted'
                }`}
              >
                {pageNumber}
              </button>
            ),
          )}
        </div>
      ) : null}
    </div>
  )
}

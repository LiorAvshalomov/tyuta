import Link from 'next/link'

export type PostCardMedals = {
  gold: number
  silver: number
  bronze: number
}

export type PostCardTag = {
  slug: string
  name_he: string
}

export type PostCardAuthor = {
  username: string | null
  display_name: string | null
}

export type PostCardPost = {
  slug: string
  title: string
  excerpt?: string | null
  created_at: string
  cover_image_url?: string | null
  // optional join shapes (we keep it forgiving because supabase select shapes vary)
  channel?: { name_he: string }[] | { name_he: string } | null
  author?: PostCardAuthor | PostCardAuthor[] | null
  is_anonymous?: boolean | null
  medals?: Partial<PostCardMedals> | null
  tags?: PostCardTag[] | null
  post_tags?: { tag: PostCardTag[] | PostCardTag | null }[] | null
}

type Variant = 'default' | 'mypen-row' | 'mypen-featured' | 'tile'

function first<T>(v: T | T[] | null | undefined): T | null {
  if (!v) return null
  return Array.isArray(v) ? v[0] ?? null : v
}

function safeText(v?: string | null) {
  const t = (v ?? '').trim()
  return t.length ? t : ''
}

function normalizeTags(post: PostCardPost): PostCardTag[] {
  if (post.tags && Array.isArray(post.tags)) return post.tags
  const pt = post.post_tags ?? []
  const out: PostCardTag[] = []
  for (const row of pt) {
    const t = row?.tag
    if (!t) continue
    if (Array.isArray(t)) {
      for (const x of t) if (x?.slug && x?.name_he) out.push(x)
    } else if ((t as any)?.slug && (t as any)?.name_he) {
      out.push(t as any)
    }
  }
  return out
}

function normalizeChannelName(post: PostCardPost): string {
  const ch = post.channel as any
  if (!ch) return ''
  if (Array.isArray(ch)) return ch[0]?.name_he ?? ''
  return ch?.name_he ?? ''
}

function normalizeAuthor(post: PostCardPost): PostCardAuthor | null {
  const a = first(post.author as any)
  if (!a) return null
  return {
    username: (a as any).username ?? null,
    display_name: (a as any).display_name ?? null,
  }
}

function MedalIcons({ medals }: { medals?: Partial<PostCardMedals> | null }) {
  const gold = medals?.gold ?? 0
  const silver = medals?.silver ?? 0
  const bronze = medals?.bronze ?? 0

  // keep it compact like MyPen
  return (
    <span className="inline-flex items-center gap-2 text-[12px] text-muted-foreground" aria-label="medals">
      <span title="bronze">🥉 {bronze}</span>
      <span title="silver">🥈 {silver}</span>
      <span title="gold">🥇 {gold}</span>
    </span>
  )
}

function Cover({ url, variant }: { url?: string | null; variant: Variant }) {
  // One place to control ALL image sizing.
  // - featured: fixed height (like MyPen right block)
  // - row: small thumbnail
  // - tile: square
  // - default: medium thumbnail

  if (!url) {
    // lightweight placeholder (no external calls)
    const cls =
      variant === 'mypen-featured'
        ? 'h-[320px]'
        : variant === 'tile'
          ? 'aspect-square'
          : variant === 'mypen-row'
            ? 'h-16 w-24'
            : 'h-24 w-36'

    return (
      <div className={`overflow-hidden rounded-md border bg-neutral-100 ${cls} flex items-center justify-center`}>
        <span className="text-xs text-neutral-400">אין תמונה</span>
      </div>
    )
  }

  if (variant === 'mypen-featured') {
    return (
      <div className="overflow-hidden rounded-md border bg-white">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={url} alt="" className="h-[320px] w-full object-cover" loading="lazy" />
      </div>
    )
  }

  if (variant === 'tile') {
    return (
      <div className="overflow-hidden rounded-md border bg-white aspect-square">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={url} alt="" className="h-full w-full object-cover" loading="lazy" />
      </div>
    )
  }

  if (variant === 'mypen-row') {
    return (
      <div className="shrink-0 overflow-hidden rounded-md border bg-white h-16 w-24">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={url} alt="" className="h-full w-full object-cover" loading="lazy" />
      </div>
    )
  }

  // default list
  return (
    <div className="shrink-0 overflow-hidden rounded-md border bg-white h-24 w-36">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={url} alt="" className="h-full w-full object-cover" loading="lazy" />
    </div>
  )
}

export default function PostCard({
  post,
  variant = 'default',
}: {
  post: PostCardPost
  variant?: Variant
}) {
  const tags = normalizeTags(post)
  const channelName = normalizeChannelName(post)
  const author = normalizeAuthor(post)

  const title = safeText(post.title) || 'ללא כותרת'
  const excerpt = safeText(post.excerpt ?? '')

  const isAnon = Boolean(post.is_anonymous)
  const authorName = isAnon ? 'אנונימי' : safeText(author?.display_name) || 'אנונימי'
  const authorUsername = isAnon ? null : author?.username ?? null

  // Date: keep it simple for now (he-IL)
  const createdLabel = new Date(post.created_at).toLocaleString('he-IL', {
    dateStyle: 'medium',
    timeStyle: 'short',
  })

  if (variant === 'mypen-featured') {
    return (
      <div className="rounded-md border bg-white p-3">
        <div className="mb-3">
          <Cover url={post.cover_image_url} variant={variant} />
        </div>

        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="text-lg font-bold leading-snug">{title}</h3>
            <div className="mt-1 text-sm text-muted-foreground">
              מאת:{' '}
              {authorUsername ? (
                <Link href={`/u/${authorUsername}`} className="text-blue-600 hover:underline">
                  {authorName}
                </Link>
              ) : (
                <span>{authorName}</span>
              )}
            </div>

            {excerpt ? <p className="mt-2 line-clamp-3 text-sm text-neutral-700">{excerpt}</p> : null}

            <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
              {channelName ? (
                <span className="text-red-600">תגיות: </span>
              ) : null}
              {tags.slice(0, 5).map(t => (
                <span key={t.slug} className="text-green-700 hover:underline">
                  {t.name_he}
                </span>
              ))}
            </div>
          </div>

          <div className="shrink-0 text-right">
            <div className="text-xs text-muted-foreground">{createdLabel}</div>
            <div className="mt-2">
              <MedalIcons medals={post.medals ?? null} />
            </div>
            <Link href={`/post/${post.slug}`} className="mt-3 inline-block text-xs font-bold hover:underline">
              קרא עוד
            </Link>
          </div>
        </div>
      </div>
    )
  }

  if (variant === 'mypen-row') {
    return (
      <div className="rounded-md border bg-white p-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="font-bold leading-snug">{title}</h3>
            <div className="mt-1 text-xs text-muted-foreground">מאת: {authorName} · {createdLabel}</div>
            {excerpt ? <div className="mt-2 line-clamp-2 text-xs text-neutral-600">{excerpt}</div> : null}

            <Link href={`/post/${post.slug}`} className="mt-2 inline-block text-xs font-bold hover:underline">
              קרא עוד
            </Link>
          </div>

          <Cover url={post.cover_image_url} variant={variant} />
        </div>
      </div>
    )
  }

  if (variant === 'tile') {
    return (
      <Link href={`/post/${post.slug}`} className="block rounded-md border bg-white p-2 hover:bg-neutral-50">
        <Cover url={post.cover_image_url} variant={variant} />
        <div className="mt-2 text-center text-sm font-bold line-clamp-2">{title}</div>
      </Link>
    )
  }

  // default list: image on the RIGHT (like MyPen list rows)
  return (
    <div className="rounded-md border bg-white p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-base font-bold leading-snug">{title}</h3>
          <div className="mt-1 text-xs text-muted-foreground">
            מאת: {authorName} · {createdLabel}
          </div>
          {excerpt ? <p className="mt-2 line-clamp-2 text-sm text-neutral-700">{excerpt}</p> : null}

          <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
            {tags.slice(0, 6).map(t => (
              <span key={t.slug} className="text-green-700 hover:underline">
                {t.name_he}
              </span>
            ))}
          </div>

          <div className="mt-2">
            <MedalIcons medals={post.medals ?? null} />
          </div>

          <Link href={`/post/${post.slug}`} className="mt-2 inline-block text-xs font-bold hover:underline">
            קרא עוד
          </Link>
        </div>

        <Cover url={post.cover_image_url} variant={variant} />
      </div>
    </div>
  )
}

// src/app/page.tsx
import Link from 'next/link'
import { supabase } from '@/lib/supabaseClient'
import { formatDateTimeHe, formatRelativeHe } from '@/lib/time'
import HomeWriteCTA from '@/components/HomeWriteCTA'
import StickySidebar from '@/components/StickySidebar'

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

function Avatar({
  url,
  name,
  size = 36,
}: {
  url: string | null
  name: string
  size?: number
}) {
  const initials = name.trim().slice(0, 1) || 'P'

  return (
    <div
      className="rounded-full overflow-hidden bg-gradient-to-br from-blue-400 to-purple-500 flex items-center justify-center text-white font-black shrink-0"
      style={{ width: size, height: size }}
      aria-label={name}
      title={name}
    >
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt={name} className="w-full h-full object-cover transition-transform duration-300 ease-out group-hover:scale-[1.03]" />
      ) : (
        <span style={{ fontSize: Math.max(12, Math.floor(size / 2.4)) }}>{initials}</span>
      )}
    </div>
  )
}

function truncateText(text: string, maxChars: number) {
  const t = text.trim()
  if (t.length <= maxChars) return t
  return `${t.slice(0, Math.max(0, maxChars - 1))}…`
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
    <div dir="ltr" className={`flex items-center ${cls} text-gray-700`}>
      {gold > 0 ? <span className="inline-flex items-center gap-1">🥇 {gold}</span> : null}
      {silver > 0 ? <span className="inline-flex items-center gap-1">🥈 {silver}</span> : null}
      {bronze > 0 ? <span className="inline-flex items-center gap-1">🥉 {bronze}</span> : null}
    </div>
  )
}

function channelBadgeColor(slug: string | null) {
  if (slug === 'stories') return 'bg-blue-50 text-blue-700'
  if (slug === 'release') return 'bg-rose-50 text-rose-700'
  if (slug === 'magazine') return 'bg-purple-50 text-purple-700'
  return 'bg-gray-100 text-gray-700'
}

function SectionHeader({ title, href }: { title: string; href: string }) {
  return (
    <div className="flex items-center justify-between mb-3">
      <Link href={href} className="text-lg font-black tracking-tight hover:text-sky-700 transition-colors">
        {title}
      </Link>
    </div>
  )
}

function FeaturedPost({ post }: { post: CardPost }) {
  return (
    <article className="group bg-slate-100/70 font-sans rounded-2xl overflow-hidden shadow-sm transition-all duration-200 hover:shadow-lg hover:-translate-y-[1px] border border-black/10">
      <div className="lg:grid lg:grid-cols-2">
        {/* Image */}
        <div className="order-1 lg:order-2">
          <Link href={`/post/${post.slug}`} className="block">
            <div className="relative aspect-[16/10]  lg:h-full bg-gray-100">
              {post.cover_image_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={post.cover_image_url} alt={post.title} className="w-full h-full object-cover transition-transform duration-300 ease-out group-hover:scale-[1.03]" />
              ) : null}
            </div>
          </Link>
        </div>

        {/* Content */}
        <div className="order-2 lg:order-1 p-5 sm:p-6 lg:p-10 flex flex-col justify-center">
          {/* Author FIRST (as you asked) */}
          <div className="flex items-start justify-between gap-3 mb-3">
            <div className="flex items-center gap-3 min-w-0">
              <Avatar url={post.author_avatar_url} name={post.author_name} size={40} />
              <div className="min-w-0">
                {post.author_username ? (
                  <Link href={`/u/${post.author_username}`} className="font-bold text-sm hover:text-sky-700 transition-colors">
                    {post.author_name}
                  </Link>
                ) : (
                  <span className="font-bold text-sm">{post.author_name}</span>
                )}
                <div className="flex items-center justify-between text-xs text-gray-500">

                  <div className="min-w-0 text-right">
                    <span title={formatDateTimeHe(post.created_at)}>{formatRelativeHe(post.created_at)}</span>
                    {post.subcategory ? (
                      <>
                        <span className="mx-2">•</span>
                        <span className="font-semibold text-gray-700">{post.subcategory.name_he}</span>
                      </>
                    ) : null}
                  </div>
                </div>
              </div>
            </div>

            {/* Medals - top left */}
            <div className="shrink-0 pt-1">
              <MedalsInline medals={post.allTimeMedals} />
            </div>
          </div>

          {/* Channel badge (optional) */}
          {post.channel_name && post.channel_slug ? (
            <div className="mb-3">
              <Link href={`/c/${post.channel_slug}`}>
                <span className={`inline-flex px-3 py-1 rounded-full font-semibold text-xs ${channelBadgeColor(post.channel_slug)}`}>
                  {post.channel_name}
                </span>
              </Link>
            </div>
          ) : null}

          {/* Title */}
          <h1 className="text-2xl sm:text-3xl lg:text-4xl font-black leading-tight mb-3">
            <Link href={`/post/${post.slug}`} className="hover:text-sky-700 transition-colors">
              {post.title}
            </Link>
          </h1>

          {/* Excerpt */}
          {post.excerpt ? (
            <p className="text-gray-600 text-sm sm:text-base lg:text-lg leading-relaxed mb-4 line-clamp-3">
              {truncateText(post.excerpt, 150)}
            </p>
          ) : null}
        </div>
      </div>
    </article>
  )
}

function SimplePostCard({ post }: { post: CardPost }) {
  return (
    <article className="group bg-slate-100/70 rounded-xl overflow-hidden shadow-sm transition-all duration-200 hover:shadow-lg hover:-translate-y-[1px] border border-black/10">
      <Link href={`/post/${post.slug}`} className="block">
        <div className="relative aspect-[4/3] bg-gray-100">
          {post.cover_image_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={post.cover_image_url} alt={post.title} className="w-full h-full object-cover transition-transform duration-300 ease-out group-hover:scale-[1.03]" />
          ) : null}
        </div>
      </Link>

      <div className="p-4 text-right">
        <div className="flex items-center justify-between text-xs text-gray-500 mb-2">

          <div className="min-w-0">
            <span title={formatDateTimeHe(post.created_at)}>{formatRelativeHe(post.created_at)}</span>
            {post.subcategory ? (
              <>
                <span className="mx-2">•</span>
                <span className="font-semibold">{post.subcategory.name_he}</span>
              </>
            ) : null}

          </div>
          <div className="shrink-0">
            <MedalsInline medals={post.allTimeMedals} />
          </div>
        </div>

        <h3 className="text-base font-black leading-snug line-clamp-2">
          <Link href={`/post/${post.slug}`} className="hover:text-sky-700 transition-colors">
            {post.title}
          </Link>
        </h3>

        {post.excerpt ? (
          <p className="mt-2 text-xs sm:text-sm text-gray-600 leading-relaxed line-clamp-2">
            {truncateText(post.excerpt, 90)}
          </p>
        ) : null}
        <div className={`${post.excerpt ? "mt-3" : "mt-4"} flex items-center justify-start gap-2 text-xs text-gray-700`}>
          {post.author_username ? (
            <Link href={`/u/${post.author_username}`} className="group/author inline-flex items-center gap-2">
              <Avatar url={post.author_avatar_url} name={post.author_name} size={24} />
              <span className="font-semibold transition-colors group-hover/author:text-sky-700">{post.author_name}</span>
            </Link>
          ) : (
            <div className="inline-flex items-center gap-2">
              <Avatar url={post.author_avatar_url} name={post.author_name} size={24} />
              <span className="font-semibold">{post.author_name}</span>
            </div>
          )}
        </div>

        {/* Small proof these are "hot" this week */}
        {/* <div className="mt-2 text-[11px] text-gray-500">
          השבוע: <span className="font-semibold">{post.weekReactionsTotal}</span> ❤️
          <span className="mx-1">•</span>
          <span className="font-semibold">{post.weekCommentsTotal}</span> תגובות
        </div> */}
      </div>
    </article>
  )
}

function ListRowCompact({ post }: { post: CardPost }) {
  return (
    <article className="group relative bg-slate-100/70 rounded-2xl border border-black/10 p-4 shadow-sm transition-all duration-200 hover:shadow-md hover:-translate-y-[1px] hover:ring-1 hover:ring-black/10 active:scale-[0.99]">
      {/* Full-card click target to the post. Other links (author/profile) stay clickable above it. */}
      <Link
        href={`/post/${post.slug}`}
        aria-label={`לקריאת ${post.title}`}
        className="absolute inset-0 rounded-2xl z-10"
      >
        <span className="sr-only">לקריאה</span>
      </Link>

      {/* Make the layout non-interactive so clicks fall through to the overlay link.
          Specific interactive elements opt-in with pointer-events-auto. */}
      <div className="relative z-20 pointer-events-none">
        {/* In RTL, flex-row-reverse keeps the image on the LEFT (as requested) */}
        <div className="flex flex-row-reverse items-start gap-4">
          <div className="w-[136px] sm:w-[168px] shrink-0">
            <Link href={`/post/${post.slug}`} className="block pointer-events-auto">
              {/*
              Constrain cover image height to prevent oversized uploads (e.g. desktop images)
              from expanding the card. The aspect ratio keeps a consistent thumbnail size.
            */}
              <div className="relative aspect-[4/3] rounded-xl overflow-hidden bg-gray-100">
                {post.cover_image_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={post.cover_image_url}
                    alt={post.title}
                    className="w-full h-full object-cover transition-transform duration-300 ease-out group-hover:scale-[1.03]"
                  />
                ) : null}
              </div>
            </Link>
          </div>

          <div className="min-w-0 flex-1 text-right">
            <div className="flex items-center justify-between text-xs text-gray-500 mb-2">
              <div className="text-xs text-gray-500">
                <span title={formatDateTimeHe(post.created_at)}>{formatRelativeHe(post.created_at)}

                </span>
                {post.subcategory ? (
                  <>
                    <span className="mx-2">•</span>
                    <span className="font-semibold text-gray-700">{post.subcategory.name_he}</span>
                  </>
                ) : null}



              </div>
              <div className="shrink-0">
                <MedalsInline medals={post.allTimeMedals} />
              </div>


            </div>

            <div className="mt-1 text-[15px] sm:text-base font-black leading-snug line-clamp-2">
              <Link href={`/post/${post.slug}`} className="transition-colors hover:text-sky-700 pointer-events-auto">
                {post.title}
              </Link>
            </div>


            <div className="mt-1.5 min-h-[24px]">
              {post.excerpt ? (
                <p className="text-xs sm:text-sm text-gray-600 leading-relaxed line-clamp-2">
                  {truncateText(post.excerpt, 90)}
                </p>
              ) : null}
            </div>

            {/* Author row UNDER excerpt */}
            <div className="mt-1.5 flex items-center justify-start gap-2 text-xs text-gray-700">
              {post.author_username ? (
                <Link
                  href={`/u/${post.author_username}`}
                  className="group/author inline-flex items-center gap-2 rounded-lg px-2 py-1 hover:bg-black/10 transition-colors duration-200 pointer-events-auto"
                >
                  <Avatar url={post.author_avatar_url} name={post.author_name} size={24} />
                  <span className="font-semibold transition-colors group-hover/author:text-neutral-900">{post.author_name}</span>
                </Link>
              ) : (
                <div className="inline-flex items-center gap-2">
                  <Avatar url={post.author_avatar_url} name={post.author_name} size={24} />
                  <span className="font-semibold">{post.author_name}</span>
                </div>
              )}
            </div>

            {post.tags.length ? (
              <div className="mt-2 flex flex-wrap justify-end gap-1">
                {post.tags.slice(0, 2).map(t => (
                  <span
                    key={t.slug}
                    className="inline-flex rounded-full bg-black/5 px-2 py-0.5 text-[11px] font-semibold text-gray-700"
                  >
                    {t.name_he}
                  </span>
                ))}
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </article>
  )
}

function RecentMiniRow({ post }: { post: CardPost }) {
  return (
    <div className="group relative rounded-2xl border border-black/10 bg-slate-100/70 p-3 shadow-sm transition-all duration-200 hover:shadow-md hover:-translate-y-[1px] active:scale-[0.99]">
      {/* Full-card click target to the post. Other links (author/profile) stay clickable above it. */}
      <Link
        href={`/post/${post.slug}`}
        aria-label={`לקריאת ${post.title}`}
        className="absolute inset-0 rounded-2xl z-10"
      >
        <span className="sr-only">לקריאה</span>
      </Link>

      <div className="relative z-20 pointer-events-none">
        {/* In RTL, flex-row-reverse keeps the image on the LEFT (as requested) */}
        <div className="flex flex-row-reverse items-start gap-3">
          <div className="w-[94px] shrink-0">
            <Link href={`/post/${post.slug}`} className="block pointer-events-auto">
              <div className="relative aspect-[4/3] rounded-xl overflow-hidden bg-gray-100">
                {post.cover_image_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={post.cover_image_url}
                    alt={post.title}
                    className="w-full h-full object-cover transition-transform duration-300 ease-out group-hover:scale-[1.03]"
                  />
                ) : null}
              </div>
            </Link>
          </div>

          <div className="min-w-0 flex-1 text-right">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0 flex-1 text-sm font-black leading-snug">
                <Link href={`/post/${post.slug}`} className="transition-colors hover:text-sky-700 line-clamp-1 block pointer-events-auto">
                  {truncateText(post.title, 48)}
                </Link>
              </div>

              <div className="shrink-0 pt-0.5">
                <MedalsInline medals={post.allTimeMedals} />
              </div>
            </div>


            <div className="mt-1 min-h-[18px]">
              {post.excerpt ? (
                <p className="text-xs text-gray-600 leading-snug line-clamp-1">
                  {truncateText(post.excerpt, 25)}
                </p>
              ) : null}
            </div>
            <div className="mt-1 text-[12px] text-gray-500 flex items-center justify-between">
              {post.author_username ? (
                <Link
                  href={`/u/${post.author_username}`}
                  className="group/author inline-flex items-center gap-2 rounded-lg px-2 py-1 hover:bg-black/10 transition-colors duration-200 pointer-events-auto"
                >
                  <Avatar url={post.author_avatar_url} name={post.author_name} size={22} />
                  <span className="font-semibold transition-colors group-hover/author:text-neutral-900">{post.author_name}</span>
                </Link>
              ) : (
                <div className="inline-flex items-center gap-2">
                  <Avatar url={post.author_avatar_url} name={post.author_name} size={22} />
                  <span className="font-semibold">{post.author_name}</span>
                </div>
              )}

              <span title={formatDateTimeHe(post.created_at)}>{formatRelativeHe(post.created_at)}</span>
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

  // Resolve channel id once for stable filtering (PostgREST filters on embedded resources can be unreliable)
  const channelId: number | null = isChannelPage && channelSlug
    ? ((await supabase.from('channels').select('id').eq('slug', channelSlug).maybeSingle()).data?.id ?? null)
    : null

  // Resolve subcategory tag ids for forced subcategories (by Hebrew name)
  const forcedSubcatIdsByName = new Map<string, number>()
  const forcedSubcategoryPostsById = new Map<number, PostRow[]>()
  
  if (isChannelPage && forcedSubcategories.length > 0) {
    const names = forcedSubcategories.map(s => s.name_he)
    const { data: forcedTagRows } = await supabase
      .from('tags')
      .select('id,name_he')
      .in('name_he', names)
    ;(forcedTagRows ?? []).forEach(r => {
      const rr = r as { id: number; name_he: string }
      forcedSubcatIdsByName.set(rr.name_he, rr.id)
    })
  }
  
  // Bulk fetch recent posts for all forced subcategories (channel pages), so subcategory sections never rely on ranking availability
  if (isChannelPage && channelId != null && forcedSubcatIdsByName.size > 0) {
    const subcatIds = Array.from(new Set(Array.from(forcedSubcatIdsByName.values())))
    const { data: subcatPostRows } = await supabase
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
          post_tags:post_tags!fk_post_tags_post_id_posts ( tag:tags!fk_post_tags_tag_id_tags ( name_he, slug ) )
        `
      )
      .is('deleted_at', null)
      .eq('status', 'published')
      .eq('channel_id', channelId)
      .in('subcategory_tag_id', subcatIds)
      .order('published_at', { ascending: false })
      .limit(250)

    ;(subcatPostRows ?? []).forEach(r => {
      const row = r as PostRow
      const sid = row.subcategory_tag_id
      if (typeof sid !== 'number') return
      const prev = forcedSubcategoryPostsById.get(sid) ?? []
      prev.push(row)
      forcedSubcategoryPostsById.set(sid, prev)
    })
  }

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
                post_tags:post_tags!fk_post_tags_post_id_posts ( tag:tags!fk_post_tags_tag_id_tags ( name_he, slug ) )
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
              post_tags:post_tags!fk_post_tags_post_id_posts ( tag:tags!fk_post_tags_tag_id_tags ( name_he, slug ) )
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
        <div className="mx-auto max-w-6xl px-4 py-10">
          <h1 className="text-xl font-bold">שגיאה בטעינת דירוג השבוע</h1>
          <pre className="mt-4 rounded border bg-white p-4 text-xs">{JSON.stringify(rpcError, null, 2)}</pre>
        </div>
      </main>
    )
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

  const { data: postsRows, error: postsErr } = await supabase
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
      post_tags:post_tags!fk_post_tags_post_id_posts ( tag:tags!fk_post_tags_tag_id_tags ( name_he, slug ) )
      `
    )
    .in('id', idsNeeded)

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

  // ALL-TIME medals for posts (display)
  const { data: medalsRows, error: medalsErr } = await supabase
    .from('post_medals_all_time')
    .select('post_id, gold, silver, bronze')
    .in('post_id', idsNeeded)

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
  const storiesFinal = stories.length > 0 ? stories : recentPosts.filter(p => p.channel_slug === 'stories').slice(0, 5)
  const releaseFinal = release.length > 0 ? release : recentPosts.filter(p => p.channel_slug === 'release').slice(0, 5)
  const magazineFinal = magazine.length > 0 ? magazine : recentPosts.filter(p => p.channel_slug === 'magazine').slice(0, 5)

  // Writers of week: medals first, fallback to total weekly reactions.
  // We compute this off rankedAll (broad) and then enrich with profile info via posts.
  const rankedAllIds = rankedAll.map(r => r.post_id)
  const { data: writerPostRows } = await supabase
    .from('posts')
    .select(
      `
      id,
      author:profiles!posts_author_id_fkey ( username, display_name, avatar_url )
      `
    )
    .in('id', rankedAllIds)

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
      <div className="mx-auto max-w-6xl px-4 py-6">
        
{isChannelPage ? (
          <div className="space-y-8">
            {/* Channel header */}
            {channelName ? (
              <div className="space-y-1">
                <div className="text-2xl sm:text-3xl font-black tracking-tight">{channelName}</div>
                {channelSubtitle ? (
                  <div className="text-sm text-gray-600">{channelSubtitle}</div>
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
                <div className="flex items-center justify-between mb-3">
                  <div className="text-lg font-black tracking-tight">פוסטים מובילים{isChannelPage && channelName ? ` ב: ${channelName}` : ``}</div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {top1 ? <SimplePostCard post={top1} /> : null}
                  {top2 ? <SimplePostCard post={top2} /> : null}
                  {top3 ? <SimplePostCard post={top3} /> : null}
                </div>
              </div>
            </div>

            {/* Below: subcategories (HOT monthly) + sidebar */}
            <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-6 items-start">
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
                      <div className="flex items-center justify-between mb-3">
                        <div className="text-lg font-black tracking-tight">{sc.name_he}</div>
                      </div>
                      <div className="space-y-3">
                        {rows.length > 0 ? rows.map(p => (
                          <ListRowCompact key={p.id} post={p} />
                        )) : (
                          <div className="rounded-2xl border border-black/10 bg-white/60 p-4">
                            <div className="text-sm font-bold text-gray-800">עדיין אין פוסטים כאן</div>
                            <div className="mt-1 text-xs text-gray-600">רוצה לפתוח את זה עם משהו קצר?</div>
                            <Link
                              href={`/write?channel=${encodeURIComponent(channelSlug ?? '')}&subcategory=${encodeURIComponent(sc.name_he)}&return=${encodeURIComponent(`/c/${channelSlug}`)}`}
                              className="mt-3 inline-flex items-center justify-center rounded-xl bg-sky- (p.subcategory?.name_he === sc.name_he || p.tags.some(t => t.name_he === sc.name_he))00 px-3 py-2 text-xs font-black text-black shadow-sm transition hover:bg-sky-800 active:scale-[0.99]"
                            >
                              כתוב/י ראשון/ה בתת־קטגוריה הזו
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
                  <div className="bg-slate-100/70 rounded-2xl p-5 shadow-sm border border-black/10">
                    <Link href={channelSlug ? `/search?sort=recent&channel=${channelSlug}` : "/search?sort=recent"} className="text-base font-black mb-4 inline-flex hover:text-sky-700 transition-colors">פוסטים אחרונים</Link>
                    <div className="space-y-3">
                      {recentMini.slice(0, 8).map(p => (
                        <RecentMiniRow key={p.id} post={p} />
                      ))}
                    </div>
                  </div>

                  {/* Writers of week */}
                  <div className="bg-slate-100/70 rounded-2xl p-5 shadow-sm border border-black/10">
                    <div className="text-base font-black mb-4">{isChannelPage ? 'כותבי החודש' : 'כותבי השבוע'}</div>

                    {writerScores.length ? (
                      <div className="space-y-3">
                        {writerScores.map((w, idx) => (
                          <div key={`${w.username ?? w.name}`} className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                              <div className="w-7 h-7 rounded-full bg-black/5 border border-black/10 flex items-center justify-center text-xs font-black text-gray-700">
                                {idx + 1}
                              </div>

                              {w.username ? (
                                <Link href={`/u/${w.username}`} className="group/writer inline-flex items-center gap-2">
                                  <Avatar url={w.avatar_url} name={w.name} size={36} />
                                  <span className="text-sm font-bold transition-colors group-hover/writer:text-sky-700">
                                    {w.name}
                                  </span>
                                </Link>
                              ) : (
                                <div className="inline-flex items-center gap-2">
                                  <Avatar url={w.avatar_url} name={w.name} size={36} />
                                  <span className="text-sm font-bold">{w.name}</span>
                                </div>
                              )}
                            </div>

                            <div dir="ltr" className="text-xs text-gray-700 flex items-center gap-2">
                              {w.gold ? <span>🥇 {w.gold}</span> : null}
                              {w.silver ? <span>🥈 {w.silver}</span> : null}
                              {w.bronze ? <span>🥉 {w.bronze}</span> : null}
                              {!w.gold && !w.silver && !w.bronze ? <span>❤️ {w.reactions}</span> : null}
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="text-sm text-gray-500">אין עדיין פעילות לשבוע הזה.</div>
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

          <div className="space-y-8">
            {/* Top of page: featured + top posts */}
            <div className="space-y-6">
              {featured ? (
                <div>
                  <FeaturedPost post={featured} />
                </div>
              ) : null}

              <div>
                <div className="flex items-center justify-between mb-3">
                  <div className="text-lg font-black tracking-tight">פוסטים מובילים{isChannelPage && channelName ? ` ב: ${channelName}` : ``}</div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {top1 ? <SimplePostCard post={top1} /> : null}
                  {top2 ? <SimplePostCard post={top2} /> : null}
                  {top3 ? <SimplePostCard post={top3} /> : null}
                </div>
              </div>
            </div>

            {/* Below: categories on the right, sidebar on the left */}
            <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-6 items-start">
              {/* Categories */}
              <div className="space-y-8">
                <div>
                  <SectionHeader title="פריקה" href="/c/release" />
                  <div className="space-y-3">
                    {releaseFinal.map(p => (
                      <ListRowCompact key={p.id} post={p} />
                    ))}
                  </div>
                </div>

                <div>
                  <SectionHeader title="סיפורים" href="/c/stories" />
                  <div className="space-y-3">
                    {storiesFinal.map(p => (
                      <ListRowCompact key={p.id} post={p} />
                    ))}
                  </div>
                </div>

                <div>
                  <SectionHeader title="מגזין" href="/c/magazine" />
                  <div className="space-y-3">
                    {magazineFinal.map(p => (
                      <ListRowCompact key={p.id} post={p} />
                    ))}
                  </div>
                </div>
              </div>

              {/* Sidebar (sticky, NO internal scrolling) */}
              <StickySidebar containerId="main-content">
                <div className="space-y-8">
                  {/* Recent posts FIRST */}
                  <div className="bg-slate-100/70 rounded-2xl p-5 shadow-sm border border-black/10">
                    <Link href="/search?sort=recent" className="text-base font-black mb-4 inline-flex hover:text-sky-700 transition-colors">פוסטים אחרונים</Link>
                    <div className="space-y-3">
                      {recentMini.slice(0, 8).map(p => (
                        <RecentMiniRow key={p.id} post={p} />
                      ))}
                    </div>
                  </div>

                  {/* Writers of week */}
                  <div className="bg-slate-100/70 rounded-2xl p-5 shadow-sm border border-black/10">
                    <div className="text-base font-black mb-4">כותבי השבוע</div>

                    {writerScores.length ? (
                      <div className="space-y-3">
                        {writerScores.map((w, idx) => (
                          <div key={`${w.username ?? w.name}`} className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                              <div className="w-7 h-7 rounded-full bg-black/5 border border-black/10 flex items-center justify-center text-xs font-black text-gray-700">
                                {idx + 1}
                              </div>

                              {w.username ? (
                                <Link href={`/u/${w.username}`} className="group/writer inline-flex items-center gap-2">
                                  <Avatar url={w.avatar_url} name={w.name} size={36} />
                                  <span className="text-sm font-bold transition-colors group-hover/writer:text-sky-700">
                                    {w.name}
                                  </span>
                                </Link>
                              ) : (
                                <div className="inline-flex items-center gap-2">
                                  <Avatar url={w.avatar_url} name={w.name} size={36} />
                                  <span className="text-sm font-bold">{w.name}</span>
                                </div>
                              )}
                            </div>

                            <div dir="ltr" className="text-xs text-gray-700 flex items-center gap-2">
                              {w.gold ? <span>🥇 {w.gold}</span> : null}
                              {w.silver ? <span>🥈 {w.silver}</span> : null}
                              {w.bronze ? <span>🥉 {w.bronze}</span> : null}
                              {!w.gold && !w.silver && !w.bronze ? <span>❤️ {w.reactions}</span> : null}
                            </div>
                          </div>
                        ))}
                        
                      </div>
                    ) : (
                      <div className="text-sm text-gray-500">אין עדיין פעילות לשבוע הזה.</div>
                    )}

                    <div className="mt-5">
                      <HomeWriteCTA />
                    </div>
                  </div>
                </div>
              </StickySidebar>
            </div>
          </div>
        )}
      </div>
    </main>
  )
}
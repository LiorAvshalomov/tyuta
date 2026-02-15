import Link from 'next/link'
import Image from 'next/image'
import { supabase } from '@/lib/supabaseClient'
import { formatDateTimeHe, formatRelativeHe } from '@/lib/time'
import { getPostDisplayDate } from '@/lib/posts'
import StickySidebar from '@/components/StickySidebar'

type PostRow = {
  id: string
  title: string
  slug: string
  created_at: string
  published_at: string | null
  excerpt: string | null
  cover_image_url: string | null
  channel: { slug: string; name_he: string }[] | null
  author: { username: string; display_name: string | null }[] | null
  subcategory: { id: number; slug: string; name_he: string }[] | { id: number; slug: string; name_he: string } | null
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

type CardPost = {
  id: string
  slug: string
  title: string
  excerpt: string | null
  created_at: string
  published_at: string | null
  cover_image_url: string | null
  channel_slug: string | null
  channel_name: string | null
  subcategory_name: string | null
  author_username: string | null
  author_name: string
  tags: { name_he: string; slug: string }[]
  medals: { gold: number; silver: number; bronze: number }
  votesByKey: Record<string, number>
  score: number
}

function medalsScore(m: { gold: number; silver: number; bronze: number }) {
  return m.gold * 3 + m.silver * 2 + m.bronze
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

function SectionTitle({ title, href }: { title: string; href?: string }) {
  return (
     <div className="mb-3 overflow-hidden rounded-2xl border bg-white/70 shadow-sm backdrop-blur supports-[backdrop-filter]:bg-white/60">
      <div className="bg-black/5 px-4 py-2 font-bold">
        {href ? (
          <Link href={href} className="hover:underline">
            {title}
          </Link>
        ) : (
          title
        )}
      </div>
    </div>
  )
}

function CoverFrame({
  src,
  w,
  h,
  rounded = 'rounded',
  alt = '',
  sizes,
}: {
  src: string | null
  w: number
  h: number
  rounded?: string
  alt?: string
  sizes?: string
}) {
  if (!src || !src.trim()) {
    return <div className={`${rounded} border bg-neutral-100`} style={{ width: w, height: h }} />
  }
  return (
    <div className={`relative ${rounded} overflow-hidden border bg-white`} style={{ width: w, height: h }}>
      <Image
        src={src}
        alt={alt}
        fill
        sizes={sizes ?? `${w}px`}
        className="object-cover"
      />
    </div>
  )
}

function hasAnyMedals(m: { gold: number; silver: number; bronze: number }) {
  return (m.gold ?? 0) + (m.silver ?? 0) + (m.bronze ?? 0) > 0
}

function MedalsCompact({ medals }: { medals: { gold: number; silver: number; bronze: number } }) {
  const items: { emoji: string; count: number }[] = []
  if (medals.gold > 0) items.push({ emoji: '🥇', count: medals.gold })
  if (medals.silver > 0) items.push({ emoji: '🥈', count: medals.silver })
  if (medals.bronze > 0) items.push({ emoji: '🥉', count: medals.bronze })
  if (items.length === 0) return null
  const shown = items.slice(0, 2)
  const extra = items.length - shown.length
  return (
    <div dir="ltr" className="mt-1 flex items-center gap-1 text-[11px] text-muted-foreground/70">
      {shown.map(m => (
        <span key={m.emoji} className="shrink-0">{m.emoji} {m.count}</span>
      ))}
      {extra > 0 ? <span className="shrink-0 rounded-full bg-black/5 px-1.5 text-[10px]">+{extra}</span> : null}
    </div>
  )
}

/** הגדול - בצד ימין, גובה קבוע */
function FeaturedTopCard({ post }: { post: CardPost }) {
  const showMedals = hasAnyMedals(post.medals)

  return (
    <article className="h-[420px] rounded border bg-white p-4 shadow-sm hover:shadow-md">
      <div className="flex h-full flex-col">
        <div className="text-right">
          <div className="flex items-start justify-between gap-3">
            {showMedals ? (
              <div dir="ltr"className="shrink-0 flex items-center gap-2 text-xs text-muted-foreground">
                {post.medals.gold ? <span>🥇 {post.medals.gold}</span> : null}
                {post.medals.silver ? <span>🥈 {post.medals.silver}</span> : null}
                {post.medals.bronze ? <span>🥉 {post.medals.bronze}</span> : null}
              </div>
            ) : null}

            <Link
              href={`/post/${post.slug}`}
              className="min-w-0 flex-1 block text-2xl font-extrabold leading-tight break-words line-clamp-2 hover:underline text-right">
              {post.title}
            </Link>
          </div>

          <div className="mt-1 text-sm text-muted-foreground">
            מאת:{' '}
            {post.author_username ? (
              <Link href={`/u/${post.author_username}`} className="text-blue-700 hover:underline">
                {post.author_name}
              </Link>
            ) : (
              <span>{post.author_name}</span>
            )}
          </div>
        </div>

        <div className="mt-3 flex justify-start">
          <Link href={`/post/${post.slug}`} className="text-xs text-blue-700 underline">
            קרא עוד
          </Link>
        </div>

        <div className="mt-2 flex flex-1 items-start justify-end">
          <Link href={`/post/${post.slug}`} className="inline-block">
            <CoverFrame src={post.cover_image_url} w={400} h={280} rounded="rounded" alt={post.title} sizes="(max-width: 768px) 100vw, 400px"/>
          </Link>
        </div>

        {post.tags.length ? (
          <div className="mt-3 flex flex-wrap items-center justify-end gap-2 text-xs">
            <span className="text-muted-foreground">תגיות:</span>
            {post.tags.slice(0, 4).map(t => (
              <span key={t.slug} className="text-emerald-700">
                {t.name_he}
              </span>
            ))}
          </div>
        ) : null}
      </div>
    </article>
  )
}

/** קטן - לשמאל, גובה חצי מהעמודה */
function SmallTopCard({ post }: { post: CardPost }) {
  const showMedals = hasAnyMedals(post.medals)

  return (
    <article className="h-full rounded border bg-white p-3 shadow-sm hover:shadow-md">
      <div className="flex h-full flex-col">
        <div className="flex flex-row-reverse items-start gap-3">
          <Link href={`/post/${post.slug}`} className="inline-block">
            <CoverFrame src={post.cover_image_url} w={220} h={150} rounded="rounded" alt={post.title}/>
          </Link>

          <div className="min-w-0 flex-1 text-right">
            <div className="flex items-start justify-between gap-2">
              {showMedals ? (
                <div dir="ltr"className="shrink-0 flex items-center gap-2 text-[11px] text-muted-foreground">
                  {post.medals.gold ? <span>🥇 {post.medals.gold}</span> : null}
                  {post.medals.silver ? <span>🥈 {post.medals.silver}</span> : null}
                  {post.medals.bronze ? <span>🥉 {post.medals.bronze}</span> : null}
                </div>
              ) : null}

              <Link
                href={`/post/${post.slug}`}
                className="min-w-0 flex-1 block text-sm font-bold leading-snug line-clamp-2 hover:underline text-right">
                {post.title}
              </Link>
            </div>

            <div className="mt-1 text-xs text-muted-foreground">
              מאת:{' '}
              {post.author_username ? (
                <Link href={`/u/${post.author_username}`} className="text-blue-700 hover:underline">
                  {post.author_name}
                </Link>
              ) : (
                <span>{post.author_name}</span>
              )}
            </div>
          </div>
        </div>

        <div className="mt-auto pt-2">
          <div className="flex justify-start">
            <Link href={`/post/${post.slug}`} className="text-xs text-blue-700 underline">
              קרא עוד
            </Link>
          </div>
        </div>
      </div>
    </article>
  )
}

function TileCard({ post }: { post: CardPost }) {
  return (
    <Link href={`/post/${post.slug}`} className="block overflow-hidden rounded border bg-white shadow-sm hover:shadow-md">
      <div className="flex justify-center p-2">
        <CoverFrame src={post.cover_image_url} w={210} h={140} rounded="rounded" alt={post.title}/>
      </div>
      <div className="px-3 pb-3 text-center">
        <div className="text-sm font-bold line-clamp-2">{post.title}</div>
      </div>
    </Link>
  )
}

function ListRow({ post }: { post: CardPost }) {
  const showMedals = hasAnyMedals(post.medals)

  return (
    <article className="rounded border bg-white p-3 shadow-sm hover:shadow-md">
      <div className="flex flex-row-reverse items-start gap-3">
        <Link href={`/post/${post.slug}`} className="inline-block">
          <CoverFrame src={post.cover_image_url} w={165} h={110} rounded="rounded" alt={post.title}/>
        </Link>

        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-3">
            {showMedals ? (
              <div dir="ltr"className="shrink-0 flex items-center gap-2 text-[11px] text-muted-foreground">
                {post.medals.gold ? <span>🥇 {post.medals.gold}</span> : null}
                {post.medals.silver ? <span>🥈 {post.medals.silver}</span> : null}
                {post.medals.bronze ? <span>🥉 {post.medals.bronze}</span> : null}
              </div>
            ) : null}

            <Link
              href={`/post/${post.slug}`}
              className="min-w-0 flex-1 block text-base font-bold leading-snug break-words line-clamp-2 hover:underline text-right">
              {post.title}
            </Link>
          </div>

          <div className="mt-1 text-xs text-muted-foreground">
            מאת:{' '}
            {post.author_username ? (
              <Link href={`/u/${post.author_username}`} className="text-blue-700 hover:underline">
                {post.author_name}
              </Link>
            ) : (
              <span>{post.author_name}</span>
            )}

            <span className="mx-2">•</span>
            <span title={formatDateTimeHe(post.created_at)}>{formatRelativeHe(post.created_at)}</span>

            {post.channel_name && post.channel_slug ? (
              <>
                <span className="mx-2">•</span>
                <Link href={`/c/${post.channel_slug}`} className="hover:underline">
                  {post.channel_name}
                </Link>
              </>
            ) : post.channel_name ? (
              <>
                <span className="mx-2">•</span>
                <span>{post.channel_name}</span>
              </>
            ) : null}
          </div>

          {post.excerpt ? (
            <div className="mt-2 text-sm leading-6 text-foreground/80 line-clamp-2 lg:line-clamp-none lg:overflow-visible lg:text-clip">{post.excerpt}</div>
          ) : null}

          {post.tags.length ? (
            <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
              <span className="text-muted-foreground">תגיות:</span>
              {post.tags.slice(0, 3).map(t => (
                <span key={t.slug} className="text-emerald-700">
                  {t.name_he}
                </span>
              ))}
            </div>
          ) : null}
        </div>
      </div>
    </article>
  )
}

function RecentMiniRow({ post }: { post: CardPost }) {
  return (
    <div className="flex flex-col rounded border bg-white p-2 hover:shadow-sm">
      <Link href={`/post/${post.slug}`} className="block">
        <div className="flex flex-row-reverse items-stretch gap-2">
          <CoverFrame src={post.cover_image_url} w={72} h={72} rounded="rounded" alt={post.title}/>
          <div className="min-w-0 flex-1 flex flex-col">
            <div className="text-xs font-bold leading-snug line-clamp-2">{post.title}</div>
            <MedalsCompact medals={post.medals} />
            {post.excerpt ? (
              <div className="mt-1 text-[11px] text-muted-foreground line-clamp-2">{post.excerpt}</div>
            ) : (
              <div className="mt-1 h-[18px]" aria-hidden="true" />
            )}
          </div>
        </div>
      </Link>

      <div className="mt-auto pt-1 text-[11px] text-muted-foreground">
        {post.author_name}
        {post.channel_name ? (
          <>
            <span className="mx-1">•</span>
            <span>{post.channel_name}</span>
          </>
        ) : null}
        <span className="mx-1">•</span>
        <span title={formatDateTimeHe(post.created_at)}>{formatRelativeHe(post.created_at)}</span>
      </div>
    </div>
  )
}

type TileConfig = { key: string; label: string }

export default async function ChannelFeedPage({
  channelSlug,
  channelName,
  subtitle,
  tiles,
  subcategories,
}: {
  channelSlug: 'release' | 'stories' | 'magazine'
  channelName: string
  subtitle?: string
  tiles: TileConfig[]
  subcategories?: string[]
}) {
    const { data: channelRow, error: channelErr } = await supabase
    .from('channels')
    .select('id, slug, name_he')
    .eq('slug', channelSlug)
    .maybeSingle()

  if (channelErr || !channelRow?.id) {
    return (
      <main className="min-h-screen bg-neutral-50"dir="rtl">
        <div className="mx-auto max-w-6xl px-4 py-10">
          <h1 className="text-xl font-bold">לא נמצאה קטגוריה</h1>
          <div className="mt-2 text-sm text-muted-foreground">
            slug: <span dir="ltr">{channelSlug}</span>
          </div>
          {channelErr ? (
            <pre className="mt-4 rounded border bg-white p-4 text-xs">{JSON.stringify(channelErr, null, 2)}</pre>
          ) : null}
        </div>
      </main>
    )
  }

  const { data: rows, error } = await supabase
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
      channel:channels ( slug, name_he ),
      author:profiles!posts_author_id_fkey ( username, display_name ),
      subcategory:tags!posts_subcategory_tag_fk ( id, name_he, slug ),
      post_tags:post_tags!fk_post_tags_post_id_posts ( tag:tags!fk_post_tags_tag_id_tags ( name_he, slug ) )
      `
    )
    .is('deleted_at', null)
    .eq('status', 'published')
    .eq('channel_id', channelRow.id)
    .order('published_at', { ascending: false })
    .limit(250)

  if (error) {
    return (
      <main className="min-h-screen bg-neutral-50"dir="rtl">
        <div className="mx-auto max-w-6xl px-4 py-10">
          <h1 className="text-xl font-bold">שגיאה בטעינת {channelName}</h1>
          <pre className="mt-4 rounded border bg-white p-4 text-xs">{JSON.stringify(error, null, 2)}</pre>
        </div>
      </main>
    )
  }

  const posts = (rows ?? []) as PostRow[]
  const postIds = posts.map(p => p.id)

  const votesByPost = new Map<string, Record<string, number>>()
  const medalsByPost = new Map<string, { gold: number; silver: number; bronze: number }>()

  if (postIds.length) {
    // votes by key (used for category picking)
    const { data: sums } = await supabase
      .from('post_reaction_summary')
      .select('post_id, reaction_key, votes')
      .in('post_id', postIds)

    ;((sums ?? []) as Array<{ post_id: string; reaction_key: string | null; votes: number | null }>).forEach(r => {
      if (!r.post_id) return
      const key = (r.reaction_key ?? '').trim()
      if (!key) return
      const prev = votesByPost.get(r.post_id) ?? {}
      prev[key] = (prev[key] ?? 0) + (r.votes ?? 0)
      votesByPost.set(r.post_id, prev)
    })

    // ALL-TIME medals for post cards (display)
    const { data: mrows, error: mErr } = await supabase
      .from('post_medals_all_time')
      .select('post_id, gold, silver, bronze')
      .in('post_id', postIds)

    if (mErr) {
      console.error('post_medals_all_time error:', mErr)
    }

    ;((mrows ?? []) as Array<{ post_id: string; gold: number; silver: number; bronze: number }>).forEach(r => {
      medalsByPost.set(r.post_id, {
        gold: r.gold ?? 0,
        silver: r.silver ?? 0,
        bronze: r.bronze ?? 0,
      })
    })
  }

  const cardPostsAll: CardPost[] = posts.map(p => {
    const channel = firstRel(p.channel)
    const author = firstRel(p.author)
    const subcat = firstRel(p.subcategory)

    const tags = (p.post_tags ?? [])
      .flatMap(pt => {
        const t = firstRel(pt.tag)
        return t ? [t] : []
      })
      .map(t => ({ name_he: t.name_he, slug: t.slug }))

    const medals = medalsByPost.get(p.id) ?? { gold: 0, silver: 0, bronze: 0 }
    const votesMap = votesByPost.get(p.id) ?? {}

    return {
      id: p.id,
      slug: p.slug,
      title: p.title,
      excerpt: p.excerpt,
      created_at: p.created_at,
      published_at: p.published_at,
      cover_image_url: p.cover_image_url,
      channel_slug: channel?.slug ?? null,
      channel_name: channel?.name_he ?? null,
      subcategory_name: subcat?.name_he ?? null,
      author_username: author?.username ?? null,
      author_name: author?.display_name ?? author?.username ?? 'אנונימי',
      tags,
      medals,
      votesByKey: votesMap,
      score: medalsScore(medals),
    }
  })

  const cardPosts = cardPostsAll.filter(p => p.channel_slug === channelSlug)
  const byRecent = [...cardPosts].sort(
    (a, b) => new Date(getPostDisplayDate(b)).getTime() - new Date(getPostDisplayDate(a)).getTime()
  )
  const byScore = [...cardPosts].sort(
    (a, b) => b.score - a.score || new Date(getPostDisplayDate(b)).getTime() - new Date(getPostDisplayDate(a)).getTime()
  )

  // --- TOP BLOCK (3 posts) ---
  const used = new Set<string>()
  const featured = byScore[0] ?? null
  if (featured) used.add(featured.id)
  const leftTwo = takeUnique(byScore, 2, used)

  // --- 5 TILES by reaction_key (config-driven) ---
  const topByReaction = (reactionKey: string) => {
    const arr = [...cardPosts].sort((a, b) => {
      const av = a.votesByKey[reactionKey] ?? 0
      const bv = b.votesByKey[reactionKey] ?? 0
      if (bv !== av) return bv - av
      return (b.score - a.score) || (new Date(getPostDisplayDate(b)).getTime() - new Date(getPostDisplayDate(a)).getTime())
    })
    return arr[0] ?? null
  }

  const tilePosts = tiles.map(t => ({ ...t, post: topByReaction(t.key) }))

  // Sidebar: recent posts in this channel
  const recentMini = byRecent.slice(0, 10)

  // Writers of the month in this channel
  const NOW = new Date()
  const monthAgo = new Date(NOW.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString()

  const writersMonth = (() => {
    const map = new Map<string, { username: string | null; name: string; score: number; gold: number; silver: number; bronze: number }>()
    for (const p of cardPosts) {
      if (getPostDisplayDate(p) < monthAgo) continue
      const key = p.author_username ?? p.author_name ?? 'anon'
      const prev = map.get(key) ?? { username: p.author_username, name: p.author_name, score: 0, gold: 0, silver: 0, bronze: 0 }
      prev.gold += p.medals.gold
      prev.silver += p.medals.silver
      prev.bronze += p.medals.bronze
      prev.score += p.score
      map.set(key, prev)
    }
    return [...map.values()].sort((a, b) => b.score - a.score).slice(0, 5)
  })()

  return (
    <main className="min-h-screen"dir="rtl">
      <div className="mx-auto max-w-6xl px-4 py-8">
        <div className="mb-6">
          <h1 className="text-3xl font-extrabold">{channelName}</h1>
          {subtitle ? <div className="mt-1 text-sm text-muted-foreground">{subtitle}</div> : null}

          {subcategories?.length ? (
            <div className="mt-4 flex flex-wrap items-center gap-2">
              {subcategories.map(s => (
                <span
                  key={s}
                  className="rounded-full border bg-white/70 px-3 py-1 text-sm">
                  {s}
                </span>
              ))}
            </div>
          ) : null}
        </div>

        {/* A) TOP 3 POSTS */}
        <div className="flex flex-col gap-4 lg:flex-row"dir="rtl">
          <div className="lg:w-1/2">{featured ? <FeaturedTopCard post={featured} /> : null}</div>

          <div className="lg:w-1/2">
            <div className="flex h-[420px] flex-col gap-4">
              {leftTwo.length ? (
                leftTwo.map(p => (
                  <div key={p.id} className="flex-1">
                    <SmallTopCard post={p} />
                  </div>
                ))
              ) : (
                <div className="flex h-[420px] items-center justify-center rounded border bg-white text-sm text-muted-foreground">
                  אין עדיין פוסטים להצגה.
                </div>
              )}
            </div>
          </div>
        </div>



        {/* B) 5 TILES */}
        <div className="mt-6 grid grid-cols-2 gap-4 md:grid-cols-5">
          {tilePosts.map(t => (
            <div key={t.key}>
              <div className="mb-2 text-center text-sm font-bold">{t.label}</div>
              {t.post ? <TileCard post={t.post} /> : <div className="rounded border bg-white p-4 text-center text-sm text-muted-foreground">אין</div>}
            </div>
          ))}
        </div>

        {/* MAIN + SIDEBAR */}
        <div className="mt-8 grid grid-cols-1 gap-6 lg:grid-cols-[1fr_380px] lg:items-start"dir="rtl">
          <div className="space-y-8">
            <section>
              {subcategories?.length ? (
                <div className="space-y-8">
                  {subcategories.map(sc => {
                    const items = byRecent.filter(p => p.subcategory_name === sc)
                    if (!items.length) return null
                    return (
                      <div key={sc}>
                        <SectionTitle title={sc} />
                        <div className="space-y-3">
                          {items.slice(0, 30).map(p => (
                            <ListRow key={p.id} post={p} />
                          ))}
                        </div>
                      </div>
                    )
                  })}
                </div>
              ) : (
                <div>
                  <SectionTitle title={`כל הפוסטים ב${channelName}`} />
                  <div className="space-y-3">
                    {byRecent.length ? (
                      byRecent.slice(0, 30).map(p => <ListRow key={p.id} post={p} />)
                    ) : (
                      <div className="rounded border bg-white p-6 text-sm text-muted-foreground">אין עדיין פוסטים.</div>
                    )}
                  </div>
                </div>
              )}
            </section>
          </div>

          <StickySidebar containerId="main-content"className="space-y-6">
            <section>
              <SectionTitle title="פוסטים אחרונים"href={`/search?sort=recent&channel=${encodeURIComponent(channelSlug)}`} />
              <div className="space-y-2">
                {recentMini.length ? (
                  recentMini.map(p => <RecentMiniRow key={p.id} post={p} />)
                ) : (
                  <div className="rounded border bg-white p-6 text-sm text-muted-foreground">אין עדיין פוסטים.</div>
                )}
              </div>
            </section>

            <section>
              <SectionTitle title={`כותבי החודש ב${channelName}`} />
              <div className="space-y-2 rounded border bg-white p-3">
                {writersMonth.length ? (
                  writersMonth.map(w => (
                    <div key={w.username ?? w.name} className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        {w.username ? (
                          <Link href={`/u/${w.username}`} className="font-bold hover:underline">
                            {w.name}
                          </Link>
                        ) : (
                          <div className="font-bold">{w.name}</div>
                        )}
                        <div dir="ltr"className="mt-1 text-xs text-muted-foreground">
                          🥇 {w.gold}  🥈 {w.silver}  🥉 {w.bronze}
                        </div>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="text-sm text-muted-foreground">עדיין אין נתונים לחודש הזה.</div>
                )}
              </div>
            </section>
          </StickySidebar>
        </div>
      </div>
    </main>
  )
}

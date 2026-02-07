'use client'

import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import { useEffect, useMemo, useState } from 'react'
import type { ComponentProps } from 'react'

import { supabase } from '@/lib/supabaseClient'
import Avatar from '@/components/Avatar'
import RichText from '@/components/RichText'
import PostShell from '@/components/PostShell'
import PostOwnerMenu from '@/components/PostOwnerMenu'
import PostReactions from '@/components/PostReactions'
import PostComments from '@/components/PostComments'
import FollowButton from '@/components/FollowButton'
import SavePostButton from '@/components/SavePostButton'
import SharePostButton from '@/components/SharePostButton'
import { formatDateTimeHe, formatRelativeHe } from '@/lib/time'

type RichNode = ComponentProps<typeof RichText>['content']

type Author = {
  id: string
  username: string | null
  display_name: string | null
  avatar_url: string | null
}

type Channel = { name_he: string | null }

type PostRow = {
  id: string
  slug: string
  title: string | null
  excerpt: string | null
  cover_image_url: string | null
  status: string | null
  published_at: string | null
  content_json: unknown
  created_at: string
  author_id: string
  channel_id: number | null
  author: Author[] | Author | null
  channel: Channel[] | Channel | null
}

type SidebarPost = {
  id: string
  slug: string
  title: string | null
  excerpt: string | null
  cover_image_url: string | null
  published_at: string | null
  created_at: string
  author_id: string
  author: Author[] | Author | null
}

function pickAuthor(a: Author[] | Author | null | undefined): Author | null {
  if (!a) return null
  return Array.isArray(a) ? (a[0] ?? null) : a
}

function trunc(s: string, n: number) {
  const v = (s ?? '').trim()
  return v.length > n ? `${v.slice(0, n)}…` : v
}


function SidebarSection({
  title,
  action,
  children,
}: {
  title: string
  action?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <div className="rounded-2xl border border-neutral-200/60 bg-white/05 shadow-sm">
      <div className="flex flex-row-reverse items-center justify-between gap-3 px-4 py-3">
        {action ? <div className="shrink-0">{action}</div> : null}
        <h3 className="inline-flex items gap-2 rounded-xl  border border-neutral-100/70 bg-neutral-200/70 px-3 py-1.5 text-[12px] font-semibold text-slate-600">{title}</h3>
      </div>

      <div className="mx-4 border-b border-neutral-100" />

      <div className="px-3 pb-3 pt-2">
        <div className="space-y-1.5">{children}</div>
      </div>
    </div>
  )
}

function SidebarPostItem({
  post,
  showAuthor,
  isMobile,
}: {
  post: SidebarPost
  showAuthor?: boolean
  isMobile?: boolean
}) {
  const router = useRouter()

  const pAuthor = pickAuthor(post.author)
  const authorName = pAuthor?.display_name ?? 'אנונימי'
  const authorUsername = pAuthor?.username ?? null
  const date = post.published_at ?? post.created_at

  const goPost = () => router.push(`/post/${post.slug}`)

  return (
    <div
      role="link"
      tabIndex={0}
      onClick={goPost}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') goPost()
      }}
      className="group flex items-start justify-between gap-2.5 rounded-xl border border-neutral-200/70 bg-white/60 p-2 transition-colors duration-150 hover:bg-neutral-100/60 cursor-pointer"
    >
      {/* טקסט (ימין) */}
      <div className="min-w-0 flex-1 text-right">
        <div className="text-[14px] font-black leading-5 text-neutral-950 group-hover:text-neutral-950">
          {trunc(post.title ?? 'ללא כותרת', isMobile ? 35 : 25)}
        </div>

        <div className="mt-0.5 min-h-[2rem] text-[13px] leading-5 text-neutral-700">
          {post.excerpt ? trunc(post.excerpt, isMobile ? 50 : 30) : ''}
        </div>

        <div className="mt-1 flex items-center justify-start gap-2 text-[11px] text-neutral-600 whitespace-nowrap">
          {showAuthor ? (
            authorUsername ? (
              <Link
                href={`/u/${authorUsername}`}
                className="font-extrabold text-neutral-900 hover:text-neutral-950 hover:underline"
                onClick={(e) => e.stopPropagation()}
              >
                {authorName}
              </Link>
            ) : (
              <span className="font-extrabold text-neutral-900">{authorName}</span>
            )
          ) : null}
          {showAuthor ? <span className="text-neutral-400">·</span> : null}
          <span className="text-neutral-600">{formatRelativeHe(date)}</span>
        </div>
      </div>

      {/* תמונה (שמאל) */}
      <div className="h-20 w-20 shrink-0 overflow-hidden rounded-2xl bg-neutral-100 ring-1 ring-black/5">
        {post.cover_image_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={post.cover_image_url} alt="" className="h-full w-full object-cover" loading="lazy" />
        ) : null}
      </div>
    </div>
  )
}

function NotFoundPost() {
  return (
    <main className="min-h-screen bg-neutral-50" dir="rtl">
      <div className="mx-auto max-w-5xl px-4 py-12">
        <div className="rounded-3xl border bg-white p-10 text-center shadow-sm">
          <h1 className="text-3xl font-bold tracking-tight">לא נמצא פוסט</h1>
          <p className="mt-3 text-sm text-muted-foreground">הפוסט לא קיים או הוסר.</p>

          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <Link href="/" className="rounded-full bg-neutral-900 px-4 py-2 text-sm text-white hover:bg-neutral-800">
              לדף הבית
            </Link>
            <Link href="/notebook" className="rounded-full border bg-white px-4 py-2 text-sm hover:bg-neutral-50">
              למחברת
            </Link>
          </div>
        </div>
      </div>
    </main>
  )
}

export default function PostPage() {
  const params = useParams()
  const slug = useMemo(() => (typeof params?.slug === 'string' ? params.slug : ''), [params])

  const [loading, setLoading] = useState(true)
  const [notFoundFlag, setNotFoundFlag] = useState(false)
  const [post, setPost] = useState<PostRow | null>(null)
  const [sidebarLoading, setSidebarLoading] = useState(false)
  const [moreFromAuthor, setMoreFromAuthor] = useState<SidebarPost[]>([])
  const [hotInChannel, setHotInChannel] = useState<SidebarPost[]>([])
  const [myUserId, setMyUserId] = useState<string | null>(null)
  const [medals, setMedals] = useState<{ gold: number; silver: number; bronze: number }>({ gold: 0, silver: 0, bronze: 0 })


  const [isMobile, setIsMobile] = useState(false)

  

  useEffect(() => {
    // Tailwind breakpoint md=768
    const mq = window.matchMedia('(max-width: 767px)')
    const apply = () => setIsMobile(mq.matches)
    apply()
    mq.addEventListener?.('change', apply)
    return () => mq.removeEventListener?.('change', apply)
  }, [])

  useEffect(() => {
    let alive = true
    supabase.auth.getUser().then(({ data }) => {
      if (!alive) return
      setMyUserId(data.user?.id ?? null)
    })
    return () => {
      alive = false
    }
  }, [])

  // When navigating with a #comment-... hash, scroll to the comment (App Router sometimes won't).
  useEffect(() => {
    if (loading || !post) return
    if (typeof window === 'undefined') return

    const hash = window.location.hash
    if (!hash || !hash.startsWith('#comment-')) return

    const id = hash.slice(1)

    // Comments may render after data fetch; retry a few times until the element exists.
    let attempts = 0
    let cancelled = false

    const tryScroll = () => {
      if (cancelled) return
      const el = document.getElementById(id)
      if (el) {
        el.scrollIntoView({ block: 'start', behavior: 'smooth' })
        return
      }
      attempts += 1
      if (attempts < 20) {
        window.setTimeout(tryScroll, 120)
      }
    }

    window.setTimeout(tryScroll, 120)

    return () => {
      cancelled = true
    }
  }, [loading, post])

  useEffect(() => {
    if (!slug) return

    let cancelled = false

    const load = async () => {
      setLoading(true)
      setNotFoundFlag(false)
      setPost(null)
      setMoreFromAuthor([])
      setHotInChannel([])
      setSidebarLoading(false)

      const { data, error } = await supabase
        .from('posts')
        .select(
          `
          id,
          slug,
          title,
          excerpt,
          cover_image_url,
          status,
          published_at,
          content_json,
          created_at,
          author_id,
          channel_id,
          channel:channels ( name_he ),
          author:profiles!posts_author_id_fkey ( id, username, display_name, avatar_url )
        `
        )
        .is('deleted_at', null)
        .eq('status', 'published')
        .eq('slug', slug)
        .single()

      if (cancelled) return

      if (error || !data) {
        setNotFoundFlag(true)
        setLoading(false)
        return
      }

      const p = data as PostRow
      setPost(p)
      setLoading(false)

      setSidebarLoading(true)

      const sidebarPostSelect = `
        id,
        slug,
        title,
        excerpt,
        cover_image_url,
        published_at,
        created_at,
        author_id,
        author:profiles!posts_author_id_fkey ( id, username, display_name, avatar_url )
      `

      const [authorRes, hotRes] = await Promise.all([
        supabase
          .from('posts')
          .select(sidebarPostSelect)
          .is('deleted_at', null)
          .eq('status', 'published')
          .eq('author_id', p.author_id)
          .neq('id', p.id)
          .order('published_at', { ascending: false, nullsFirst: false })
          .limit(5),
        p.channel_id
          ? supabase.rpc('pendemic_hot_posts_smart_by_channel', {
              p_channel_id: p.channel_id,
              p_ref_ts: new Date().toISOString(),
              p_limit: 6,
            })
          : Promise.resolve({ data: [], error: null } as { data: { post_id: string }[]; error: null }),
      ])

      if (cancelled) return

      const uniqById = <T extends { id: string }>(arr: T[]) => {
        const seen = new Set<string>()
        const out: T[] = []
        for (const x of arr) {
          if (!x?.id) continue
          if (seen.has(x.id)) continue
          seen.add(x.id)
          out.push(x)
        }
        return out
      }

      const authorListRaw = (!authorRes.error && Array.isArray(authorRes.data))
        ? (authorRes.data as SidebarPost[])
        : []

      const authorList = uniqById(authorListRaw)
      setMoreFromAuthor(authorList)

      // פוסטים חמים בקטגוריה – via RPC (weekly → monthly → recent fallback, all server-side)
      const hotIds = (!hotRes.error && Array.isArray(hotRes.data))
        ? (hotRes.data as { post_id: string }[])
            .map(r => r.post_id)
            .filter(id => id !== p.id)
            .slice(0, 5)
        : []

      if (hotIds.length > 0) {
        const { data: hotPosts } = await supabase
          .from('posts')
          .select(sidebarPostSelect)
          .in('id', hotIds)

        if (!cancelled && hotPosts) {
          const byId = new Map((hotPosts as SidebarPost[]).map(x => [x.id, x]))
          const ordered = hotIds
            .map(id => byId.get(id))
            .filter((x): x is SidebarPost => !!x)
          setHotInChannel(ordered)
        }
      } else {
        setHotInChannel([])
      }

      setSidebarLoading(false)
    }

    void load()

    return () => {
      cancelled = true
    }
  }, [slug])

  if (loading) {
    return (
      <main className="min-h-screen bg-neutral-50" dir="rtl">
        <div className="mx-auto max-w-5xl px-4 py-12">
          <div className="text-sm text-muted-foreground">טוען…</div>
        </div>
      </main>
    )
  }

  if (notFoundFlag || !post) {
    return <NotFoundPost />
  }

  const author: Author | null = pickAuthor(post.author)

  const channelName: string | null = Array.isArray(post.channel)
    ? (post.channel[0]?.name_he ?? null)
    : (post.channel as Channel | null)?.name_he ?? null

  const authorName = author?.display_name ?? 'אנונימי'
  const authorUsername = author?.username ?? null

  const publishedAt = post.published_at ?? post.created_at

  const channelHref =
    post.channel_id === 1
      ? '/c/release'
      : post.channel_id === 2
        ? '/c/stories'
        : post.channel_id === 3
          ? '/c/magazine'
          : null

  const channelChipClass =
    post.channel_id === 1
      ? 'text-rose-700/90'
      : post.channel_id === 2
        ? 'text-indigo-700/90'
        : post.channel_id === 3
          ? 'text-emerald-700/90'
          : 'text-neutral-700'

  const hasMedals = medals.gold > 0 || medals.silver > 0 || medals.bronze > 0

  const header = (
    <div>
        <div className="flex items-start justify-between gap-3">
        <h1 className="min-w-0 flex-1 text-right text-[32px] sm:text-[36px] font-black tracking-tight text-neutral-950 break-words">
          {post.title ?? 'ללא כותרת'}
        </h1>
        {hasMedals && (
          <div dir="ltr" className="mt-2 flex shrink-0 items-center gap-2 text-sm">
            {medals.gold > 0 && <span>🥇 {medals.gold}</span>}
            {medals.silver > 0 && <span>🥈 {medals.silver}</span>}
            {medals.bronze > 0 && <span>🥉 {medals.bronze}</span>}
          </div>
        )}
        </div>
        {post.excerpt ? (
          <p className="mt-2 text-right text-[16px] leading-8 text-neutral-700">{post.excerpt}</p>
        ) : null}

        <div className="mt-10 flex items-start justify-start gap-3" dir="rtl">
          <Link href={`/u/${authorUsername}`} >
          <div className="shrink-0">
            <Avatar src={author?.avatar_url ?? null} name={authorName} size={52} />
          </div>
          </Link>

          <div className="min-w-0 text-right">
            <div className="text-[15px] font-extrabold text-neutral-950">
              {authorUsername ? (
                <Link href={`/u/${authorUsername}`} className="hover:underline">
                  {authorName}
                </Link>
              ) : (
                authorName
              )}
            </div>

            <div className="mt-1 text-[13px] text-neutral-600">
              {channelName && channelHref ? (
                <Link href={channelHref} className={`inline-flex items-center rounded-full  border-neutral-200/70 bg-neutral-100/70 px-0.5 py-0.5 text-[12px] font-semibold ${channelChipClass} hover:bg-neutral-200/60`}>
                  {channelName}
                </Link>
              ) : channelName ? (
                <span className={`inline-flex items-center rounded-full border border-neutral-200/70 bg-neutral-100/70 px-2.5 py-0.5 text-[12px] font-semibold ${channelChipClass}`}>{channelName}</span>
              ) : null}
              {channelName ? <span className="text-neutral-400"> · </span> : null}
              <span className="text-neutral-500">{formatDateTimeHe(publishedAt)}</span>
            </div>
          </div>
        </div>
    </div>
  )

  const sidebar = (
    <div className="space-y-6">
      <SidebarSection
        title="עוד מהכותב/ת"
        action={
          authorUsername ? (
            <Link href={`/u/${authorUsername}`} className="text-sm text-blue-700 hover:underline">
              לדף הפרופיל
            </Link>
          ) : null
        }
      >
        {sidebarLoading && moreFromAuthor.length === 0 ? (
          <div className="text-sm text-muted-foreground">טוען…</div>
        ) : moreFromAuthor.length === 0 ? (
          <div className="text-sm text-muted-foreground">אין עוד פוסטים.</div>
        ) : (
          moreFromAuthor.map((p) => <SidebarPostItem key={p.id} post={p} isMobile={isMobile} />)
        )}
      </SidebarSection>

      {post.channel_id ? (
        <SidebarSection
          title={`פוסטים חמים ב: ${channelName ?? 'קטגוריה'}`}
          action={
            channelHref ? (
              <Link href={channelHref} className=" text-sm text-blue-700 hover:underline">
                לדף הקטגוריה
              </Link>
            ) : null
          }
        >
          {sidebarLoading && hotInChannel.length === 0 ? (
            <div className="text-sm text-muted-foreground">טוען…</div>
          ) : hotInChannel.length === 0 ? (
            <div className="text-sm text-muted-foreground">אין עדיין פוסטים חמים.</div>
          ) : (
            hotInChannel.map((p) => <SidebarPostItem key={p.id} post={p} showAuthor isMobile={isMobile} />)
          )}
        </SidebarSection>
      ) : null}
    </div>
  )

  return (
    <PostShell
      header={header}
      actions={<PostOwnerMenu postId={post.id} postSlug={slug} authorId={post.author_id} />}
      sidebar={sidebar}
    >
      {/* תוכן – לב האתר */}
      <div className="mt-6 min-h-[45vh] pb-4">
        <RichText content={post.content_json as RichNode} />
      </div>

          <div className="flex flex-wrap items-center justify-between gap-2 mt-2 [&_button]:h-10 [&_button]:rounded-xl [&_button]:border [&_button]:border-neutral-200 [&_button]:transition-all [&_button]:duration-100 [&_button:hover]:bg-neutral-100/70 [&_button:active]:scale-[0.98]">
            <div className="flex items-center gap-2">
              <SavePostButton postId={post.id} />
              {author?.id && myUserId && author.id !== myUserId && authorUsername ? (
                <FollowButton targetUserId={author.id} targetUsername={authorUsername} />
              ) : null}
            </div>

            <div className="flex items-center gap-2">
              <SharePostButton url={typeof window !== 'undefined' ? window.location.href : ''} title={post.title ?? ''} />
            </div>
          </div>

      {/* אינטראקציות – מופרד לחלוטין מהטקסט */}
      
      <div className="-mx-6 sm:-mx-10 mt-6 space-y-6">
<div className='bg-neutral-100/70 border ' > 
<div>
        <div className="rounded-3xl border border-neutral-300 bg-neutral-200/70 p-5 sm:p-6">
          <PostReactions postId={post.id} channelId={post.channel_id ?? 0} authorId={post.author_id} onMedalsChange={setMedals} />
        </div>
        <div className="mt-0.5 "></div>
        </div>
        <div className="rounded-3xl border border-neutral-200 bg-neutral-100/70 p-1 sm:p-2">
          <PostComments postId={post.id} postSlug={slug} postTitle={post.title ?? ''} />
        </div>
        </div>
      </div>
    </PostShell>
  )
}

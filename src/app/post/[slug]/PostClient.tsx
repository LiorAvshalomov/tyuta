'use client'

import Link from 'next/link'
import dynamic from 'next/dynamic'
import { useParams, useRouter, useSearchParams } from 'next/navigation'
import { useEffect, useMemo, useRef, useState } from 'react'
import type { ComponentProps } from 'react'

import { supabase } from '@/lib/supabaseClient'
import Avatar from '@/components/Avatar'
import RichText from '@/components/RichText'
import PostShell from '@/components/PostShell'
import PostOwnerMenu from '@/components/PostOwnerMenu'
import PostReactions from '@/components/PostReactions'
const PostComments = dynamic(() => import('@/components/PostComments'))
import FollowButton from '@/components/FollowButton'
import SavePostButton from '@/components/SavePostButton'
import SharePostButton from '@/components/SharePostButton'
import { formatDateTimeHe, formatRelativeHe } from '@/lib/time'
import AuthorHover from '@/components/AuthorHover'
import { coverProxySrc } from '@/lib/coverUrl'
import type { PostInitialData } from './page'

type RichNode = ComponentProps<typeof RichText>['content']

type Author = {
  id: string
  username: string | null
  display_name: string | null
  avatar_url: string | null
}

type Channel = { name_he: string | null; slug: string | null }

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
  subcategory_tag_id: number | null
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
    <div className="rounded-2xl border border-neutral-200/60 dark:border-border bg-white/05 dark:bg-card shadow-sm">
      <div className="flex flex-row-reverse items-center justify-between gap-3 px-4 py-3">
        {action ? <div className="shrink-0">{action}</div> : null}
        <h3 className="inline-flex items gap-2 rounded-xl border border-neutral-100/70 dark:border-border/50 bg-neutral-200/70 dark:bg-muted px-3 py-1.5 text-[12px] font-semibold text-slate-600 dark:text-muted-foreground">{title}</h3>
      </div>

      <div className="mx-4 border-b border-neutral-100 dark:border-border" />

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
  const coverSrc = coverProxySrc(post.cover_image_url)
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
      className="group flex items-start justify-between gap-2.5 rounded-xl border border-neutral-200/70 dark:border-border bg-white/60 dark:bg-card/50 p-2 transition-colors duration-150 hover:bg-neutral-100/60 dark:hover:bg-muted cursor-pointer"
    >
      {/* טקסט (ימין) */}
      <div className="min-w-0 flex-1 text-right">
        <div className="text-[14px] font-black leading-5 text-neutral-950 dark:text-foreground group-hover:text-neutral-950 dark:group-hover:text-foreground">
          {trunc(post.title ?? 'ללא כותרת', isMobile ? 35 : 25)}
        </div>

        <div className="mt-0.5 min-h-[2rem] text-[13px] leading-5 text-neutral-700 dark:text-muted-foreground">
          {post.excerpt ? trunc(post.excerpt, isMobile ? 50 : 30) : ''}
        </div>

        <div className="mt-1 flex items-center justify-start gap-2 text-[11px] text-neutral-600 dark:text-muted-foreground whitespace-nowrap">
          {showAuthor ? (
            authorUsername ? (
              <AuthorHover username={authorUsername}>
                <Link
                  href={`/u/${authorUsername}`}
                  className="inline-flex items-center gap-1.5 font-extrabold text-neutral-900 dark:text-foreground hover:text-neutral-950 dark:hover:text-foreground hover:underline"
                  onClick={(e) => e.stopPropagation()}
                >
                  <Avatar src={pAuthor?.avatar_url ?? null} name={authorName} size={16} />
                  {authorName}
                </Link>
              </AuthorHover>
            ) : (
              <span className="inline-flex items-center gap-1.5 font-extrabold text-neutral-900 dark:text-foreground">
                <Avatar src={pAuthor?.avatar_url ?? null} name={authorName} size={16} />
                {authorName}
              </span>
            )
          ) : null}
          {showAuthor ? <span className="text-neutral-400 dark:text-muted-foreground">·</span> : null}
          <span className="text-neutral-600 dark:text-muted-foreground">{formatRelativeHe(date)}</span>
        </div>
      </div>

      {/* תמונה (שמאל) */}
      <div className="h-20 w-20 shrink-0 overflow-hidden rounded-2xl bg-neutral-100 dark:bg-muted ring-1 ring-black/5">
        {coverSrc ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={coverSrc} alt="" className="h-full w-full object-cover" loading="lazy" />
        ) : null}
      </div>
    </div>
  )
}

function NotFoundPost() {
  return (
    <main className="min-h-screen bg-neutral-50 dark:bg-background" dir="rtl">
      <div className="mx-auto max-w-5xl px-4 py-12">
        <div className="rounded-3xl border border-neutral-200 dark:border-border bg-white dark:bg-card p-10 text-center shadow-sm">
          <h1 className="text-3xl font-bold tracking-tight">לא נמצא פוסט</h1>
          <p className="mt-3 text-sm text-muted-foreground">הפוסט לא קיים או הוסר.</p>

          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <Link href="/" className="rounded-full bg-neutral-900 px-4 py-2 text-sm text-white hover:bg-neutral-800">
              לדף הבית
            </Link>
            <Link href="/notebook" className="rounded-full border bg-white dark:bg-card dark:border-border px-4 py-2 text-sm hover:bg-neutral-50 dark:hover:bg-muted">
              למחברת
            </Link>
          </div>
        </div>
      </div>
    </main>
  )
}

type Props = {
  initialData?: PostInitialData | null
}

export default function PostPage({ initialData }: Props) {
  const params = useParams()
  const slug = useMemo(() => (typeof params?.slug === 'string' ? params.slug : ''), [params])

  // When the server passes initialData the post is available immediately —
  // no client-side loading state needed for the first paint.
  const [loading, setLoading] = useState(!initialData)
  const [notFoundFlag, setNotFoundFlag] = useState(false)
  const [post, setPost] = useState<PostRow | null>(initialData as PostRow | null ?? null)
  const [sidebarLoading, setSidebarLoading] = useState(false)
  const [moreFromAuthor, setMoreFromAuthor] = useState<SidebarPost[]>([])
  const [hotInChannel, setHotInChannel] = useState<SidebarPost[]>([])
  const [myUserId, setMyUserId] = useState<string | null>(null)
  const [medals, setMedals] = useState<{ gold: number; silver: number; bronze: number }>({ gold: 0, silver: 0, bronze: 0 })
  const [subcategoryName, setSubcategoryName] = useState<string | null>(null)
  const [postTags, setPostTags] = useState<string[]>([])

  // report post
  type ReportReasonCode = 'abusive_language' | 'spam_promo' | 'hate_incitement' | 'privacy_exposure' | 'other'

  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement | null>(null)
  const [reportOpen, setReportOpen] = useState(false)
  // UI reasons (keep the old 5 options) + persist into DB as reason_code
  const [reportReason, setReportReason] = useState<ReportReasonCode>('abusive_language')
  const [reportDetails, setReportDetails] = useState('')
  const [reportSending, setReportSending] = useState(false)
  const [reportOk, setReportOk] = useState<string | null>(null)
  const [reportErr, setReportErr] = useState<string | null>(null)


  const [isMobile, setIsMobile] = useState(false)

  // Lazy-load comments: eager when deep-link present, deferred via IO otherwise
  const searchParams = useSearchParams()
  const [commentsReady, setCommentsReady] = useState(false)
  const [sentinelNode, setSentinelNode] = useState<HTMLDivElement | null>(null)

  // Deep-link detected → show comments immediately
  useEffect(() => {
    if (commentsReady) return
    const hl = searchParams?.get('hl')
    const n = searchParams?.get('n')
    const hash = typeof window !== 'undefined' ? window.location.hash : ''
    if (hl || n || hash.startsWith('#comment-')) {
      setCommentsReady(true)
    }
  }, [commentsReady, searchParams])

  // No deep-link → lazy-load when user scrolls near the comments area
  useEffect(() => {
    if (commentsReady || !sentinelNode) return
    const io = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) { setCommentsReady(true); io.disconnect() } },
      { rootMargin: '300px' },
    )
    io.observe(sentinelNode)
    return () => io.disconnect()
  }, [commentsReady, sentinelNode])

  useEffect(() => {
    // Tailwind breakpoint md=768
    const mq = window.matchMedia('(max-width: 767px)')
    const apply = () => setIsMobile(mq.matches)
    apply()
    mq.addEventListener?.('change', apply)
    return () => mq.removeEventListener?.('change', apply)
  }, [])

  // close dropdown on outside click
  useEffect(() => {
    if (!menuOpen) return
    const onDown = (e: MouseEvent) => {
      const root = menuRef.current
      if (!root) return
      if (e.target instanceof Node && !root.contains(e.target)) setMenuOpen(false)
    }
    window.addEventListener('pointerdown', onDown)
    return () => window.removeEventListener('pointerdown', onDown)
  }, [menuOpen])

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
    setSubcategoryName(null)
    setPostTags([])
    if (!post?.id) return

    let cancelled = false

    const fetchTaxonomy = async () => {
      const subcatId = post.subcategory_tag_id

      // Subcategory name — independent fetch so a tags error can't suppress it
      if (subcatId) {
        const { data } = await supabase.from('tags').select('name_he').eq('id', subcatId).single()
        if (!cancelled) setSubcategoryName(data?.name_he ?? null)
      }

      // Post tags — two flat queries (avoids join type-inference issues with Supabase SDK)
      const { data: ptRows, error: ptError } = await supabase
        .from('post_tags')
        .select('tag_id')
        .eq('post_id', post.id)

      if (cancelled) return
      if (ptError) return // subcategory already set; skip tags silently

      const tagIds = (ptRows ?? []).map((r: { tag_id: number }) => r.tag_id).filter(Boolean)
      if (tagIds.length === 0) return

      const { data: tagsData, error: tagsError } = await supabase
        .from('tags')
        .select('name_he')
        .in('id', tagIds)

      if (cancelled) return
      if (tagsError) return

      const names = (tagsData ?? [])
        .map((t: { name_he: string | null }) => t.name_he)
        .filter((n): n is string => Boolean(n))

      setPostTags(names)
    }

    fetchTaxonomy()
    return () => { cancelled = true }
  }, [post?.id, post?.subcategory_tag_id])

  useEffect(() => {
    if (!slug) return

    let cancelled = false

    const load = async (skipPostFetch = false) => {
      if (!skipPostFetch) {
        setLoading(true)
        setNotFoundFlag(false)
        setPost(null)
      }
      setMoreFromAuthor([])
      setHotInChannel([])
      setSidebarLoading(false)

      let p: PostRow

      if (skipPostFetch && post) {
        // Post data already set from server initialData — use it directly
        p = post
      } else {
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
            subcategory_tag_id,
            channel:channels ( name_he, slug ),
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

        p = data as PostRow
        setPost(p)
        setLoading(false)
      }

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
              p_limit: 12,
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

      const authorIdSet = new Set(authorList.map(x => x.id))

      // פוסטים חמים בקטגוריה – via RPC (weekly → monthly → recent fallback, all server-side)
      const hotIds = (!hotRes.error && Array.isArray(hotRes.data))
        ? (hotRes.data as { post_id: string }[])
            .map(r => r.post_id)
            .filter(id => id !== p.id && !authorIdSet.has(id))
            .slice(0, 5)
        : []

      if (hotIds.length > 0) {
        const { data: hotPosts } = await supabase
          .from('posts')
          .select(sidebarPostSelect)
          .in('id', hotIds)
          .is('deleted_at', null)
          .eq('status', 'published')

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

    // Skip the DB fetch only on the initial render where the server already provided
    // matching data. On SPA slug changes initialData belongs to a different post,
    // so we must always re-fetch from the client.
    void load(!!initialData && initialData.slug === slug)

    return () => {
      cancelled = true
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug])

  if (loading) {
    const headerSkeleton = (
      <div className="animate-pulse" dir="rtl">
        <div className="h-8 w-3/4 rounded-xl bg-neutral-200 dark:bg-muted" />
        <div className="mt-3 space-y-2">
          <div className="h-4 w-full rounded-lg bg-neutral-100 dark:bg-muted/60" />
          <div className="h-4 w-2/3 rounded-lg bg-neutral-100 dark:bg-muted/60" />
        </div>
        <div className="mt-10 flex items-center gap-3">
          <div className="h-12 w-12 shrink-0 rounded-full bg-neutral-200 dark:bg-muted" />
          <div className="space-y-2">
            <div className="h-4 w-28 rounded-lg bg-neutral-200 dark:bg-muted" />
            <div className="h-3 w-20 rounded-lg bg-neutral-100 dark:bg-muted/60" />
          </div>
        </div>
      </div>
    )

    const sidebarSkeleton = (
      <div className="space-y-6">
        {[0, 1].map(s => (
          <div key={s} className="rounded-2xl border border-neutral-200/60 dark:border-border bg-white/05 dark:bg-card shadow-sm animate-pulse">
            <div className="px-4 py-3">
              <div className="h-7 w-24 rounded-xl bg-neutral-200 dark:bg-muted" />
            </div>
            <div className="mx-4 border-b border-neutral-100 dark:border-border" />
            <div className="space-y-1.5 px-3 pb-3 pt-2">
              {[0, 1, 2].map(i => (
                <div key={i} className="flex items-start justify-between gap-2.5 rounded-xl border border-neutral-200/70 dark:border-border p-2">
                  <div className="min-w-0 flex-1 space-y-2 pt-1">
                    <div className="h-3.5 w-3/4 rounded-lg bg-neutral-200 dark:bg-muted" />
                    <div className="h-3 w-full rounded-lg bg-neutral-100 dark:bg-muted/60" />
                    <div className="h-2.5 w-1/2 rounded-lg bg-neutral-100 dark:bg-muted/60" />
                  </div>
                  <div className="h-20 w-20 shrink-0 rounded-2xl bg-neutral-200 dark:bg-muted" />
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    )

    return <PostShell header={headerSkeleton} sidebar={sidebarSkeleton}><div /></PostShell>
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

  const canReportPost = !!myUserId && post.author_id !== myUserId

  async function submitPostReport() {
    if (!canReportPost || !myUserId || !post) return
    setReportOk(null)
    setReportErr(null)
    try {
      setReportSending(true)
      const reasonLabel = reportReason === 'abusive_language'
        ? 'שפה פוגענית / הקנטה'
        : reportReason === 'spam_promo'
          ? 'ספאם / פרסום'
          : reportReason === 'hate_incitement'
            ? 'שנאה / הסתה'
            : reportReason === 'privacy_exposure'
              ? 'חשיפת מידע אישי'
              : 'אחר'

      const category: 'harassment' | 'spam' | 'self-harm' | 'other' =
        reportReason === 'spam_promo' ? 'spam' : reportReason === 'other' || reportReason === 'privacy_exposure' ? 'other' : 'harassment'
      const titleLine = `post_title: ${String(post.title ?? 'ללא כותרת').slice(0, 160)}`
      const details = [
        reportDetails.trim() || null,
        `reason_label: ${reasonLabel}`,
        'entity: post',
        `post: ${slug}`,
        titleLine,
      ]
        .filter(Boolean)
        .join('\n')

      const excerpt = (post.excerpt ?? '').trim()
      const messageExcerpt = excerpt ? excerpt.slice(0, 280) : String(post.title ?? 'ללא כותרת').slice(0, 280)

      const { error } = await supabase.from('user_reports').insert({
        reporter_id: myUserId,
        reported_user_id: post.author_id,
        conversation_id: null,
        category,
        reason_code: reportReason,
        details: details || null,
        message_id: post.id,
        message_created_at: publishedAt,
        message_excerpt: messageExcerpt,
      })

      if (error) throw error
      setReportOk('תודה על הדיווח ועל התרומה לקהילה 🙏\nנבדוק את זה בהקדם.')
      setReportDetails('')
      window.setTimeout(() => {
        setReportOpen(false)
        setReportErr(null)
        setReportOk(null)
      }, 2200)
    } catch (e: unknown) {
      setReportErr(e instanceof Error ? e.message : 'לא הצלחנו לשלוח דיווח')
    } finally {
      setReportSending(false)
    }
  }

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
      ? 'text-red-700 dark:text-red-400'
      : post.channel_id === 2
        ? 'text-blue-700 dark:text-blue-400'
        : post.channel_id === 3
          ? 'text-purple-700 dark:text-purple-400'
          : 'text-neutral-700 dark:text-muted-foreground'

  const hasMedals = medals.gold > 0 || medals.silver > 0 || medals.bronze > 0

  const header = (
    <div>
        <div className="flex items-start justify-between gap-3">
        <h1 className="min-w-0 flex-1 text-right text-[32px] sm:text-[36px] font-black tracking-tight text-neutral-950 dark:text-foreground break-words">
          {post.title ?? 'ללא כותרת'}
        </h1>
        <div className="mt-1 flex shrink-0 items-center gap-2" dir="ltr">
          {/* menu (left of medals) */}
          {canReportPost ? (
            <div ref={menuRef} className="relative">
              <button
                type="button"
                aria-label="תפריט פוסט"
                onClick={() => setMenuOpen((v) => !v)}
                className="p-1 text-muted-foreground hover:text-foreground transition-colors hover:scale-90 transition-transform cursor-pointer "
              >
                <span className="text-[18px] leading-none">⋮</span>
              </button>

              {menuOpen ? (
                <div className="absolute left-0 top-10 z-20 w-44 overflow-hidden rounded-2xl border border-neutral-200 dark:border-border bg-white dark:bg-card shadow-lg">
                  <button
                    type="button"
                    className="w-full px-3 py-2 text-right text-sm font-semibold text-neutral-800 dark:text-foreground hover:bg-red-50 dark:hover:bg-red-950/30 hover:text-red-700 dark:hover:text-red-400 cursor-pointer"
                    onClick={() => {
                      setMenuOpen(false)
                      setReportOpen(true)
                    }}
                  >
                    דווח על הפוסט
                  </button>
                </div>
              ) : null}
            </div>
          ) : null}

          {hasMedals ? (
            <div className="flex shrink-0 items-center gap-2 text-sm">
              {medals.gold > 0 && <span>🥇 {medals.gold}</span>}
              {medals.silver > 0 && <span>🥈 {medals.silver}</span>}
              {medals.bronze > 0 && <span>🥉 {medals.bronze}</span>}
            </div>
          ) : null}
        </div>
        </div>
        {post.excerpt ? (
          <p
  className="mt-2 text-right text-[16px] leading-8 text-neutral-700 dark:text-muted-foreground whitespace-normal"
  style={{ overflowWrap: 'anywhere', wordBreak: 'break-word' }}
>{post.excerpt}</p>
        ) : null}

        <div className="mt-10 flex items-start justify-start gap-3" dir="rtl">
          {authorUsername ? (
            <AuthorHover username={authorUsername}>
              <Link href={`/u/${authorUsername}`}>
                <div className="shrink-0">
                  <Avatar src={author?.avatar_url ?? null} name={authorName} size={52} />
                </div>
              </Link>
            </AuthorHover>
          ) : (
            <div className="shrink-0">
              <Avatar src={author?.avatar_url ?? null} name={authorName} size={52} />
            </div>
          )}

          <div className="min-w-0 text-right">
            <div className="flex items-center gap-2 text-[15px] font-extrabold text-neutral-950 dark:text-foreground">
              {authorUsername ? (
                <AuthorHover username={authorUsername}>
                  <Link href={`/u/${authorUsername}`} className="hover:underline">
                    {authorName}
                  </Link>
                </AuthorHover>
              ) : (
                authorName
              )}
              {author?.id ? (
                <>
                  <span className="text-muted-foreground/50 font-normal text-sm select-none">·</span>
                  <FollowButton targetUserId={author.id} variant="text" />
                </>
              ) : null}
            </div>

            <div className="mt-1 text-[13px] text-neutral-600 dark:text-muted-foreground">
              {channelName && channelHref ? (
                <Link href={channelHref} className={`inline-flex items-center rounded-full border-neutral-200/70 dark:border-border/30 bg-neutral-100/70 dark:bg-muted px-0.5 py-0.5 text-[12px] font-semibold ${channelChipClass} hover:bg-neutral-200/60 dark:hover:bg-muted/80`}>
                  {channelName}
                </Link>
              ) : channelName ? (
                <span className={`inline-flex items-center rounded-full border border-neutral-200/70 dark:border-border/30 bg-neutral-100/70 dark:bg-muted px-2.5 py-0.5 text-[12px] font-semibold ${channelChipClass}`}>{channelName}</span>
              ) : null}
              {channelName ? <span className="text-neutral-400 dark:text-muted-foreground"> · </span> : null}
              <span className="text-neutral-500 dark:text-muted-foreground">{formatDateTimeHe(publishedAt)}</span>
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
            <Link href={`/u/${authorUsername}`} className="text-sm text-blue-700 dark:text-blue-400 hover:underline">
              לדף הפרופיל
            </Link>
          ) : null
        }
      >
        {sidebarLoading && moreFromAuthor.length === 0 ? (
          <div className="space-y-1.5 animate-pulse" aria-hidden="true">
            {[0, 1, 2].map(i => (
              <div key={i} className="flex items-start justify-between gap-2.5 rounded-xl border border-neutral-200/70 dark:border-border p-2">
                <div className="min-w-0 flex-1 space-y-2 pt-1">
                  <div className="h-3.5 w-3/4 rounded-lg bg-neutral-200 dark:bg-muted" />
                  <div className="h-3 w-full rounded-lg bg-neutral-100 dark:bg-muted/60" />
                  <div className="h-2.5 w-1/2 rounded-lg bg-neutral-100 dark:bg-muted/60" />
                </div>
                <div className="h-20 w-20 shrink-0 rounded-2xl bg-neutral-200 dark:bg-muted" />
              </div>
            ))}
          </div>
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
              <Link href={channelHref} className="text-sm text-blue-700 dark:text-blue-400 hover:underline">
                לדף הקטגוריה
              </Link>
            ) : null
          }
        >
          {sidebarLoading && hotInChannel.length === 0 ? (
            <div className="space-y-1.5 animate-pulse" aria-hidden="true">
              {[0, 1, 2].map(i => (
                <div key={i} className="flex items-start justify-between gap-2.5 rounded-xl border border-neutral-200/70 dark:border-border p-2">
                  <div className="min-w-0 flex-1 space-y-2 pt-1">
                    <div className="h-3.5 w-3/4 rounded-lg bg-neutral-200 dark:bg-muted" />
                    <div className="h-3 w-full rounded-lg bg-neutral-100 dark:bg-muted/60" />
                    <div className="h-2.5 w-1/2 rounded-lg bg-neutral-100 dark:bg-muted/60" />
                  </div>
                  <div className="h-20 w-20 shrink-0 rounded-2xl bg-neutral-200 dark:bg-muted" />
                </div>
              ))}
            </div>
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
    <>
      {/* Report post modal (same flow/styling as report comment) */}
      {reportOpen ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4"
          dir="rtl"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) {
              setReportOpen(false)
              setReportErr(null)
              setReportOk(null)
            }
          }}
        >
          <div className="w-full max-w-lg rounded-3xl border bg-white dark:bg-card dark:border-border p-5 shadow-xl">
            <div className="flex items-start gap-3">
              <div className="min-w-0">
                <div className="text-sm font-black">דיווח על פוסט</div>
                <div className="mt-1 text-xs text-neutral-600 dark:text-muted-foreground">
                  הדיווח יישלח לצוות האתר. אנחנו מתייחסים לדיווחים ברצינות ומטפלים בהם בהקדם.
                </div>

                <div className="mt-3 rounded-2xl border bg-black/5 dark:bg-muted p-3 text-xs text-neutral-700 dark:text-muted-foreground">
                  <div className="font-bold">הפוסט שדווח</div>
                  <div className="mt-1 whitespace-pre-wrap font-semibold text-neutral-900 dark:text-foreground">
                    {post.title ?? 'ללא כותרת'}
                  </div>
                  <div className="mt-1 text-[11px] text-neutral-500 dark:text-muted-foreground">{formatDateTimeHe(publishedAt)}</div>
                </div>
              </div>

              <button
                type="button"
                className="mr-auto rounded-full border px-3 py-1 text-xs font-bold hover:bg-black/5 dark:hover:bg-white/10"
                onClick={() => {
                  setReportOpen(false)
                  setReportErr(null)
                  setReportOk(null)
                }}
              >
                סגור
              </button>
            </div>

            {!canReportPost ? (
              <div className="mt-4 rounded-2xl border bg-black/5 dark:bg-white/5 p-3 text-sm">לא ניתן לדווח על עצמך.</div>
            ) : (
              <div className="mt-4 space-y-3">
                <label className="block">
                  <div className="mb-1 text-xs font-bold text-neutral-700 dark:text-muted-foreground">סוג דיווח</div>
                  <select
                    value={reportReason}
                    onChange={(e) => setReportReason(e.target.value as typeof reportReason)}
                    className="w-full rounded-2xl border bg-white dark:bg-card dark:border-border dark:text-foreground px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-black/10"
                  >
                    <option value="abusive_language">שפה פוגענית / הקנטה</option>
                    <option value="spam_promo">ספאם / פרסום</option>
                    <option value="hate_incitement">שנאה / הסתה</option>
                    <option value="privacy_exposure">חשיפת מידע אישי</option>
                    <option value="other">אחר</option>
                  </select>
                </label>

                <label className="block">
                  <div className="mb-1 text-xs font-bold text-neutral-700 dark:text-muted-foreground">פרטים (אופציונלי)</div>
                  <textarea
                    value={reportDetails}
                    onChange={(e) => setReportDetails(e.target.value)}
                    rows={4}
                    maxLength={2000}
                    className="w-full resize-none rounded-2xl border bg-white dark:bg-card dark:border-border dark:text-foreground px-4 py-3 text-sm leading-relaxed outline-none focus:ring-2 focus:ring-black/10 whitespace-pre-wrap"
                    placeholder="תיאור קצר שיעזור לנו לטפל…"
                  />
                  <div className="mt-1 text-xs text-neutral-500 dark:text-muted-foreground">{reportDetails.length}/2000</div>
                </label>

                {reportErr ? (
                  <div className="rounded-2xl border border-red-200 bg-red-50 p-3 text-sm text-red-800 dark:border-red-800/40 dark:bg-red-950/30 dark:text-red-400">
                    {reportErr}
                  </div>
                ) : null}
                {reportOk ? (
                  <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800 dark:border-emerald-800/40 dark:bg-emerald-950/30 dark:text-emerald-400">
                    {reportOk}
                  </div>
                ) : null}

                <div className="flex items-center justify-between gap-2">
                  <button
                    type="button"
                    className="rounded-full border px-4 py-2 text-sm font-bold hover:bg-black/5 dark:hover:bg-white/10"
                    onClick={() => setReportOpen(false)}
                  >
                    ביטול
                  </button>
                  <button
                    type="button"
                    disabled={reportSending}
                    onClick={submitPostReport}
                    className={[
                      'rounded-full px-5 py-2 text-sm font-black text-white',
                      reportSending ? 'bg-black/30' : 'bg-black hover:bg-black/90',
                    ].join(' ')}
                  >
                    {reportSending ? 'שולח…' : 'שלח/י דיווח'}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      ) : null}

      <PostShell
        header={header}
        actions={<PostOwnerMenu postId={post.id} postSlug={slug} authorId={post.author_id} />}
        sidebar={sidebar}
      >
      {/* תוכן – לב האתר */}
      <div className="mt-6 min-h-[45vh] pb-4">
        <RichText content={post.content_json as RichNode} currentPostId={post.id} currentSlug={slug} />
      </div>

      {(() => {
        const ch = post.channel ? (Array.isArray(post.channel) ? post.channel[0] : post.channel) : null
        const channelSlug = ch?.slug ?? null
        const hasTaxonomy = !!(subcategoryName || postTags.length > 0)
        return (
          <div className="flex w-full items-center justify-between gap-3 mt-4 pt-4 border-t border-border/60" dir="rtl">
            {/* RIGHT in RTL (first in DOM): taxonomy */}
            {hasTaxonomy && (() => {
              const subcatNode = subcategoryName
                ? channelSlug && post.subcategory_tag_id
                  ? (
                    <Link
                      href={`/search?channel=${channelSlug}&subcat=${post.subcategory_tag_id}`}
                      className="font-semibold hover:underline"
                    >
                      {subcategoryName}
                    </Link>
                  ) : (
                    <span className="font-semibold">{subcategoryName}</span>
                  )
                : null

              const tagsNode = postTags.length > 0
                ? postTags.map((tag) => (
                    <span key={tag} className="text-muted-foreground/70">#{tag}</span>
                  ))
                : null

              return (
                <div className="min-w-0 flex-1 text-sm text-muted-foreground">
                  {/* Mobile: stacked 2 lines */}
                  <div className="flex flex-col gap-0.5 sm:hidden">
                    {subcatNode && <div>{subcatNode}</div>}
                    {tagsNode && <div className="flex flex-wrap  gap-x-2 gap-y-1">{tagsNode}</div>}
                  </div>

                  {/* Desktop: single inline line */}
                  <div className="hidden sm:flex sm:items-center sm:flex-wrap sm:gap-2">
                    {subcatNode}
                    {subcategoryName && postTags.length > 0 && (
                      <span className="text-muted-foreground/50 select-none">·</span>
                    )}
                    {tagsNode}
                  </div>
                </div>
              )
            })()}

            {/* LEFT in RTL (second in DOM): actions */}
            <div className="shrink-0 flex items-center gap-2 [&_button]:h-10 [&_button]:rounded-xl [&_button]:border [&_button]:border-neutral-200 dark:[&_button]:border-border [&_button]:transition-all [&_button]:duration-100 [&_button:hover]:bg-neutral-100/70 dark:[&_button:hover]:bg-muted/70 [&_button:active]:scale-[0.98]">
              <SavePostButton postId={post.id} />
              <SharePostButton url={typeof window !== 'undefined' ? window.location.href : ''} title={post.title ?? ''} />
            </div>
          </div>
        )
      })()}

      {/* אינטראקציות – מופרד לחלוטין מהטקסט */}
      
      <div className="-mx-6 sm:-mx-10 mt-6 space-y-6">
<div className='bg-neutral-100/70 dark:bg-card border dark:border-border' >
<div>
        <div className="rounded-3xl border border-neutral-300 dark:border-border bg-neutral-200/70 dark:bg-muted/50 p-5 sm:p-6">
          <PostReactions postId={post.id} channelId={post.channel_id ?? 0} authorId={post.author_id} onMedalsChange={setMedals} />
        </div>
        <div className="mt-0.5 "></div>
        </div>
        <div className="rounded-3xl border border-neutral-200 dark:border-border bg-neutral-100/70 dark:bg-card p-1 sm:p-2">
          {commentsReady ? (
            <PostComments postId={post.id} postSlug={slug} postTitle={post.title ?? ''} postAuthorId={post.author_id} />
          ) : (
            <div ref={setSentinelNode} className="min-h-[120px]" />
          )}
        </div>
        </div>
      </div>
      </PostShell>
    </>
  )
}

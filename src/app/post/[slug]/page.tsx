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
import { formatDateTimeHe } from '@/lib/time'

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

const truncTitle = (s: string) => trunc(s, 25)
// בסיידבר עדיף קצת יותר טקסט כדי שזה לא יראה "חתוך" מדי
const truncExcerpt = (s: string) => trunc(s, 30)

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
    <div className="rounded-3xl border bg-white shadow-sm" dir="rtl">
      {/* כותרת: טקסט מימין, לינק פעולה משמאל */}
      <div className="flex items-center justify-between gap-3 rounded-t-3xl bg-neutral-200/90 px-4 py-2.5">
        <h3 className="text-right text-[15px] font-black tracking-tight text-neutral-950">{title}</h3>
        {action ? <div className="text-left text-[15px]">{action}</div> : null}
      </div>

      {/* פס הפרדה כהה */}
      <div className="mx-4 border-b border-neutral-400" />

      <div className="px-3 pb-3 pt-2.5">
        <div className="space-y-1.5">{children}</div>
      </div>
    </div>
  )
}

function SidebarPostItem({
  post,
  showAuthor,
}: {
  post: SidebarPost
  showAuthor?: boolean
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
      dir="rtl"
      className="group flex items-start justify-between gap-3 rounded-2xl px-2.5 py-2 transition-colors hover:bg-neutral-100 cursor-pointer"
    >
      {/* טקסט (ימין) */}
      <div className="min-w-0 flex-1 text-right">
        <div className="text-[16px] font-black leading-6 text-neutral-950 group-hover:text-neutral-950">
          {truncTitle(post.title ?? 'ללא כותרת')}
        </div>

        {post.excerpt ? (
          <div className="mt-0.5 text-[14px] leading-6 text-neutral-700">
            {truncExcerpt(post.excerpt)}
          </div>
        ) : null}

        <div className="mt-1.5 flex items-center justify-start gap-2 text-[12px] text-neutral-600 whitespace-nowrap">
          {showAuthor ? (
            authorUsername ? (
              <Link
                href={`/u/${authorUsername}`}
                className="font-extrabold text-neutral-800 hover:text-neutral-950 hover:underline"
                onClick={(e) => e.stopPropagation()}
              >
                {authorName}
              </Link>
            ) : (
              <span className="font-extrabold text-neutral-900">{authorName}</span>
            )
          ) : null}
          {showAuthor ? <span className="text-neutral-400">·</span> : null}
          <span className="text-neutral-600">{formatDateTimeHe(date)}</span>
        </div>
      </div>

      {/* תמונה (שמאל) – גדולה יותר כדי לצמצם שטח ריק */}
      <div className="h-18 w-20 shrink-0 overflow-hidden rounded-2xl bg-neutral-100 ring-3 ring-black/5">
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
          ? supabase
            .from('posts')
            .select(
              'id,slug,title,excerpt,cover_image_url,published_at,created_at,author_id,author:profiles!posts_author_id_fkey ( id, username, display_name, avatar_url ), post_reaction_summary ( gold, silver, bronze )'
            )
            .is('deleted_at', null)
            .eq('status', 'published')
            .eq('channel_id', p.channel_id)
            .neq('id', p.id)
            .order('published_at', { ascending: false, nullsFirst: false })
            .limit(60)
          : Promise.resolve({ data: [], error: null } as { data: SidebarPost[]; error: null }),
      ])

      if (cancelled) return

      if (!authorRes.error && Array.isArray(authorRes.data)) {
        setMoreFromAuthor(authorRes.data as SidebarPost[])
      }


      // פוסטים חמים בקטגוריה (מעדיף דירוג לפי post_reaction_summary; אם אין/אין הרשאות → נופל ל"חדשים" כדי שלא יהיה ריק)
      let didSetHot = false

      if (!hotRes.error && Array.isArray(hotRes.data)) {
        const scoredAll = (hotRes.data as unknown as Array<Record<string, unknown>>)
          .map((row) => {
            const rs = Array.isArray((row as { post_reaction_summary?: unknown }).post_reaction_summary)
              ? (row as { post_reaction_summary?: unknown[] }).post_reaction_summary?.[0]
              : (row as { post_reaction_summary?: unknown }).post_reaction_summary

            const gold = Number((rs as { gold?: unknown } | null | undefined)?.gold ?? 0)
            const silver = Number((rs as { silver?: unknown } | null | undefined)?.silver ?? 0)
            const bronze = Number((rs as { bronze?: unknown } | null | undefined)?.bronze ?? 0)
            const score = gold * 100 + silver * 10 + bronze
            return { row, score }
          })
          .sort((a, b) => b.score - a.score)

        const picked =
          scoredAll.some((x) => x.score > 0)
            ? scoredAll.filter((x) => x.score > 0).slice(0, 5)
            : scoredAll.slice(0, 5)

        const cleaned = picked.map((x) => {
          const r = x.row as Record<string, unknown>
          const { post_reaction_summary, ...rest } = r as { post_reaction_summary?: unknown }
          return rest
        })

        const hot = cleaned as SidebarPost[]
        setHotInChannel(hot)
        didSetHot = hot.length > 0
      }

      // Fallback: אם ה-view/relationship לא נגיש ב-RLS או אין נתונים → נציג פשוט 5 פוסטים אחרונים בקטגוריה
      if (!didSetHot && p.channel_id) {
        const fb = await supabase
          .from('posts')
          .select(sidebarPostSelect)
          .is('deleted_at', null)
          .eq('status', 'published')
          .eq('channel_id', p.channel_id)
          .neq('id', p.id)
          .order('published_at', { ascending: false, nullsFirst: false })
          .limit(5)

        if (!fb.error && Array.isArray(fb.data)) {
          setHotInChannel(fb.data as SidebarPost[])
        }
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

  const header = (
    <div>

        <h1 className="text-right text-[32px] sm:text-[36px] font-black tracking-tight text-neutral-950 break-words">
          {post.title ?? 'ללא כותרת'}
        </h1>
        {post.excerpt ? (
          <p className="mt-2 text-right text-[16px] leading-8 text-neutral-700">{post.excerpt}</p>
        ) : null}

        {/* מטא פוסט: אווטאר מימין, שם/קטגוריה/תאריך משמאל לאווטאר */}
        <div className="mt-10 flex items-start justify-start gap-3" dir="rtl">
          <div className="flex flex-row items-start gap-3">
            <div className="shrink-0">
              <Link href={`/u/${authorUsername}`} ><Avatar src={author?.avatar_url ?? null} name={authorName} size={52} /></Link>
               
            </div>

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
                  <Link href={channelHref} className="font-semibold text-blue-700 hover:underline">
                    {channelName}
                  </Link>
                ) : channelName ? (
                  <span className="font-semibold text-neutral-700">{channelName}</span>
                ) : null}
                {channelName ? <span className="text-neutral-400"> · </span> : null}
                <span className="text-neutral-500">{formatDateTimeHe(publishedAt)}</span>
              </div>
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
          moreFromAuthor.map((p) => <SidebarPostItem key={p.id} post={p} />)
        )}
      </SidebarSection>

      {post.channel_id ? (
        <SidebarSection
          title={`פוסטים חמים ב: ${channelName ?? 'קטגוריה'}`}
          action={
            channelHref ? (
              <Link href={channelHref} className="text-sm text-blue-700 hover:underline">
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
            hotInChannel.map((p) => <SidebarPostItem key={p.id} post={p} showAuthor />)
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
      <div className="mt-6 min-h-[45vh] pb-14">
        <RichText content={post.content_json as RichNode} />
      </div>

      {/* אינטראקציות – מופרד לחלוטין מהטקסט */}
      <div className="-mx-6 sm:-mx-10 mt-12 space-y-6">
        {/* פעולות – מחוץ לבלוק הדירוגים (אבל ממש מעליו) */}
        
          <div className="flex flex-wrap items-center justify-between gap-3 px-5 " dir="rtl">
            <div className="flex items-center gap-2">
              {author?.id && myUserId && author.id !== myUserId ? <FollowButton targetUserId={author.id} /> : null}
              <SavePostButton postId={post.id} />
            </div>

            <div className="flex items-center gap-2">
              <SharePostButton url={typeof window !== 'undefined' ? window.location.href : ''} title={post.title ?? ''} />
            </div>
          </div>
        

<div className='bg-neutral-100/70 border ' > 
        <div className="rounded-3xl border border-neutral-300 bg-neutral-100/70 p-5 sm:p-6">
          <PostReactions postId={post.id} channelId={post.channel_id ?? 0} authorId={post.author_id} />
        </div>

        {/* תגובות – קצת כהות עדינה יותר */}
        <div className="rounded-3xl border border-neutral-200 bg-neutral-100/70 p-1 sm:p-2">
          <PostComments postId={post.id} postSlug={slug} postTitle={post.title ?? ''} />
        </div>
        </div>
      </div>
    </PostShell>
  )
}

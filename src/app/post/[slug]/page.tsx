'use client'

import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import { useEffect, useMemo, useState } from 'react'

import { supabase } from '@/lib/supabaseClient'
import Avatar from '@/components/Avatar'
import RichText from '@/components/RichText'
import PostShell from '@/components/PostShell'
import PostOwnerMenu from '@/components/PostOwnerMenu'
import PostReactions from '@/components/PostReactions'
import PostComments from '@/components/PostComments'
import { formatDateTimeHe } from '@/lib/time'

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


const trunc = (s: string, n = 35) => (s.length > n ? `${s.slice(0, n)}…` : s)

function pickAuthor(a: Author[] | Author | null | undefined): Author | null {
  if (!a) return null
  return Array.isArray(a) ? (a[0] ?? null) : a
}

function SidebarSection({ title, action, children }: { title: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="rounded-3xl border bg-white shadow-sm overflow-hidden">
      {/* כותרת עם "כהות" מהפסגה עד הקו */}
      <div className="flex items-center justify-between gap-3 bg-neutral-100 px-5 py-4 border-b border-neutral-300">
        <h3 className="text-[16px] font-extrabold text-neutral-950">{title}</h3>
        {action ? <div className="text-[15px]">{action}</div> : null}
      </div>

      <div className="px-3 pb-4 pt-3">
        <div className="space-y-1">{children}</div>
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
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          goPost()
        }
      }}
      className="group flex w-full items-center justify-between gap-3 rounded-2xl px-3 py-2 cursor-pointer transition-colors hover:bg-neutral-200/70"
    >
      {/* טקסט (ימין) */}
      <div className="min-w-0 flex-1 text-right">
        <div className="text-[15px] font-semibold leading-6 text-neutral-900 group-hover:text-neutral-950 line-clamp-2">
          {post.title ?? 'ללא כותרת'}
        </div>

        {post.excerpt ? (
          <div className="mt-0.5 text-[13px] leading-5 text-neutral-600">
            {trunc(post.excerpt, 35)}
          </div>
        ) : null}

        <div className="mt-1 flex w-full flex-wrap items-center justify-end gap-2 text-[12px] text-neutral-500">
          {showAuthor ? (
            authorUsername ? (
              <Link
                href={`/u/${authorUsername}`}
                onClick={(e) => e.stopPropagation()}
                className="font-semibold text-neutral-800 hover:underline"
              >
                {authorName}
              </Link>
            ) : (
              <span className="font-semibold text-neutral-800">{authorName}</span>
            )
          ) : null}

          <time dateTime={date}>{formatDateTimeHe(date)}</time>
        </div>
      </div>

      {/* תמונה (שמאל) */}
      <div className="h-14 w-14 shrink-0 overflow-hidden rounded-2xl bg-neutral-100 ring-1 ring-black/5">
        {post.cover_image_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={post.cover_image_url} alt="" className="h-full w-full object-cover" loading="lazy" />
        ) : null}
      </div>
    </div>
  )
}



export default function PostPage() {
  const params = useParams()
  const slug = useMemo(() => (typeof params?.slug === 'string' ? params.slug : ''), [params])

  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)
  const [post, setPost] = useState<PostRow | null>(null)
  const [sidebarLoading, setSidebarLoading] = useState(false)
  const [moreFromAuthor, setMoreFromAuthor] = useState<SidebarPost[]>([])
  const [hotInChannel, setHotInChannel] = useState<SidebarPost[]>([])

  useEffect(() => {
    if (!slug) return

    let cancelled = false

    const load = async () => {
      setLoading(true)
      setNotFound(false)
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
        // PGRST116 = 0 rows for .single()
        setNotFound(true)
        setLoading(false)
        return
      }

      const p = data as PostRow
      setPost(p)
      setLoading(false)

      // Sidebar content (non-blocking)
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
              .select('id,slug,title,excerpt,cover_image_url,published_at,created_at,author_id,author:profiles!posts_author_id_fkey ( id, username, display_name, avatar_url ), post_reaction_summary ( medals_gold, medals_silver, medals_bronze )')
              .is('deleted_at', null)
              .eq('status', 'published')
              .eq('channel_id', p.channel_id)
              .neq('id', p.id)
              .order('published_at', { ascending: false, nullsFirst: false })
              .limit(60)
          : Promise.resolve({ data: [], error: null } as any),
      ])

      if (cancelled) return

      if (!authorRes.error && Array.isArray(authorRes.data)) {
        setMoreFromAuthor(authorRes.data as SidebarPost[])
      }

      // פוסטים חמים: ניסיון 1 — לפי מדליות מתוך post_reaction_summary (אם קיים / אם RLS מאפשר)
      let hot: SidebarPost[] = []
      if (!hotRes.error && Array.isArray(hotRes.data)) {
        const scored = (hotRes.data as any[])
          .map((row) => {
            const rs = Array.isArray(row.post_reaction_summary) ? row.post_reaction_summary[0] : row.post_reaction_summary
            const gold = Number(rs?.medals_gold ?? 0)
            const silver = Number(rs?.medals_silver ?? 0)
            const bronze = Number(rs?.medals_bronze ?? 0)
            const score = gold * 100 + silver * 10 + bronze
            return { row, score }
          })
          .sort((a, b) => b.score - a.score)
          .slice(0, 5)
          .map((x) => {
            const { post_reaction_summary, ...rest } = x.row
            return rest
          })

        hot = scored as SidebarPost[]
      }

      // ניסיון 2 (Fallback) — אם אין תוצאות/ה־join נכשל: פשוט 5 האחרונים בקטגוריה
      if (hot.length === 0 && p.channel_id) {
        const { data: fb } = await supabase
          .from('posts')
          .select('id,slug,title,excerpt,cover_image_url,published_at,created_at,author_id,author:profiles!posts_author_id_fkey ( id, username, display_name, avatar_url )')
          .is('deleted_at', null)
          .eq('status', 'published')
          .eq('channel_id', p.channel_id)
          .neq('id', p.id)
          .order('published_at', { ascending: false, nullsFirst: false })
          .limit(5)

        hot = (fb as SidebarPost[] | null | undefined) ?? []
      }

      setHotInChannel(hot)


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

  if (notFound || !post) {
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
    <div className="text-right">
      <h1 className="text-[40px] sm:text-[44px] font-extrabold tracking-tight text-neutral-950 break-words">
        {post.title ?? 'ללא כותרת'}
      </h1>
      {post.excerpt ? <p className="mt-2 text-[16px] leading-8 text-neutral-700">{post.excerpt}</p> : null}

      {/* כותב/ת + קטגוריה + תאריך/שעה (בדיוק כמו ההמחשה ששלחת) */}
      <div className="mt-5 flex items-start justify-start gap-3">
        {/* אווטר בימין – גובה שמכיל שתי שורות */}
        <div className="shrink-0">
          <Avatar src={author?.avatar_url ?? null} name={authorName} size={52} />
        </div>

        {/* הטקסט משמאל לאווטר: שורה 1 שם, שורה 2 קטגוריה+תאריך */}
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
      <div className="mt-6">
        <RichText content={post.content_json} />
      </div>

      {/* אינטראקציות – מופרד מהתוכן */}
      <div className="mt-12 rounded-3xl border bg-neutral-50 p-5 sm:p-6">
        <h2 className="text-base font-semibold text-neutral-900">תגובות ותחושות</h2>
        <div className="mt-4">
          <PostReactions postId={post.id} channelId={post.channel_id ?? 0} authorId={post.author_id} />
        </div>

        <div className="mt-8 border-t border-neutral-200 pt-6">
          <h2 className="text-base font-semibold text-neutral-900">תגובות</h2>
          <div className="mt-4">
            <PostComments postId={post.id} postSlug={slug} postTitle={post.title ?? ''} />
          </div>
        </div>
      </div>
    </PostShell>
  )
}

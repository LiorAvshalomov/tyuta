'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabaseClient'
import PostCard, { type PostCardPost } from '@/components/PostCard'
import { formatRelativeHe } from '@/lib/time'

type TabKey = 'posts' | 'comments' | 'achievements'
type SortKey = 'recent' | 'reactions' | 'comments'

type PostLite = {
  id: string
  title: string
  slug: string
  excerpt: string | null
  cover_image_url: string | null
  created_at: string
  channel?: { name_he: string }[] | null
}

type ReactionSummaryRow = {
  post_id: string
  gold: number | null
  silver: number | null
  bronze: number | null
}

type CommentRow = {
  id: string
  content: string
  created_at: string
  author_id: string
  post_id: string
}

type ProfileLite = {
  id: string
  username: string
  display_name: string | null
}

type CommentCard = {
  id: string
  created_at: string
  content: string
  post: { slug: string; title: string }
  author: { username: string; display_name: string | null }
}

type ReactionTotal = {
  reaction_key: string
  total_votes: number
}

type MedalTotals = { gold: number; silver: number; bronze: number }

export default function ProfileTabsClient({
  profileId,
  username,
  displayName,
}: {
  profileId: string
  username: string
  displayName: string
}) {
  const [tab, setTab] = useState<TabKey>('posts')
  const [sort, setSort] = useState<SortKey>('recent')

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [posts, setPosts] = useState<PostLite[]>([])
  const [postScores, setPostScores] = useState<Record<string, { comments: number; reactions: number }>>({})
  const [reactionTotals, setReactionTotals] = useState<ReactionTotal[]>([])
  const [medalTotals, setMedalTotals] = useState<MedalTotals>({ gold: 0, silver: 0, bronze: 0 })

  const [commentsOnPosts, setCommentsOnPosts] = useState<CommentCard[]>([])

  // pagination
  const POSTS_PER_PAGE = 6
  const COMMENTS_PER_PAGE = 10
  const [postsPage, setPostsPage] = useState(1)
  const [commentsPage, setCommentsPage] = useState(1)

  useEffect(() => {
    // reset pagination when tab/sort changes
    setPostsPage(1)
    setCommentsPage(1)
  }, [tab, sort])

  useEffect(() => {
    let cancelled = false

    async function run() {
      setLoading(true)
      setError(null)

      try {
        // 1) Fetch all published, non-anonymous posts for this author (smallish amount -> fine)
        const { data: postRows, error: pErr } = await supabase
          .from('posts')
          .select(
            `
            id,
            title,
            slug,
            excerpt,
            cover_image_url,
            created_at,
            channel:channels ( name_he )
            `
          )
          .is('deleted_at', null)
          .eq('author_id', profileId)
          .eq('status', 'published')
          .eq('is_anonymous', false)
          .order('created_at', { ascending: false })
          .limit(500)

        if (pErr) throw pErr
        const pList = (postRows ?? []) as PostLite[]

        // 2) Fetch reaction summary per post (medals) and compute score
        const ids = pList.map(p => p.id)
        const score: Record<string, { comments: number; reactions: number }> = {}
        ids.forEach(id => (score[id] = { comments: 0, reactions: 0 }))

        if (ids.length > 0) {
          const { data: sums, error: sErr } = await supabase
            .from('post_reaction_summary')
            .select('post_id, gold, silver, bronze')
            .in('post_id', ids)

          if (sErr) throw sErr
            ; ((sums ?? []) as ReactionSummaryRow[]).forEach(r => {
              const g = r.gold ?? 0
              const s = r.silver ?? 0
              const b = r.bronze ?? 0
              // weighted (so gold matters more)
              score[r.post_id] = { ...(score[r.post_id] ?? { comments: 0, reactions: 0 }), reactions: g * 3 + s * 2 + b }
            })

          // 3) Fetch comments for these posts and count in JS (reliable; no GROUP BY headaches)
          const { data: cRows, error: cErr } = await supabase
            .from('comments')
            .select('id, post_id')
            .in('post_id', ids)
            .limit(5000)

          if (cErr) throw cErr
            ; ((cRows ?? []) as Array<{ id: string; post_id: string }>).forEach(r => {
              if (!score[r.post_id]) score[r.post_id] = { comments: 0, reactions: 0 }
              score[r.post_id].comments += 1
            })
        }

        // 4) Reaction totals for achievements tab
        const { data: rt, error: rtErr } = await supabase
          .from('profile_reaction_totals')
          .select('reaction_key, total_votes')
          .eq('profile_id', profileId)

        // Not fatal
        if (rtErr) {
          // eslint-disable-next-line no-console
          console.warn('profile_reaction_totals failed:', rtErr)
        }

        // 5) Comments-on-posts tab: build cards from raw comments + fetch posts + profiles
        let commentCards: CommentCard[] = []
        if (ids.length > 0) {
          // get last 500 comments on these posts
          const { data: rawComments, error: rawErr } = await supabase
            .from('comments')
            .select('id, content, created_at, author_id, post_id')
            .in('post_id', ids)
            .order('created_at', { ascending: false })
            .limit(500)

          if (rawErr) throw rawErr

          const rc = (rawComments ?? []) as CommentRow[]
          const commenterIds = Array.from(new Set(rc.map(r => r.author_id)))

          const postMap = new Map<string, { slug: string; title: string }>()
          pList.forEach(p => postMap.set(p.id, { slug: p.slug, title: p.title }))

          let profMap = new Map<string, ProfileLite>()
          if (commenterIds.length > 0) {
            const { data: profs, error: profErr } = await supabase
              .from('profiles')
              .select('id, username, display_name')
              .in('id', commenterIds)
              .limit(1000)

            if (profErr) throw profErr
              ; ((profs ?? []) as ProfileLite[]).forEach(p => profMap.set(p.id, p))
          }

          commentCards = rc
            .map(r => {
              const p = postMap.get(r.post_id)
              const a = profMap.get(r.author_id)
              if (!p || !a) return null
              return {
                id: r.id,
                created_at: r.created_at,
                content: r.content,
                post: p,
                author: { username: a.username, display_name: a.display_name },
              } satisfies CommentCard
            })
            .filter(Boolean) as CommentCard[]
        }

        if (cancelled) return
        setPosts(pList)
        setPostScores(score)
        setReactionTotals((rt ?? []) as ReactionTotal[])

        const { data: mt, error: mtErr } = await supabase
          .from('author_medal_totals')
          .select('gold, silver, bronze')
          .eq('author_id', profileId)
          .maybeSingle()

        if (mtErr) {
          // eslint-disable-next-line no-console
          console.warn('author_medal_totals failed:', mtErr)
        }
        setMedalTotals({
          gold: (mt?.gold ?? 0) as number,
          silver: (mt?.silver ?? 0) as number,
          bronze: (mt?.bronze ?? 0) as number,
        })
        setCommentsOnPosts(commentCards)
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : 'שגיאה לא ידועה'
        if (!cancelled) setError(msg)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    run()
    return () => {
      cancelled = true
    }
  }, [profileId])

  const postsSorted = useMemo(() => {
    const arr = [...posts]
    if (sort === 'recent') {
      arr.sort((a, b) => +new Date(b.created_at) - +new Date(a.created_at))
      return arr
    }
    if (sort === 'comments') {
      arr.sort((a, b) => (postScores[b.id]?.comments ?? 0) - (postScores[a.id]?.comments ?? 0))
      return arr
    }
    // reactions
    arr.sort((a, b) => (postScores[b.id]?.reactions ?? 0) - (postScores[a.id]?.reactions ?? 0))
    return arr
  }, [posts, postScores, sort])

  const postsTotalPages = Math.max(1, Math.ceil(postsSorted.length / POSTS_PER_PAGE))
  const postsPageItems = postsSorted.slice((postsPage - 1) * POSTS_PER_PAGE, postsPage * POSTS_PER_PAGE)

  const commentsTotalPages = Math.max(1, Math.ceil(commentsOnPosts.length / COMMENTS_PER_PAGE))
  const commentsPageItems = commentsOnPosts.slice(
    (commentsPage - 1) * COMMENTS_PER_PAGE,
    commentsPage * COMMENTS_PER_PAGE
  )

  const postCards = useMemo(() => {
    return postsPageItems.map<PostCardPost>(p => ({
      slug: p.slug,
      title: p.title,
      excerpt: p.excerpt,
      cover_image_url: p.cover_image_url,
      created_at: p.created_at,
      author_username: username,
      author_name: displayName,
      channel_name: p.channel?.[0]?.name_he ?? null,
      tags: [],
      medals: null,
    }))
  }, [postsPageItems, username, displayName])

  return (
    <section className="mt-6">
      <div className="rounded-3xl border bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-center gap-2">
          <TabButton active={tab === 'posts'} onClick={() => setTab('posts')}>פוסטים</TabButton>
          <TabButton active={tab === 'comments'} onClick={() => setTab('comments')}>תגובות על הפוסטים</TabButton>
          <TabButton active={tab === 'achievements'} onClick={() => setTab('achievements')}>הישגים</TabButton>

          <div className="flex-1" />

          {tab === 'posts' ? (
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">מיון:</span>
              <select
                className="rounded-lg border bg-white px-2 py-1 text-sm"
                value={sort}
                onChange={e => setSort(e.target.value as SortKey)}
              >
                <option value="recent">אחרונים</option>
                <option value="reactions">הכי הרבה ריאקשנים/מדליות</option>
                <option value="comments">הכי הרבה תגובות</option>
              </select>
            </div>
          ) : null}
        </div>

        {error ? (
          <div className="mt-4 rounded-2xl border bg-rose-50 p-4 text-sm text-rose-700">
            שגיאה: {error}
          </div>
        ) : null}

        {loading ? (
          <div className="mt-6 text-sm text-muted-foreground">טוען…</div>
        ) : tab === 'posts' ? (
          <div className="mt-4">
            {postCards.length === 0 ? (
              <div className="rounded-2xl border bg-neutral-50 p-4 text-sm text-muted-foreground">עדיין אין פוסטים.</div>
            ) : (
              <>
                <div className="space-y-3">
                  {postCards.map(p => (
                    <PostCard key={p.slug} post={p} variant="mypen-row" />
                  ))}
                </div>
                <div className="mt-4">
                  <PaginationNumbers
                    page={postsPage}
                    totalPages={postsTotalPages}
                    onPage={setPostsPage}
                  />
                </div>
              </>
            )}
          </div>
        ) : tab === 'comments' ? (
          <div className="mt-4">
            {commentsPageItems.length === 0 ? (
              <div className="rounded-2xl border bg-neutral-50 p-4 text-sm text-muted-foreground">עדיין אין תגובות על הפוסטים.</div>
            ) : (
              <>
                <div className="space-y-3">
                  {commentsPageItems.map(c => (
                    <div key={c.id} className="rounded-2xl border bg-white p-4">
                      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                        <span>
                          מאת{' '}
                          <Link className="text-blue-700 hover:underline" href={`/u/${encodeURIComponent(c.author.username)}`}>
                            {c.author.display_name ?? c.author.username}
                          </Link>
                        </span>
                        <span>•</span>
                        <span>{formatRelativeHe(c.created_at)}</span>
                        <span>•</span>
                        <Link className="text-blue-700 hover:underline" href={`/post/${c.post.slug}`}>
                          {c.post.title}
                        </Link>
                      </div>
                      <div className="mt-2 whitespace-pre-wrap text-sm leading-6 text-neutral-800">{c.content}</div>
                    </div>
                  ))}
                </div>
                <div className="mt-4">
                  <PaginationNumbers
                    page={commentsPage}
                    totalPages={commentsTotalPages}
                    onPage={setCommentsPage}
                  />
                </div>
              </>
            )}
          </div>
        ) : (
          <div className="mt-4">
            <div className="mb-4 rounded-2xl border bg-white p-4">
              <div className="text-sm font-bold">מדליות</div>
              <div className="mt-2 flex items-center gap-4 text-sm text-muted-foreground">
                <span>🥇 {medalTotals.gold}</span>
                <span>🥈 {medalTotals.silver}</span>
                <span>🥉 {medalTotals.bronze}</span>
              </div>
            </div>
            {reactionTotals.length === 0 ? (
              <div className="rounded-2xl border bg-neutral-50 p-4 text-sm text-muted-foreground">עדיין אין ריאקשנים.</div>
            ) : (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {reactionTotals
                  .filter(r => (r.total_votes ?? 0) > 0)
                  .sort((a, b) => (b.total_votes ?? 0) - (a.total_votes ?? 0))
                  .map(r => (
                    <div key={r.reaction_key} className="rounded-2xl border bg-white p-4">
                      <div className="text-sm font-bold">{labelForReaction(r.reaction_key)}</div>
                      <div className="mt-1 text-xs text-muted-foreground">סה״כ: {r.total_votes}</div>
                    </div>
                  ))}
              </div>
            )}
          </div>
        )}
      </div>
    </section>
  )
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        'rounded-full px-4 py-2 text-sm transition ' +
        (active
          ? 'bg-neutral-900 text-white'
          : 'bg-neutral-50 text-neutral-900 hover:bg-neutral-100')
      }
    >
      {children}
    </button>
  )
}

function PaginationNumbers({
  page,
  totalPages,
  onPage,
}: {
  page: number
  totalPages: number
  onPage: (n: number) => void
}) {
  if (totalPages <= 1) return null

  const windowSize = 5
  let start = Math.max(1, page - Math.floor(windowSize / 2))
  let end = Math.min(totalPages, start + windowSize - 1)
  start = Math.max(1, end - windowSize + 1)

  const nums = []
  for (let i = start; i <= end; i++) nums.push(i)

  return (
    <div className="flex flex-wrap items-center justify-center gap-2" dir="rtl">
      <button
        type="button"
        className="rounded-lg border bg-white px-3 py-1 text-sm disabled:opacity-50"
        disabled={page <= 1}
        onClick={() => onPage(page - 1)}
      >
        הקודם
      </button>

      {start > 1 ? (
        <>
          <PageBtn n={1} active={page === 1} onPage={onPage} />
          <span className="px-1 text-sm text-muted-foreground">…</span>
        </>
      ) : null}

      {nums.map(n => (
        <PageBtn key={n} n={n} active={page === n} onPage={onPage} />
      ))}

      {end < totalPages ? (
        <>
          <span className="px-1 text-sm text-muted-foreground">…</span>
          <PageBtn n={totalPages} active={page === totalPages} onPage={onPage} />
        </>
      ) : null}

      <button
        type="button"
        className="rounded-lg border bg-white px-3 py-1 text-sm disabled:opacity-50"
        disabled={page >= totalPages}
        onClick={() => onPage(page + 1)}
      >
        הבא
      </button>
    </div>
  )
}

function PageBtn({ n, active, onPage }: { n: number; active: boolean; onPage: (n: number) => void }) {
  return (
    <button
      type="button"
      onClick={() => onPage(n)}
      className={
        'min-w-[40px] rounded-lg border px-3 py-1 text-sm transition ' +
        (active ? 'bg-neutral-900 text-white' : 'bg-white hover:bg-neutral-50')
      }
    >
      {n}
    </button>
  )
}

function labelForReaction(key: string) {
  const map: Record<string, string> = {
    interesting: 'מעניין',
    moving: 'מרגש',
    funny: 'מצחיק',
    inspiring: 'מעורר השראה',
    relatable: 'מזדהה',
    well_written: 'כתוב היטב',
    smart: 'חכם',
    creative: 'יצירתי',
  }
  return map[key] ?? key
}

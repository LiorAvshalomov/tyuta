import { supabase } from '@/lib/supabaseClient'
import Avatar from '@/components/Avatar'
import ProfileRecentActivity from '@/components/ProfileRecentActivity'
import ProfileStatsCard from '@/components/ProfileStatsCard'
import ProfileOwnerActions from '@/components/ProfileOwnerActions'
import ProfileFollowBar from '@/components/ProfileFollowBar'
import PostCard, { type PostCardPost } from '@/components/PostCard'

type PageProps = {
  params: Promise<{ username: string }>
}

type Profile = {
  id: string
  username: string
  display_name: string | null
  avatar_url: string | null
  bio: string | null
  created_at: string | null
}

type PostRow = {
  id: string
  title: string
  slug: string
  excerpt: string | null
  cover_image_url: string | null
  created_at: string
  is_anonymous: boolean | null
  channel: { name_he: string }[] | null
  post_tags:
    | {
        tag:
          | {
              slug: string
              name_he: string
            }[]
          | null
      }[]
    | null
}

type SummaryRow = {
  post_id: string
  gold: number | null
  silver: number | null
  bronze: number | null
}

function safeText(s?: string | null) {
  return (s ?? '').trim()
}

function MedalPills({ gold, silver, bronze }: { gold: number; silver: number; bronze: number }) {
  return (
    <div className="flex items-center gap-2 shrink-0">
      <span className="rounded-full border bg-neutral-50 px-3 py-1 text-sm">🥉 {bronze}</span>
      <span className="rounded-full border bg-neutral-50 px-3 py-1 text-sm">🥈 {silver}</span>
      <span className="rounded-full border bg-neutral-50 px-3 py-1 text-sm">🥇 {gold}</span>
    </div>
  )
}

export default async function PublicProfilePage({ params }: PageProps) {
  const { username } = await params

  const { data: profile, error: pErr } = await supabase
    .from('profiles')
    .select('id, username, display_name, avatar_url, bio, created_at')
    .eq('username', username)
    .single()

  if (pErr || !profile) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-10" dir="rtl">
        <h1 className="text-2xl font-bold">לא נמצא פרופיל</h1>
        <p className="mt-2 text-sm text-muted-foreground">המשתמש @{username} לא קיים או הוסר.</p>
      </div>
    )
  }

  const prof = profile as Profile

  // initial counts (server)
  const { count: followersCount = 0 } = await supabase
    .from('user_follows')
    .select('follower_id', { count: 'exact', head: true })
    .eq('following_id', prof.id)

  const { count: followingCount = 0 } = await supabase
    .from('user_follows')
    .select('following_id', { count: 'exact', head: true })
    .eq('follower_id', prof.id)

  const { data: posts } = await supabase
    .from('posts')
    .select(
      `
      id,
      title,
      slug,
      excerpt,
      cover_image_url,
      created_at,
      is_anonymous,
      channel:channels ( name_he ),
      post_tags:post_tags ( tag:tags ( slug, name_he ) )
    `
    )
    .eq('author_id', prof.id)
    .eq('status', 'published')
    .eq('is_anonymous', false)
    .order('created_at', { ascending: false })
    .limit(30)

  const displayName = safeText(prof.display_name) || 'אנונימי'
  const bio = safeText(prof.bio)

  // medals per post (same behavior as Home page)
  const postIds = ((posts ?? []) as PostRow[]).map(p => p.id)
  const medalsByPost = new Map<string, { gold: number; silver: number; bronze: number }>()
  if (postIds.length > 0) {
    const { data: sums } = await supabase
      .from('post_reaction_summary')
      .select('post_id, gold, silver, bronze')
      .in('post_id', postIds)

    ;((sums ?? []) as SummaryRow[]).forEach(r => {
      medalsByPost.set(r.post_id, {
        gold: r.gold ?? 0,
        silver: r.silver ?? 0,
        bronze: r.bronze ?? 0,
      })
    })
  }

  const list = ((posts ?? []) as PostRow[]).map<PostCardPost>(p => ({
    slug: p.slug,
    title: p.title,
    excerpt: p.excerpt ?? null,
    cover_image_url: p.cover_image_url ?? null,
    created_at: p.created_at,
    author_username: prof.username,
    author_name: displayName,
    channel_name: p.channel?.[0]?.name_he ?? null,
    tags: (p.post_tags ?? [])
      .flatMap(pt => pt.tag ?? [])
      .map(t => ({ slug: t.slug, name_he: t.name_he })),
    medals: medalsByPost.get(p.id) ?? null,
  }))

  const postsCount = list.length

  const { count: commentsWritten = 0 } = await supabase
    .from('comments')
    .select('id', { count: 'exact', head: true })
    .eq('author_id', prof.id)

  let commentsReceived = 0
  if (list.length > 0) {
    const postIds = ((posts ?? []) as Array<{ id: string }>).map(p => p.id)
    const { count } = await supabase
      .from('comments')
      .select('id', { count: 'exact', head: true })
      .in('post_id', postIds)

    commentsReceived = count ?? 0
  }

  // medals עדיין 0 (כמו שהיה אצלך) — זה לא קשור לריאקשנים החדשים
  const medals = { gold: 0, silver: 0, bronze: 0 }

  // ✅ NEW: bring reaction totals via RPC (returns ALL reactions incl. zeros)
  const { data: reactionTotals, error: rtErr } = await supabase.rpc(
    'get_profile_reaction_totals',
    { p_profile_id: prof.id }
  )

  if (rtErr) {
    // לא שובר את הפרופיל אם יש בעיה — רק לוג לצורך debug
    console.error('get_profile_reaction_totals error:', rtErr)
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-8" dir="rtl">
      <section className="rounded-3xl border bg-white p-5 shadow-sm">
        {/* HEADER */}
        <div className="flex items-start gap-4">
          <div className="flex items-center gap-4 min-w-0 flex-1">
            <div className="shrink-0">
              <div className="rounded-full ring-2 ring-black/5 p-1">
                <Avatar src={prof.avatar_url} name={displayName} size={160} shape="square" />
              </div>
            </div>

            <div className="min-w-0 flex-1">
              <div className="flex items-start justify-between gap-3 w-full">
                <h1 className="min-w-0 text-2xl font-bold leading-tight break-words">
                  {displayName}
                </h1>

                <MedalPills gold={medals.gold} silver={medals.silver} bronze={medals.bronze} />
              </div>

              <div className="mt-1 text-sm text-muted-foreground">@{prof.username}</div>

              {bio ? (
                <p className="mt-3 max-w-xl text-sm leading-6 text-neutral-700 break-words [overflow-wrap:anywhere]">
                  {bio}
                </p>
              ) : (
                <p className="mt-3 max-w-xl text-sm leading-6 text-muted-foreground">
                  עדיין אין תיאור פרופיל.
                </p>
              )}

              <div className="mt-4 flex flex-wrap items-center gap-2">
                <StatPill label="פוסטים" value={postsCount ?? 0} />
                <StatPill label="תגובות שכתב" value={commentsWritten ?? 0} />
                <StatPill label="תגובות שקיבל" value={commentsReceived} />
              </div>
            </div>
          </div>

          <ProfileOwnerActions profileId={prof.id} />
        </div>

        {/* ✅ Follow bar with Realtime */}
        <ProfileFollowBar
          profileId={prof.id}
          username={prof.username}
          initialFollowers={followersCount ?? 0}
          initialFollowing={followingCount ?? 0}
        />
      </section>

      <section className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2">
        <ProfileStatsCard
          postsCount={postsCount ?? 0}
          commentsWritten={commentsWritten ?? 0}
          commentsReceived={commentsReceived ?? 0}
          medals={medals}
          reactionTotals={reactionTotals ?? []} // ✅ THIS is the important line
        />
        <ProfileRecentActivity userId={prof.id} />
      </section>

      <section className="mt-6">
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 className="text-lg font-bold">פוסטים אחרונים</h2>
          <div className="text-xs text-muted-foreground">מיון: אחרונים (ברירת מחדל)</div>
        </div>

        {list.length === 0 ? (
          <div className="rounded-2xl border bg-white p-5 text-sm text-muted-foreground">
            עדיין אין פוסטים.
          </div>
        ) : (
          <div className="space-y-3">
            {list.map(p => (
              <PostCard key={p.slug} post={p} variant="mypen-row" />
            ))}
          </div>
        )}
      </section>
    </div>
  )
}

function StatPill({ label, value }: { label: string; value: number }) {
  return (
    <div className="inline-flex items-center gap-2 rounded-full border bg-neutral-50 px-3 py-1.5">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="text-xs font-bold">{value}</span>
    </div>
  )
}

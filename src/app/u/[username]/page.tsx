import { supabase } from '@/lib/supabaseClient'
import Avatar from '@/components/Avatar'
import ProfileRecentActivity from '@/components/ProfileRecentActivity'
import ProfileOwnerActions from '@/components/ProfileOwnerActions'
import ProfileFollowBar from '@/components/ProfileFollowBar'
import ProfileBottomTabsClient from '@/components/ProfileBottomTabsClient'
import ProfilePersonalInfoCardClient from '@/components/ProfilePersonalInfoCardClient'

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

  // personal info (optional)
  personal_is_shared?: boolean | null
  personal_about?: string | null
  personal_age?: number | null
  personal_occupation?: string | null
  personal_writing_about?: string | null
  personal_books?: string | null
  personal_favorite_category?: string | null
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
    <div dir="ltr" className="flex items-center gap-2 shrink-0">
      <span className="rounded-full border bg-neutral-50 px-3 py-1 text-sm">🥇 {gold}</span>
      <span className="rounded-full border bg-neutral-50 px-3 py-1 text-sm">🥈 {silver}</span>
      <span className="rounded-full border bg-neutral-50 px-3 py-1 text-sm">🥉 {bronze}</span>
    </div>
  )
}

export default async function PublicProfilePage({ params }: PageProps) {
  const { username } = await params

  const { data: profile, error: pErr } = await supabase
    .from('profiles')
    .select(
      'id, username, display_name, avatar_url, bio, created_at, personal_is_shared, personal_about, personal_age, personal_occupation, personal_writing_about, personal_books, personal_favorite_category'
    )
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

  // Count total posts (for stats). We don't pull all posts on the server
  // because the profile bottom list is now fully client-side with pagination.
  const { count: postsCount = 0 } = await supabase
    .from('posts')
    .select('id', { count: 'exact', head: true })
    .is('deleted_at', null)
    .eq('author_id', prof.id)
    .eq('status', 'published')
    .eq('is_anonymous', false)

  const displayName = safeText(prof.display_name) || 'אנונימי'
  const bio = safeText(prof.bio)

  // Collect ids for "תגובות שקיבל" stat (bounded so we don't overload on huge accounts)
  const { data: postIdsRows } = await supabase
    .from('posts')
    .select('id')
    .is('deleted_at', null)
    .eq('author_id', prof.id)
    .eq('status', 'published')
    .eq('is_anonymous', false)
    .order('created_at', { ascending: false })
    .limit(5000)

  const { count: commentsWritten = 0 } = await supabase
    .from('comments')
    .select('id', { count: 'exact', head: true })
    .eq('author_id', prof.id)

  let commentsReceived = 0
  const postIds = (postIdsRows ?? []).map(r => r.id)
  if (postIds.length > 0) {
    const { count } = await supabase
      .from('comments')
      .select('id', { count: 'exact', head: true })
      .in('post_id', postIds)

    commentsReceived = count ?? 0
  }

  // ALL-TIME medals for profile (sum across all posts)
  const { data: medalsRow, error: medalsErr } = await supabase
    .from('profile_medals_all_time')
    .select('gold, silver, bronze')
    .eq('profile_id', prof.id)
    .single()

  if (medalsErr) {
    console.error('profile_medals_all_time error:', medalsErr)
  }

  const medals = {
    gold: (medalsRow?.gold ?? 0) as number,
    silver: (medalsRow?.silver ?? 0) as number,
    bronze: (medalsRow?.bronze ?? 0) as number,
  }

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
        <ProfilePersonalInfoCardClient
          profileId={prof.id}
          initial={{
            personal_is_shared: Boolean(prof.personal_is_shared),
            personal_about: prof.personal_about ?? null,
            personal_age: (prof.personal_age as number | null) ?? null,
            personal_occupation: prof.personal_occupation ?? null,
            personal_writing_about: prof.personal_writing_about ?? null,
            personal_books: prof.personal_books ?? null,
            personal_favorite_category: prof.personal_favorite_category ?? null,
          }}
        />
        <ProfileRecentActivity userId={prof.id} />
      </section>

      <ProfileBottomTabsClient
        profileId={prof.id}
        username={prof.username}
        postsCount={postsCount ?? 0}
        commentsWritten={commentsWritten ?? 0}
        commentsReceived={commentsReceived ?? 0}
        reactionTotals={reactionTotals ?? []}
      />
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

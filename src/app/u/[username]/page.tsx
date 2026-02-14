
import { createClient } from '@supabase/supabase-js'

import ProfileAvatarFrame from '@/components/ProfileAvatarFrame'
import ProfileFollowBar from '@/components/ProfileFollowBar'
import ProfileBottomTabsClient from '@/components/ProfileBottomTabsClient'
import ProfileInfoCardsSection from '@/components/ProfileInfoCardsSection'



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
  personal_is_shared?: boolean | null
  personal_about?: string | null
  personal_age?: number | null
  personal_occupation?: string | null
  personal_writing_about?: string | null
  personal_books?: string | null
  personal_favorite_category?: string | null
}

function getSupabase() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!supabaseUrl || !anonKey) return null
  return createClient(supabaseUrl, anonKey, { auth: { persistSession: false } })
}

function safeText(s?: string | null) {
  return (s ?? '').trim()
}


/* ─────────────────────────────────────────────────────────────
   Medal Pills - shows gold/silver/bronze counts
   ───────────────────────────────────────────────────────────── */
function MedalPills({ gold, silver, bronze }: { gold: number; silver: number; bronze: number }) {
  return (
    <div className="flex items-center gap-2">
      <span className="inline-flex items-center gap-1.5 rounded-full border border-neutral-200 bg-neutral-50 px-3 py-1.5 text-sm font-semibold transition-colors hover:bg-neutral-100">
        {bronze} <span className="text-base">🥉</span>
      </span>
      <span className="inline-flex items-center gap-1.5 rounded-full border border-neutral-200 bg-neutral-50 px-3 py-1.5 text-sm font-semibold transition-colors hover:bg-neutral-100">
        {silver} <span className="text-base">🥈</span>
      </span>
      <span className="inline-flex items-center gap-1.5 rounded-full border border-neutral-200 bg-neutral-50 px-3 py-1.5 text-sm font-semibold transition-colors hover:bg-neutral-100">
        {gold} <span className="text-base">🥇</span>
      </span>
    </div>
  )
}

/* ─────────────────────────────────────────────────────────────
   Stat Pill - individual stat display (posts, comments, etc.)
   ───────────────────────────────────────────────────────────── */
function StatPill({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-center justify-center gap-2 rounded-full border border-neutral-200 bg-neutral-50 px-4 py-2 transition-colors hover:bg-neutral-100">
      <span className="text-xs text-neutral-500">{label}:</span>
      <span className="text-sm font-bold">{value}</span>
    </div>
  )
}

export default async function PublicProfilePage({ params }: PageProps) {
  const { username } = await params

  const supabase = getSupabase()
  if (!supabase) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-10" dir="rtl">
        <h1 className="text-2xl font-bold">שגיאת מערכת</h1>
        <p className="mt-2 text-sm text-muted-foreground">לא ניתן להתחבר כרגע.</p>
      </div>
    )
  }
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

  // Follow counts
  const { count: followersCount = 0 } = await supabase
    .from('user_follows')
    .select('follower_id', { count: 'exact', head: true })
    .eq('following_id', prof.id)

  const { count: followingCount = 0 } = await supabase
    .from('user_follows')
    .select('following_id', { count: 'exact', head: true })
    .eq('follower_id', prof.id)

  // Posts count
  const { count: postsCount = 0 } = await supabase
    .from('posts')
    .select('id', { count: 'exact', head: true })
    .is('deleted_at', null)
    .eq('author_id', prof.id)
    .eq('status', 'published')
    .eq('is_anonymous', false)

  const displayName = safeText(prof.display_name) || 'אנונימי'
  const bio = safeText(prof.bio)

  // Comments written
  const { count: commentsWritten = 0 } = await supabase
    .from('comments')
    .select('id', { count: 'exact', head: true })
    .eq('author_id', prof.id)

  // Comments received (on user's posts)
  const { data: postIdsRows } = await supabase
    .from('posts')
    .select('id')
    .is('deleted_at', null)
    .eq('author_id', prof.id)
    .eq('status', 'published')
    .eq('is_anonymous', false)
    .order('created_at', { ascending: false })
    .limit(5000)

  let commentsReceived = 0
  const postIds = (postIdsRows ?? []).map(r => r.id)
  if (postIds.length > 0) {
    const { count } = await supabase
      .from('comments')
      .select('id', { count: 'exact', head: true })
      .in('post_id', postIds)
    commentsReceived = count ?? 0
  }

  // Medals (all-time)
  const { data: medalsRow } = await supabase
    .from('profile_medals_all_time')
    .select('gold, silver, bronze')
    .eq('profile_id', prof.id)
    .maybeSingle()

  const medals = {
    gold: medalsRow?.gold ?? 0,
    silver: medalsRow?.silver ?? 0,
    bronze: medalsRow?.bronze ?? 0,
  }

  // Reaction totals
  const { data: reactionTotals, error: rtErr } = await supabase.rpc('get_profile_reaction_totals', {
    p_profile_id: prof.id,
  })

  if (rtErr) {
    console.error('get_profile_reaction_totals error:', rtErr)
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-6 lg:py-8" dir="rtl">
      {/* ════════════════════════════════════════════════════════════
          PROFILE HEADER CARD
          ════════════════════════════════════════════════════════════ */}
      <section className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm transition-shadow hover:shadow-md lg:rounded-3xl lg:p-8">
        
        {/* ─────────────────────────────────────────
            MOBILE LAYOUT (default, hidden on lg+)
            ───────────────────────────────────────── */}
        <div className="lg:hidden">
          <div className="flex flex-col items-center text-center">
            {/* Avatar */}
            <ProfileAvatarFrame src={prof.avatar_url} name={displayName} size={160} shape="square" />
            
            {/* Name + Username */}
            <h1 className="mt-4 break-words text-2xl font-black leading-tight">{displayName}</h1>
            <div className="mt-1 text-sm text-neutral-500">@{prof.username}</div>

            {/* Bio */}
            {bio && (
              <p className="mt-4 max-w-[38ch] break-words text-sm leading-relaxed text-neutral-600 [overflow-wrap:anywhere]">
                {bio}
              </p>
            )}

            {/* Stats */}
            <div className="mt-5 flex w-full flex-wrap justify-center gap-2">
              <StatPill label="פוסטים" value={postsCount ?? 0} />
              <StatPill label="תגובות שכתב" value={commentsWritten ?? 0} />
              <StatPill label="תגובות שקיבל" value={commentsReceived} />
            </div>

            {/* Medals */}
            <div className="mt-4">
              <MedalPills gold={medals.gold} silver={medals.silver} bronze={medals.bronze} />
            </div>
          </div>
        </div>

        {/* ─────────────────────────────────────────
            DESKTOP LAYOUT (lg and up)
            ───────────────────────────────────────── */}
        <div className="hidden lg:block">
          {/* Medals positioned top-left */}
          <div className="mb-4 flex justify-end">
            <MedalPills gold={medals.gold} silver={medals.silver} bronze={medals.bronze} />
          </div>

          {/* Avatar + Name row */}
          <div className="flex items-start gap-6">
            {/* Avatar on the right (RTL) */}
            <div className="shrink-0">
              <ProfileAvatarFrame src={prof.avatar_url} name={displayName} size={200} shape="square" />
            </div>

            {/* Name + Username + Bio */}
            <div className="flex min-w-0 flex-1 flex-col pt-2">
              <h1 className="break-words text-4xl font-black leading-tight">{displayName}</h1>
              <div className="mt-1 text-sm text-neutral-500">@{prof.username}</div>
              
              {bio && (
                <p className="mt-4 max-w-[50ch] break-words text-sm leading-relaxed text-neutral-600 [overflow-wrap:anywhere]">
                  {bio}
                </p>
              )}
            </div>
          </div>

          {/* Stats - centered */}
          <div className="mt-6 flex flex-wrap justify-center gap-3">
            <StatPill label="פוסטים" value={postsCount ?? 0} />
            <StatPill label="תגובות שכתב" value={commentsWritten ?? 0} />
            <StatPill label="תגובות שקיבל" value={commentsReceived} />
          </div>
        </div>

        {/* ─────────────────────────────────────────
            FOLLOW BAR (shared between mobile & desktop)
            ───────────────────────────────────────── */}
        <ProfileFollowBar
          profileId={prof.id}
          username={prof.username}
          initialFollowers={followersCount ?? 0}
          initialFollowing={followingCount ?? 0}
        />
      </section>

      {/* ════════════════════════════════════════════════════════════
          INFO CARDS ROW (Personal Info + Recent Activity)
          Mobile: stacked | Desktop: 2 columns, same height
          ════════════════════════════════════════════════════════════ */}
      <ProfileInfoCardsSection
        profileId={prof.id}
        userId={prof.id}
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

      {/* ════════════════════════════════════════════════════════════
          BOTTOM TABS (Posts / Stats)
          ════════════════════════════════════════════════════════════ */}
      <ProfileBottomTabsClient
        profileId={prof.id}
        username={prof.username}
        postsCount={postsCount ?? 0}
        commentsWritten={commentsWritten ?? 0}
        commentsReceived={commentsReceived ?? 0}
        medals={medals}
        reactionTotals={reactionTotals ?? []}
      />
    </div>
  )
}
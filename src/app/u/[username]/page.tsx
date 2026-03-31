
import { createClient } from '@supabase/supabase-js'
import { cache } from 'react'
import type { Metadata } from 'next'

export const revalidate = 60

import ProfileAvatarFrame from '@/components/ProfileAvatarFrame'
import ProfileFollowBar from '@/components/ProfileFollowBar'
import ProfileBottomTabsClient from '@/components/ProfileBottomTabsClient'
import ProfileInfoCardsSection from '@/components/ProfileInfoCardsSection'



const SITE_URL = 'https://tyuta.net'

type PageProps = {
  params: Promise<{ username: string }>
}

// React cache deduplicates: generateMetadata + page body share one DB round-trip
const fetchProfileSeo = cache(async (username: string) => {
  const supabase = getSupabase()
  if (!supabase) return null
  const { data } = await supabase
    .from('profiles')
    .select('username, display_name, bio, avatar_url')
    .eq('username', username)
    .maybeSingle()
  return data as { username: string; display_name: string | null; bio: string | null; avatar_url: string | null } | null
})

function absUrl(pathOrUrl: string): string {
  if (pathOrUrl.startsWith('http')) return pathOrUrl
  if (!pathOrUrl.startsWith('/')) return `${SITE_URL}/${pathOrUrl}`
  return `${SITE_URL}${pathOrUrl}`
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { username } = await params
  const canonical = `${SITE_URL}/u/${encodeURIComponent(username)}`
  const data = await fetchProfileSeo(username)

  if (!data) {
    return {
      title: 'פרופיל לא נמצא',
      alternates: { canonical },
      robots: { index: false, follow: false },
      openGraph: { type: 'website', url: canonical },
      twitter: { card: 'summary' },
    }
  }

  const name = (data.display_name ?? '').trim() || `@${data.username}`
  const description = ((data.bio ?? '').trim() || 'פרופיל משתמש ב‑Tyuta').slice(0, 200)
  const image = data.avatar_url ? absUrl(data.avatar_url) : absUrl('/apple-touch-icon.png')

  return {
    title: name,
    description,
    alternates: { canonical },
    openGraph: {
      type: 'profile',
      url: canonical,
      title: `${name} | Tyuta`,
      description,
      siteName: 'Tyuta',
      locale: 'he_IL',
      images: [{ url: image }],
    },
    twitter: {
      card: 'summary',
      title: `${name} | Tyuta`,
      description,
      images: [image],
    },
  }
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
      <span className="inline-flex items-center gap-1.5 rounded-full border border-neutral-200 bg-neutral-50 px-3 py-1.5 text-sm font-semibold transition-colors hover:bg-neutral-100 dark:border-border dark:bg-muted dark:hover:bg-muted/80">
        {bronze} <span className="text-base">🥉</span>
      </span>
      <span className="inline-flex items-center gap-1.5 rounded-full border border-neutral-200 bg-neutral-50 px-3 py-1.5 text-sm font-semibold transition-colors hover:bg-neutral-100 dark:border-border dark:bg-muted dark:hover:bg-muted/80">
        {silver} <span className="text-base">🥈</span>
      </span>
      <span className="inline-flex items-center gap-1.5 rounded-full border border-neutral-200 bg-neutral-50 px-3 py-1.5 text-sm font-semibold transition-colors hover:bg-neutral-100 dark:border-border dark:bg-muted dark:hover:bg-muted/80">
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
    <div className="flex items-center justify-center gap-2 rounded-full border border-neutral-200 bg-neutral-50 px-4 py-2 transition-colors hover:bg-neutral-100 dark:border-border dark:bg-muted dark:hover:bg-muted/80">
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

  const displayName = safeText(prof.display_name) || 'אנונימי'
  const bio = safeText(prof.bio)

  // Batch 1: all queries independent of each other — runs in parallel
  const [
    { count: followersCount = 0 },
    { count: followingCount = 0 },
    { count: postsCount = 0 },
    { count: commentsWritten = 0 },
    { data: medalsRow },
    { data: commentsReceivedRaw },
  ] = await Promise.all([
    supabase
      .from('user_follows')
      .select('follower_id', { count: 'exact', head: true })
      .eq('following_id', prof.id),
    supabase
      .from('user_follows')
      .select('following_id', { count: 'exact', head: true })
      .eq('follower_id', prof.id),
    supabase
      .from('posts')
      .select('id', { count: 'exact', head: true })
      .is('deleted_at', null)
      .eq('author_id', prof.id)
      .eq('status', 'published')
      .eq('is_anonymous', false),
    supabase
      .from('comments')
      .select('id', { count: 'exact', head: true })
      .eq('author_id', prof.id),
    supabase
      .from('profile_medals_all_time')
      .select('gold, silver, bronze')
      .eq('profile_id', prof.id)
      .maybeSingle(),
    supabase.rpc('get_comments_received_count', { p_author_id: prof.id }),
  ])

  const commentsReceived = Number(commentsReceivedRaw ?? 0)

  const medals = {
    gold: medalsRow?.gold ?? 0,
    silver: medalsRow?.silver ?? 0,
    bronze: medalsRow?.bronze ?? 0,
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-6 lg:py-8" dir="rtl">
      {/* ════════════════════════════════════════════════════════════
          PROFILE HEADER CARD
          ════════════════════════════════════════════════════════════ */}
      <section className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm transition-shadow hover:shadow-md lg:rounded-3xl lg:p-8 dark:bg-card dark:border-border">
        
        {/* ─────────────────────────────────────────
            MOBILE LAYOUT (default, hidden on lg+)
            ───────────────────────────────────────── */}
        <div className="lg:hidden">
          <div className="flex flex-col items-center text-center">
            {/* Avatar */}
            <ProfileAvatarFrame src={prof.avatar_url} name={displayName} size={160} shape="square" />
            
            {/* Name + Username */}
            <h1 className="mt-4 break-words text-2xl font-black leading-tight">{displayName}</h1>
            <div className="mt-1 text-sm text-neutral-500 dark:text-muted-foreground">@{prof.username}</div>

            {/* Bio */}
            {bio && (
              <p className="mt-4 max-w-[38ch] break-words text-sm leading-relaxed text-neutral-600 dark:text-muted-foreground [overflow-wrap:anywhere]">
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
              <div className="mt-1 text-sm text-neutral-500 dark:text-muted-foreground">@{prof.username}</div>
              
              {bio && (
                <p className="mt-4 max-w-[50ch] break-words text-sm leading-relaxed text-neutral-600 dark:text-muted-foreground [overflow-wrap:anywhere]">
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
      />
    </div>
  )
}

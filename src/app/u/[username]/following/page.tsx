import { supabase } from '@/lib/supabaseClient'
import FollowListClient from '@/components/FollowListClient'
import FollowPageHeader from '@/components/FollowPageHeader'

export const revalidate = 60

type PageProps = {
  params: Promise<{ username: string }>
}

export default async function FollowingPage({ params }: PageProps) {
  const { username } = await params

  const { data: prof, error: pErr } = await supabase
    .from('profiles')
    .select('id, username, display_name, avatar_url')
    .eq('username', username)
    .single()

  if (pErr || !prof) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-10" dir="rtl">
        <h1 className="text-2xl font-bold">לא נמצא פרופיל</h1>
      </div>
    )
  }

  const displayName = (prof.display_name ?? '').trim() || 'אנונימי'

  // Batch 1: all queries independent of each other — runs in parallel
  // following rows query uses count: 'exact' to get both total count and row data in one request
  const [
    { data: rows, count: followingCount },
    { data: medalsRow },
  ] = await Promise.all([
    supabase
      .from('user_follows')
      .select('following_id', { count: 'exact' })
      .eq('follower_id', prof.id)
      .order('created_at', { ascending: false })
      .limit(200),
    supabase
      .from('profile_medals_all_time')
      .select('gold, silver, bronze')
      .eq('profile_id', prof.id)
      .maybeSingle(),
  ])

  const ids = (rows ?? []).map(r => (r as { following_id: string }).following_id).filter(Boolean)

  // Batch 2: profile cards depend on ids from batch 1
  let initialUsers: { id: string; username: string; display_name: string | null; avatar_url: string | null; followers_count: number }[] = []
  if (ids.length > 0) {
    const { data: cards } = await supabase
      .from('profile_follow_counts')
      .select('profile_id, username, display_name, avatar_url, followers_count')
      .in('profile_id', ids)

    initialUsers = (cards ?? []).map((c: { profile_id: string; username: string; display_name: string | null; avatar_url: string | null; followers_count: number | null }) => ({
      id: c.profile_id,
      username: c.username,
      display_name: c.display_name,
      avatar_url: c.avatar_url,
      followers_count: c.followers_count ?? 0,
    }))
  }

  const medals = {
    gold: medalsRow?.gold ?? 0,
    silver: medalsRow?.silver ?? 0,
    bronze: medalsRow?.bronze ?? 0,
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-6" dir="rtl">
      <FollowPageHeader
        username={prof.username}
        displayName={displayName}
        avatarUrl={prof.avatar_url}
        medals={medals}
      />

      <div className="mt-6">
        <FollowListClient
          title={`עוקב אחרי (${followingCount ?? 0})`}
          subjectProfileId={prof.id}
          mode="following"
          initialUsers={initialUsers}
        />
      </div>
    </div>
  )
}

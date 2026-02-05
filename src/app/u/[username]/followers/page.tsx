import { supabase } from '@/lib/supabaseClient'
import FollowListClient from '@/components/FollowListClient'
import FollowPageHeader from '@/components/FollowPageHeader'

type PageProps = {
  params: Promise<{ username: string }>
}

export default async function FollowersPage({ params }: PageProps) {
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

  // Counts
  const { count: followersCount = 0 } = await supabase
    .from('user_follows')
    .select('follower_id', { count: 'exact', head: true })
    .eq('following_id', prof.id)

  const { count: followingCount = 0 } = await supabase
    .from('user_follows')
    .select('following_id', { count: 'exact', head: true })
    .eq('follower_id', prof.id)

  // Followers list
  const { data: rows } = await supabase
    .from('user_follows')
    .select('follower_id')
    .eq('following_id', prof.id)
    .order('created_at', { ascending: false })
    .limit(200)

  const ids = (rows ?? []).map(r => (r as { follower_id: string }).follower_id).filter(Boolean)

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

  // Get medals
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

  return (
    <div className="mx-auto max-w-2xl px-4 py-6" dir="rtl">
      <FollowPageHeader
        profileId={prof.id}
        username={prof.username}
        displayName={displayName}
        avatarUrl={prof.avatar_url}
        initialFollowers={followersCount ?? 0}
        initialFollowing={followingCount ?? 0}
        medals={medals}
      />

      <div className="mt-6">
        <FollowListClient
          title={`עוקבים (${followersCount ?? 0})`}
          subjectProfileId={prof.id}
          mode="followers"
          initialUsers={initialUsers}
        />
      </div>
    </div>
  )
}

import FollowListClient from '@/components/FollowListClient'
import FollowPageHeader from '@/components/FollowPageHeader'
import { createPublicServerClient } from '@/lib/supabase/createPublicServerClient'

export const revalidate = 60

type PageProps = {
  params: Promise<{ username: string }>
}

export default async function FollowingPage({ params }: PageProps) {
  const { username } = await params
  const supabase = createPublicServerClient()

  if (!supabase) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-10" dir="rtl">
        <h1 className="text-2xl font-bold">שגיאת מערכת</h1>
      </div>
    )
  }

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('id, username, display_name, avatar_url')
    .eq('username', username)
    .single()

  if (profileError || !profile) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-10" dir="rtl">
        <h1 className="text-2xl font-bold">לא נמצא פרופיל</h1>
      </div>
    )
  }

  const displayName = (profile.display_name ?? '').trim() || 'אנונימי'

  const [{ data: rows, count: followingCount }, { data: medalsRow }] = await Promise.all([
    supabase
      .from('user_follows')
      .select('following_id', { count: 'exact' })
      .eq('follower_id', profile.id)
      .order('created_at', { ascending: false })
      .limit(200),
    supabase
      .from('profile_medals_all_time')
      .select('gold, silver, bronze')
      .eq('profile_id', profile.id)
      .maybeSingle(),
  ])

  const followedIds = (rows ?? [])
    .map((row) => (row as { following_id: string }).following_id)
    .filter(Boolean)

  let initialUsers: Array<{
    id: string
    username: string
    display_name: string | null
    avatar_url: string | null
    followers_count: number
  }> = []

  if (followedIds.length > 0) {
    const { data: cards } = await supabase
      .from('profile_follow_counts')
      .select('profile_id, username, display_name, avatar_url, followers_count')
      .in('profile_id', followedIds)

    initialUsers = (cards ?? []).map((card: {
      profile_id: string
      username: string
      display_name: string | null
      avatar_url: string | null
      followers_count: number | null
    }) => ({
      id: card.profile_id,
      username: card.username,
      display_name: card.display_name,
      avatar_url: card.avatar_url,
      followers_count: card.followers_count ?? 0,
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
        username={profile.username}
        displayName={displayName}
        avatarUrl={profile.avatar_url}
        medals={medals}
      />

      <div className="mt-6">
        <FollowListClient
          title={`עוקב אחרי (${followingCount ?? 0})`}
          subjectProfileId={profile.id}
          mode="following"
          initialUsers={initialUsers}
        />
      </div>
    </div>
  )
}

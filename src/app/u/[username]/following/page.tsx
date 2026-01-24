import { supabase } from '@/lib/supabaseClient'
import FollowListClient from '@/components/FollowListClient'
import FollowPageHeader from '@/components/FollowPageHeader'

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

  // counts (initial)
  const { count: followersCount = 0 } = await supabase
    .from('user_follows')
    .select('follower_id', { count: 'exact', head: true })
    .eq('following_id', prof.id)

  const { count: followingCount = 0 } = await supabase
    .from('user_follows')
    .select('following_id', { count: 'exact', head: true })
    .eq('follower_id', prof.id)

  // list ids
  const { data: rows } = await supabase
    .from('user_follows')
    .select('following_id')
    .eq('follower_id', prof.id)
    .order('created_at', { ascending: false })
    .limit(200)

  const ids = (rows ?? []).map(r => (r as any).following_id).filter(Boolean)

  let initialUsers: any[] = []
  if (ids.length > 0) {
    const { data: cards } = await supabase
      .from('profile_follow_counts')
      .select('profile_id, username, display_name, avatar_url, followers_count')
      .in('profile_id', ids)

    initialUsers =
      (cards ?? []).map((c: any) => ({
        id: c.profile_id,
        username: c.username,
        display_name: c.display_name,
        avatar_url: c.avatar_url,
        followers_count: c.followers_count ?? 0,
      })) ?? []
  }

  const medals = { gold: 0, silver: 0, bronze: 0 }

  return (
    <div className="mx-auto max-w-3xl px-4 py-8" dir="rtl">
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
          title={`${displayName} עוקב אחרי`}
          subjectProfileId={prof.id}
          mode="following"
          initialUsers={initialUsers}
        />
      </div>
    </div>
  )
}

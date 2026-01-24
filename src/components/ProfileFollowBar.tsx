'use client'

import Link from 'next/link'
import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabaseClient'
import FollowButton from '@/components/FollowButton'
import ProfileNonOwnerActions from '@/components/ProfileNonOwnerActions'

export default function ProfileFollowBar({
  profileId,
  username,
  initialFollowers,
  initialFollowing,
}: {
  profileId: string
  username: string
  initialFollowers: number
  initialFollowing: number
}) {
  const router = useRouter()

  const [followersCount, setFollowersCount] = useState(initialFollowers)
  const [followingCount, setFollowingCount] = useState(initialFollowing)
  const [meId, setMeId] = useState<string | null>(null)

  const isAuthed = !!meId
  const isMe = !!meId && meId === profileId

  const refreshCounts = useCallback(async () => {
    const [{ count: followers = 0 }, { count: following = 0 }] = await Promise.all([
      supabase
        .from('user_follows')
        .select('follower_id', { count: 'exact', head: true })
        .eq('following_id', profileId),
      supabase
        .from('user_follows')
        .select('following_id', { count: 'exact', head: true })
        .eq('follower_id', profileId),
    ])

    setFollowersCount(followers ?? 0)
    setFollowingCount(following ?? 0)
  }, [profileId])

  useEffect(() => {
    let mounted = true

    async function loadMe() {
      const { data, error } = await supabase.auth.getUser()
      if (!mounted) return

      if (error || !data.user?.id) {
        setMeId(null)
        return
      }
      setMeId(data.user.id)
    }

    loadMe()

    const { data: sub } = supabase.auth.onAuthStateChange(() => {
      loadMe()
    })

    return () => {
      mounted = false
      sub.subscription.unsubscribe()
    }
  }, [])

  useEffect(() => {
    const ch = supabase
      .channel(`follow_counts:${profileId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'user_follows', filter: `following_id=eq.${profileId}` },
        () => void refreshCounts()
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'user_follows', filter: `follower_id=eq.${profileId}` },
        () => void refreshCounts()
      )
      .subscribe()

    return () => {
      supabase.removeChannel(ch)
    }
  }, [profileId, refreshCounts])

  return (
    <div className="mt-6 border-t pt-4">
      <div className="flex flex-wrap items-center gap-2">
        <Link
          href={`/u/${username}/followers`}
          className="rounded-full border bg-white px-4 py-2 text-sm font-semibold hover:bg-neutral-50"
        >
          עוקבים <span className="ms-2 text-muted-foreground">{followersCount}</span>
        </Link>

        <Link
          href={`/u/${username}/following`}
          className="rounded-full border bg-white px-4 py-2 text-sm font-semibold hover:bg-neutral-50"
        >
          נעקבים <span className="ms-2 text-muted-foreground">{followingCount}</span>
        </Link>

        <div className="ms-auto flex items-center gap-2">
          {/* ✅ לא מציגים הודעה/מעקב על עצמי */}
          {isMe ? null : !isAuthed ? (
            <button
              onClick={() => {
                alert('כדי לעקוב/לשלוח הודעה צריך להתחבר 🙂')
                router.push('/login')
              }}
              className="rounded-full bg-black px-4 py-2 text-sm font-semibold text-white hover:opacity-90"
            >
              התחבר
            </button>
          ) : (
            <>
              <FollowButton targetUserId={profileId} targetUsername={username} />
              {/* ✅ אצלך כנראה הטייפ הוא רק profileId */}
              <ProfileNonOwnerActions profileId={profileId} />
            </>
          )}
        </div>
      </div>
    </div>
  )
}

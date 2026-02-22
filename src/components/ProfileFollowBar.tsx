'use client'

import Link from 'next/link'
import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'
import FollowButton from '@/components/FollowButton'
import ProfileNonOwnerActions from '@/components/ProfileNonOwnerActions'

/* ─────────────────────────────────────────────────────────────
   Format large numbers (1000 → 1K, etc.)
   ───────────────────────────────────────────────────────────── */
function formatCount(n: number): string {
  if (n >= 1000000) return `${(n / 1000000).toFixed(1).replace(/\.0$/, '')}M`
  if (n >= 1000) return `${(n / 1000).toFixed(1).replace(/\.0$/, '')}K`
  return n.toString()
}

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
    <div className="mt-6">
      {/* Full-width divider */}
      <div className="-mx-5 border-t border-neutral-200 pt-5 lg:-mx-8 dark:border-border">
        <div className="flex items-center justify-between px-2 lg:px-8 pt-4">
          {/* Follow counts (RIGHT side in RTL) */}
          <div className="flex items-center gap-2">
            <Link
              href={`/u/${username}/followers`}
              className="group flex flex-col items-center transition-transform hover:scale-105 active:scale-95"
            >
              <span className="text-2xl font-black leading-none transition-colors group-hover:text-blue-600">
                {formatCount(followersCount)}
              </span>
              <span className="mt-1 text-xs text-neutral-500 transition-colors group-hover:text-neutral-700 dark:text-muted-foreground dark:group-hover:text-foreground">
                עוקבים
              </span>
            </Link>

            <Link
              href={`/u/${username}/following`}
              className="group flex flex-col items-center transition-transform hover:scale-105 active:scale-95"
            >
              <span className="text-2xl font-black leading-none transition-colors group-hover:text-blue-600">
                {formatCount(followingCount)}
              </span>
              <span className="mt-1 text-xs text-neutral-500 transition-colors group-hover:text-neutral-700 dark:text-muted-foreground dark:group-hover:text-foreground">
                עוקב אחרי
              </span>
            </Link>
          </div>

          {/* Action buttons (LEFT side in RTL) */}
          <div className="flex items-center gap-2">
            {isMe || !isAuthed ? null : (
              <>
                <FollowButton targetUserId={profileId} targetUsername={username} />
                <ProfileNonOwnerActions profileId={profileId} />
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

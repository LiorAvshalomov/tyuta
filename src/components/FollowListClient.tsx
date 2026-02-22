'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import FollowButton from '@/components/FollowButton'
import ProfileAvatarFrame from '@/components/ProfileAvatarFrame'
import { supabase } from '@/lib/supabaseClient'

type UserCard = {
  id: string
  username: string
  display_name: string | null
  avatar_url: string | null
  followers_count: number
}

type FollowerRow = { follower_id: string | null }
type FollowingRow = { following_id: string | null }

type ProfileFollowCountRow = {
  profile_id: string
  username: string
  display_name: string | null
  avatar_url: string | null
  followers_count: number | null
}

function displayNameOnly(u: UserCard) {
  return (u.display_name ?? '').trim() || u.username
}

function mapCards(cards: ProfileFollowCountRow[] | null): UserCard[] {
  return (cards ?? []).map(c => ({
    id: c.profile_id,
    username: c.username,
    display_name: c.display_name,
    avatar_url: c.avatar_url,
    followers_count: c.followers_count ?? 0,
  }))
}

export default function FollowListClient({
  title,
  subjectProfileId,
  mode,
  initialUsers,
}: {
  title: string
  subjectProfileId: string
  mode: 'followers' | 'following'
  initialUsers: UserCard[]
}) {
  const [users, setUsers] = useState<UserCard[]>(initialUsers)

  const refresh = useCallback(async () => {
    if (mode === 'followers') {
      const { data: rows } = await supabase
        .from('user_follows')
        .select('follower_id')
        .eq('following_id', subjectProfileId)
        .order('created_at', { ascending: false })
        .limit(400)

      const ids = ((rows ?? []) as FollowerRow[])
        .map(r => r.follower_id)
        .filter((v): v is string => !!v)

      if (ids.length === 0) {
        setUsers([])
        return
      }

      const { data: cards } = await supabase
        .from('profile_follow_counts')
        .select('profile_id, username, display_name, avatar_url, followers_count')
        .in('profile_id', ids)

      const mapped = mapCards(cards as ProfileFollowCountRow[] | null)
      const order = new Map(ids.map((id, idx) => [id, idx]))
      mapped.sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0))
      setUsers(mapped)
      return
    }

    const { data: rows } = await supabase
      .from('user_follows')
      .select('following_id')
      .eq('follower_id', subjectProfileId)
      .order('created_at', { ascending: false })
      .limit(400)

    const ids = ((rows ?? []) as FollowingRow[])
      .map(r => r.following_id)
      .filter((v): v is string => !!v)

    if (ids.length === 0) {
      setUsers([])
      return
    }

    const { data: cards } = await supabase
      .from('profile_follow_counts')
      .select('profile_id, username, display_name, avatar_url, followers_count')
      .in('profile_id', ids)

    const mapped = mapCards(cards as ProfileFollowCountRow[] | null)
    const order = new Map(ids.map((id, idx) => [id, idx]))
    mapped.sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0))
    setUsers(mapped)
  }, [mode, subjectProfileId])

  useEffect(() => {
    const ch = supabase
      .channel(`follow_list:${subjectProfileId}:${mode}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'user_follows' }, payload => {
        const n = payload.new as Partial<FollowerRow & FollowingRow> | null
        const o = payload.old as Partial<FollowerRow & FollowingRow> | null

        const follower = (n?.follower_id ?? o?.follower_id) ?? null
        const following = (n?.following_id ?? o?.following_id) ?? null

        const touchesSubject = follower === subjectProfileId || following === subjectProfileId
        if (touchesSubject) void refresh()
      })
      .subscribe()

    return () => {
      supabase.removeChannel(ch)
    }
  }, [subjectProfileId, mode, refresh])

  const emptyText = useMemo(() => {
    return mode === 'followers' ? 'עדיין אין עוקבים.' : 'עדיין לא עוקב אחרי אף אחד.'
  }, [mode])

  return (
    <div dir="rtl">
      {/* Title */}
      <h2 className="text-lg font-bold mb-4">{title || (mode === 'followers' ? 'עוקבים' : 'נעקבים')}</h2>

      {users.length === 0 ? (
        <div className="rounded-2xl border border-neutral-200 bg-white p-6 text-center dark:bg-card dark:border-border">
          <div className="text-3xl mb-2">👥</div>
          <p className="text-sm text-neutral-500 dark:text-muted-foreground">{emptyText}</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {users.map(u => {
            const name = displayNameOnly(u)

            return (
              <div
                key={u.id}
                className="rounded-xl border border-neutral-200 bg-white p-3 transition-shadow hover:shadow-sm dark:bg-card dark:border-border"
              >
                <div className="flex items-center gap-3">
                  {/* Avatar - using ProfileAvatarFrame like in profile */}
                  <Link href={`/u/${u.username}`} className="shrink-0">
                    <ProfileAvatarFrame 
                      src={u.avatar_url} 
                      name={name} 
                      size={56} 
                      shape="square" 
                    />
                  </Link>

                  {/* Name + followers */}
                  <div className="min-w-0 flex-1">
                    <Link
                      href={`/u/${u.username}`}
                      className="block font-bold text-sm hover:text-blue-600 transition-colors truncate"
                      title={name}
                    >
                      {name}
                    </Link>
                    <div className="text-xs text-neutral-500 mt-0.5 truncate dark:text-muted-foreground">
                      @{u.username}
                    </div>
                    <div className="text-xs text-neutral-500 mt-1 dark:text-muted-foreground">
                      <span className="font-semibold text-neutral-700 dark:text-foreground">{u.followers_count}</span> עוקבים
                    </div>
                  </div>

                  {/* Follow button */}
                  <div className="shrink-0">
                    <FollowButton targetUserId={u.id} targetUsername={u.username} />
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

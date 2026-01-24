'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import FollowButton from '@/components/FollowButton'
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
    <div className="mx-auto max-w-3xl px-4 py-6" dir="rtl">
      <div className="mb-4 mx-auto w-full max-w-3xl rounded-md bg-red-300 px-4 py-2 text-center text-sm font-bold text-white">
        {title || (mode === 'followers' ? 'עוקבים' : 'נעקבים')}
      </div>

      {users.length === 0 ? (
        <div className="rounded-2xl border bg-white p-5 text-sm text-muted-foreground">{emptyText}</div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {users.map(u => {
            const name = displayNameOnly(u)
            const initial = (name.trim()[0] ?? 'א').toUpperCase()

            return (
              <div key={u.id} className="rounded-2xl border bg-white p-3">
                <div className="grid grid-cols-[88px_1fr] items-start gap-3">
                  <Link href={`/u/${u.username}`} className="block">
                    <div className="h-[88px] w-[88px] overflow-hidden rounded-xl border bg-neutral-100">
                      {u.avatar_url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={u.avatar_url}
                          alt={name}
                          className="h-full w-full object-cover"
                          loading="lazy"
                        />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center text-2xl font-black text-neutral-500">
                          {initial}
                        </div>
                      )}
                    </div>
                  </Link>

                  <div className="min-w-0">
                    <Link
                      href={`/u/${u.username}`}
                      className="block truncate text-sm font-bold hover:underline"
                      title={name}
                    >
                      {name}
                    </Link>

                    <div className="mt-2 text-xs">
                      <span className="font-bold">{u.followers_count}</span>{' '}
                      <span className="text-muted-foreground">עוקבים</span>
                    </div>

                    <div className="mt-3">
                      <FollowButton targetUserId={u.id} targetUsername={u.username} />
                    </div>
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

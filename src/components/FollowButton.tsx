'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'

export default function FollowButton({
  targetUserId,
  targetUsername,
}: {
  targetUserId: string
  targetUsername: string
}) {
  const [myId, setMyId] = useState<string | null>(null)
  const [isFollowing, setIsFollowing] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let mounted = true

    async function init() {
      const { data } = await supabase.auth.getUser()
      const uid = data?.user?.id ?? null
      if (!mounted) return
      setMyId(uid)

      if (!uid || uid === targetUserId) {
        setLoading(false)
        return
      }

      const { data: row } = await supabase
        .from('user_follows')
        .select('follower_id')
        .eq('follower_id', uid)
        .eq('following_id', targetUserId)
        .maybeSingle()

      if (!mounted) return
      setIsFollowing(!!row)
      setLoading(false)
    }

    init()

    return () => {
      mounted = false
    }
  }, [targetUserId])

  async function toggle() {
    if (!myId || myId === targetUserId) return
    setLoading(true)

    if (isFollowing) {
      await supabase
        .from('user_follows')
        .delete()
        .eq('follower_id', myId)
        .eq('following_id', targetUserId)
      setIsFollowing(false)
      setLoading(false)
      return
    }

    await supabase.from('user_follows').insert({
      follower_id: myId,
      following_id: targetUserId,
    })

    setIsFollowing(true)
    setLoading(false)
  }

  // לא מציגים כפתור בפרופיל שלי / לא מחובר
  if (!myId || myId === targetUserId) return null

  const base =
    'h-9 rounded-full px-4 text-sm font-semibold transition inline-flex items-center justify-center'

  return (
    <button
      type="button"
      disabled={loading}
      onClick={toggle}
      className={[
        base,
        isFollowing
          ? 'border bg-white hover:bg-neutral-50'
          : 'bg-black text-white hover:bg-black/90',
        loading ? 'opacity-60 cursor-not-allowed' : '',
      ].join(' ')}
    >
      {isFollowing ? 'הסר מעקב' : 'עקוב'}
    </button>
  )
}

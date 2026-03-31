'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'

// Shared checkmark icon
function CheckIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 14 14" fill="none" aria-hidden="true">
      <path d="M2.5 7l3 3 6-6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

export default function FollowButton({
  targetUserId,
  variant = 'default',
  initialViewerId,
  initialIsFollowing = false,
  skipInitialLoad = false,
}: {
  targetUserId: string
  targetUsername?: string
  variant?: 'default' | 'text'
  initialViewerId?: string | null
  initialIsFollowing?: boolean
  skipInitialLoad?: boolean
}) {
  const [myId, setMyId] = useState<string | null>(initialViewerId ?? null)
  const [isFollowing, setIsFollowing] = useState(initialIsFollowing)
  const [loading, setLoading] = useState(skipInitialLoad ? false : true)
  const [confirmOpen, setConfirmOpen] = useState(false)

  useEffect(() => {
    if (skipInitialLoad) return

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

    return () => { mounted = false }
  }, [skipInitialLoad, targetUserId])

  // Sync instantly when HoverProfileCard (or any other component) follows/unfollows
  useEffect(() => {
    function onFollowChange(e: Event) {
      const { followingId, isFollowing: newState } = (e as CustomEvent<{
        followingId: string
        isFollowing: boolean
      }>).detail
      if (followingId === targetUserId) {
        setIsFollowing(newState)
      }
    }
    window.addEventListener('tyuta:follow-change', onFollowChange)
    return () => window.removeEventListener('tyuta:follow-change', onFollowChange)
  }, [targetUserId])

  function broadcast(nowFollowing: boolean) {
    window.dispatchEvent(new CustomEvent('tyuta:follow-change', {
      detail: { followingId: targetUserId, isFollowing: nowFollowing },
    }))
  }

  async function doUnfollow() {
    if (!myId) return
    setLoading(true)
    await supabase
      .from('user_follows')
      .delete()
      .eq('follower_id', myId)
      .eq('following_id', targetUserId)
    setIsFollowing(false)
    setLoading(false)
    setConfirmOpen(false)
    broadcast(false)
  }

  async function doFollow() {
    if (!myId) return
    setLoading(true)
    await supabase.from('user_follows').insert({
      follower_id: myId,
      following_id: targetUserId,
    })
    setIsFollowing(true)
    setLoading(false)
    broadcast(true)
  }

  function handleClick() {
    if (!myId || myId === targetUserId) return
    if (isFollowing) {
      setConfirmOpen(true)
      return
    }
    doFollow()
  }

  // לא מציגים כפתור בפרופיל שלי / לא מחובר
  if (!myId || myId === targetUserId) return null

  const confirmDialog = confirmOpen ? (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      onClick={() => setConfirmOpen(false)}
    >
      <div
        className="mx-4 w-full max-w-sm rounded-2xl border border-border bg-white dark:bg-card p-5 shadow-xl"
        onClick={e => e.stopPropagation()}
        dir="rtl"
      >
        <p className="text-base font-bold text-neutral-900 dark:text-foreground">להסיר מעקב?</p>
        <p className="mt-1.5 text-sm text-muted-foreground">
          את/ה בטוח/ה שתרצה/י להפסיק לעקוב אחרי הכותב?
        </p>
        <div className="mt-4 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={() => setConfirmOpen(false)}
            className="rounded-xl border border-border px-4 py-2 text-sm font-medium transition hover:bg-muted/50 cursor-pointer"
          >
            ביטול
          </button>
          <button
            type="button"
            disabled={loading}
            onClick={doUnfollow}
            className="rounded-xl border border-rose-300/60 dark:border-rose-500/30 bg-rose-50/60 dark:bg-rose-500/10 px-4 py-2 text-sm font-medium text-rose-600 dark:text-rose-400 transition hover:bg-rose-100/60 dark:hover:bg-rose-500/15 disabled:opacity-60 cursor-pointer"
          >
            הסר מעקב
          </button>
        </div>
      </div>
    </div>
  ) : null

  // ── text variant (compact pill, used in post header) ──────────────────────
  if (variant === 'text') {
    return (
      <>
        {confirmDialog}
        <button
          type="button"
          disabled={loading}
          onClick={handleClick}
          className={[
            'group/fw inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium transition-all duration-150 cursor-pointer select-none',
            isFollowing
              ? 'border border-border/50 bg-neutral-100/60 dark:bg-muted/40 text-foreground/70 hover:border-rose-400/50 dark:hover:border-rose-500/40 hover:bg-rose-50/60 dark:hover:bg-rose-500/10 hover:text-rose-600 dark:hover:text-rose-400'
              : 'bg-sky-500 dark:bg-sky-600 text-white border border-sky-500 dark:border-sky-600 hover:bg-sky-600 hover:border-sky-600 dark:hover:bg-sky-700 dark:hover:border-sky-700',
            loading ? 'opacity-60 cursor-not-allowed' : '',
          ].join(' ')}
        >
          {isFollowing ? (
            <>
              <CheckIcon className="w-3 h-3 shrink-0 group-hover/fw:hidden" />
              <span className="group-hover/fw:hidden">עוקב</span>
              <span className="hidden group-hover/fw:inline">הסר מעקב</span>
            </>
          ) : 'עקוב'}
        </button>
      </>
    )
  }

  // ── default variant (full-size button, used on profile page) ─────────────
  const base = 'h-10 min-w-[110px] rounded-full px-4 text-sm font-semibold transition-all duration-150 inline-flex items-center justify-center gap-1.5 cursor-pointer hover:scale-[1.02] active:scale-[0.98]'

  return (
    <>
      {confirmDialog}
      <button
        type="button"
        disabled={loading}
        onClick={handleClick}
        className={[
          'group/fw',
          base,
          isFollowing
            ? 'border border-border/60 bg-neutral-100/60 dark:bg-muted/40 dark:border-border/50 text-foreground/70 hover:border-rose-400/50 dark:hover:border-rose-500/40 hover:bg-rose-50/60 dark:hover:bg-rose-500/10 hover:text-rose-600 dark:hover:text-rose-400'
            : 'bg-sky-500 dark:bg-sky-600 text-white border border-sky-500 dark:border-sky-600 hover:bg-sky-600 hover:border-sky-600 dark:hover:bg-sky-700 dark:hover:border-sky-700 shadow-sm shadow-sky-500/20',
          loading ? 'opacity-60 cursor-not-allowed' : '',
        ].join(' ')}
      >
        {isFollowing ? (
          <>
            <CheckIcon className="w-3.5 h-3.5 shrink-0 group-hover/fw:hidden" />
            <span className="group-hover/fw:hidden">עוקב</span>
            <span className="hidden group-hover/fw:inline">הסר מעקב</span>
          </>
        ) : 'עקוב'}
      </button>
    </>
  )
}

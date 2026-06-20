'use client'

import { useEffect, useRef, useState } from 'react'
import { Bookmark, BookmarkCheck } from 'lucide-react'
import { waitForClientSession } from '@/lib/auth/clientSession'
import { mapSupabaseError } from '@/lib/mapSupabaseError'
import { supabase } from '@/lib/supabaseClient'

export default function SavePostButton({ postId }: { postId: string }) {
  const [myId, setMyId] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const [loading, setLoading] = useState(true)
  const [msg, setMsg] = useState<string | null>(null)
  const [animating, setAnimating] = useState(false)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const flash = (message: string) => {
    setMsg(message)
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => setMsg(null), 2500)
  }

  useEffect(() => {
    let mounted = true

    const syncBookmarkState = async (uid: string | null) => {
      if (!mounted) return

      setMyId(uid)
      if (!uid) {
        setSaved(false)
        setLoading(false)
        return
      }

      setLoading(true)
      const { data: row, error } = await supabase
        .from('post_bookmarks')
        .select('post_id')
        .eq('user_id', uid)
        .eq('post_id', postId)
        .maybeSingle()

      if (!mounted) return
      if (error) {
        setSaved(false)
        setLoading(false)
        return
      }

      setSaved(!!row)
      setLoading(false)
    }

    const loadInitialState = async () => {
      const resolution = await waitForClientSession(5000)
      await syncBookmarkState(resolution.status === 'authenticated' ? resolution.user.id : null)
    }

    void loadInitialState()

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_OUT') {
        void syncBookmarkState(null)
        return
      }

      if ((event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') && session?.user?.id) {
        void syncBookmarkState(session.user.id)
      }
    })

    return () => {
      mounted = false
      subscription.unsubscribe()
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [postId])

  async function toggle() {
    if (!myId) {
      flash('צריך להתחבר כדי לשמור')
      return
    }

    if (!saved) {
      setAnimating(true)
      setTimeout(() => setAnimating(false), 650)
    }

    setLoading(true)

    if (saved) {
      const { error } = await supabase
        .from('post_bookmarks')
        .delete()
        .eq('user_id', myId)
        .eq('post_id', postId)

      if (error) {
        flash(mapSupabaseError(error) ?? 'לא הצלחנו להסיר שמירה')
        setLoading(false)
        return
      }

      setSaved(false)
      flash('הוסר משמורים')
      setLoading(false)
      return
    }

    const { error } = await supabase.from('post_bookmarks').insert({
      user_id: myId,
      post_id: postId,
    })

    if (error) {
      flash(mapSupabaseError(error) ?? 'לא הצלחנו לשמור')
      setLoading(false)
      return
    }

    setSaved(true)
    flash('נשמר')
    setLoading(false)
  }

  const base =
    'h-9 rounded-[12px] px-2.5 text-[12px] font-semibold transition inline-flex items-center justify-center gap-1.5 whitespace-nowrap sm:px-3 sm:text-[13px]'

  return (
    <div className="relative">
      {animating ? (
        <span
          className="tyuta-save-dot pointer-events-none absolute inset-x-0 top-0 flex justify-center text-amber-500 text-sm leading-none select-none"
          aria-hidden="true"
        >
          ☆
        </span>
      ) : null}
      <button
        type="button"
        disabled={loading}
        onClick={toggle}
        className={[
          base,
          saved
            ? 'border border-[#31576a]/25 bg-[#17384a] text-white hover:bg-[#1f485e] dark:border-sky-200/10 dark:bg-[#1a3c4f] dark:hover:bg-[#224c63]'
            : 'border border-neutral-200/80 bg-white/85 text-neutral-800 hover:bg-white dark:border-white/10 dark:bg-transparent dark:text-neutral-100 dark:hover:bg-white/[0.06]',
          loading ? 'opacity-60 cursor-not-allowed' : '',
        ].join(' ')}
      >
        {saved ? (
          <>
            <BookmarkCheck className="h-3.5 w-3.5 shrink-0" strokeWidth={2.4} aria-hidden="true" />
            <span className="sm:hidden">נשמר</span>
            <span className="hidden sm:inline">שמורים</span>
          </>
        ) : (
          <>
            <Bookmark className="h-3.5 w-3.5 shrink-0" strokeWidth={2.4} aria-hidden="true" />
            <span className="sm:hidden">שמור</span>
            <span className="hidden sm:inline">שמור פוסט</span>
          </>
        )}
      </button>

      {msg ? (
        <div className="pointer-events-none absolute -bottom-8 right-0 rounded-full bg-neutral-900 px-3 py-1 text-[12px] text-white shadow">
          {msg}
        </div>
      ) : null}
    </div>
  )
}

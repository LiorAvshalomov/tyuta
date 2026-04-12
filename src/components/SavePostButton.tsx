'use client'

import { useEffect, useRef, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'
import { waitForClientSession } from '@/lib/auth/clientSession'

export default function SavePostButton({ postId }: { postId: string }) {
  const [myId, setMyId] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const [loading, setLoading] = useState(true)
  const [msg, setMsg] = useState<string | null>(null)
  const [animating, setAnimating] = useState(false)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const flash = (m: string) => {
    setMsg(m)
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
        // אם הטבלה עוד לא קיימת בסביבה – לא נשבור את העמוד
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
        flash('לא הצלחנו להסיר שמירה')
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
      flash('לא הצלחנו לשמור')
      setLoading(false)
      return
    }

    setSaved(true)
    flash('נשמר')
    setLoading(false)
  }

  const base =
    'h-9 rounded-full px-4 text-sm font-semibold transition inline-flex items-center justify-center gap-2'

  return (
    <div className="relative">
      {animating ? (
        <span
          className="tyuta-save-dot pointer-events-none absolute inset-x-0 top-0 flex justify-center text-amber-500 text-sm leading-none select-none"
          aria-hidden="true"
        >
          ★
        </span>
      ) : null}
      <button
        type="button"
        disabled={loading}
        onClick={toggle}
        className={[
          base,
          saved ? 'border bg-white hover:bg-neutral-50 dark:bg-card dark:hover:bg-muted dark:border-border' : 'bg-white border hover:bg-neutral-50 dark:bg-card dark:hover:bg-muted dark:border-border',
          loading ? 'opacity-60 cursor-not-allowed' : '',
        ].join(' ')}
      >
        {saved ? 'שמורים ✓' : 'שמור פוסט'}
      </button>

      {msg ? (
        <div className="pointer-events-none absolute -bottom-8 right-0 rounded-full bg-neutral-900 px-3 py-1 text-[12px] text-white shadow">
          {msg}
        </div>
      ) : null}
    </div>
  )
}

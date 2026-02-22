'use client'

import { useEffect, useRef, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'

export default function SavePostButton({ postId }: { postId: string }) {
  const [myId, setMyId] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const [loading, setLoading] = useState(true)
  const [msg, setMsg] = useState<string | null>(null)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const flash = (m: string) => {
    setMsg(m)
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => setMsg(null), 2500)
  }

  useEffect(() => {
    let mounted = true

    async function init() {
      const { data } = await supabase.auth.getUser()
      const uid = data?.user?.id ?? null
      if (!mounted) return
      setMyId(uid)

      if (!uid) {
        setLoading(false)
        return
      }

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

    init()

    return () => {
      mounted = false
    }
  }, [postId])

  async function toggle() {
    if (!myId) {
      flash('צריך להתחבר כדי לשמור')
      return
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

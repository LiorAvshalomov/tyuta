'use client'

import Link from 'next/link'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'

export default function MessagesIconButton() {
  const [totalUnread, setTotalUnread] = useState(0)

  const load = useCallback(async () => {
    const { data: me } = await supabase.auth.getUser()
    if (!me.user?.id) {
      setTotalUnread(0)
      return
    }

    const { data, error } = await supabase.from('inbox_threads').select('unread_count')
    if (error) {
      console.error('MessagesIconButton load error:', error)
      setTotalUnread(0)
      return
    }

    const sum = (data ?? []).reduce((acc, row: any) => acc + (Number(row?.unread_count) || 0), 0)
    setTotalUnread(sum)
  }, [])

  useEffect(() => {
    void load()

    const ch = supabase
      .channel('messages-badge-refresh')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, () => void load())
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'messages' }, () => void load())
      .subscribe()

    return () => {
      supabase.removeChannel(ch)
    }
  }, [load])

  const badgeText = useMemo(() => {
    if (totalUnread <= 0) return null
    if (totalUnread > 99) return '99+'
    return String(totalUnread)
  }, [totalUnread])

  return (
    <Link
      href="/inbox"
      className="relative inline-flex h-9 w-9 items-center justify-center rounded-full border bg-white hover:bg-neutral-50"
      aria-label="הודעות"
      title="הודעות"
    >
      {/* bubble icon */}
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path
          d="M21 12c0 4.418-4.03 8-9 8a10.2 10.2 0 0 1-3.7-.68L3 20l1.04-3.12A7.47 7.47 0 0 1 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8Z"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinejoin="round"
        />
      </svg>

      {badgeText && (
        <span className="absolute -left-1 -top-1 inline-flex min-w-5 items-center justify-center rounded-full bg-black px-1.5 py-0.5 text-[10px] font-black text-white">
          {badgeText}
        </span>
      )}
    </Link>
  )
}

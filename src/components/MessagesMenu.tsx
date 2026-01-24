'use client'

import Link from 'next/link'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'
import Avatar from '@/components/Avatar'

type ThreadRow = {
  conversation_id: string
  other_username: string
  other_display_name: string | null
  other_avatar_url: string | null
  last_body: string | null
  last_created_at: string | null
  unread_count: number
}

function useClickOutside<T extends HTMLElement>(
  ref: React.RefObject<T | null>,
  onOutside: () => void,
  enabled: boolean
) {
  useEffect(() => {
    if (!enabled) return
    function onDown(e: MouseEvent) {
      const el = ref.current
      if (!el) return
      if (e.target instanceof Node && !el.contains(e.target)) onOutside()
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [enabled, onOutside, ref])
}

function isSameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
}

function formatLast(iso: string | null) {
  if (!iso) return ''
  const d = new Date(iso)
  const now = new Date()
  if (isSameDay(d, now)) return d.toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' })
  return d.toLocaleDateString('he-IL', { day: '2-digit', month: '2-digit' })
}

export default function MessagesMenu() {
  const [open, setOpen] = useState(false)
  const [rows, setRows] = useState<ThreadRow[]>([])
  const [totalUnread, setTotalUnread] = useState(0)

  const wrapRef = useRef<HTMLDivElement | null>(null)
  useClickOutside(wrapRef, () => setOpen(false), open)

  const load = useCallback(async () => {
    const { data: me } = await supabase.auth.getUser()
    if (!me.user?.id) {
      setRows([])
      setTotalUnread(0)
      return
    }

    const { data, error } = await supabase
      .from('inbox_threads')
      .select(
        'conversation_id, other_username, other_display_name, other_avatar_url, last_body, last_created_at, unread_count'
      )
      .order('last_created_at', { ascending: false, nullsFirst: false })
      .limit(8)

    if (error) {
      console.error('MessagesMenu load error:', error)
      setRows([])
      setTotalUnread(0)
      return
    }

    const list = (data ?? []) as ThreadRow[]
    setRows(list)

    const sum = list.reduce((acc, r) => acc + (Number(r.unread_count) || 0), 0)
    setTotalUnread(sum)
  }, [])

  useEffect(() => {
    void load()

    const ch = supabase
      .channel('messages-menu-refresh')
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
    <div className="relative" ref={wrapRef}>
      <button
        onClick={() => {
          setOpen(v => !v)
          if (!open) void load()
        }}
        className="relative inline-flex h-9 w-9 items-center justify-center rounded-full border bg-white hover:bg-neutral-50"
        aria-label="הודעות"
        title="הודעות"
      >
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
      </button>

      {open && (
        <div className="absolute left-0 z-50 mt-2 w-80 overflow-hidden rounded-3xl border bg-white shadow-lg">
          <div className="flex items-center justify-between border-b px-4 py-3" style={{ backgroundColor: '#F7F6F3' }}>
            <div className="text-sm font-black">הודעות</div>
            <Link href="/inbox" className="text-xs font-bold hover:underline" onClick={() => setOpen(false)}>
              לכל ההודעות
            </Link>
          </div>

          <div className="max-h-[420px] overflow-y-auto p-2" style={{ backgroundColor: '#FBFAF8' }}>
            {rows.length === 0 ? (
              <div className="rounded-2xl border bg-white p-4 text-sm text-muted-foreground">אין עדיין שיחות.</div>
            ) : (
              <div className="space-y-2">
                {rows.map(r => {
                  const displayName =
                    (r.other_display_name ?? '').trim() || (r.other_username ?? '').trim() || 'שיחה'
                  const unread = Number(r.unread_count) || 0

                  return (
                    <Link
                      key={r.conversation_id}
                      href={`/inbox/${r.conversation_id}`}
                      onClick={() => setOpen(false)}
                      className="block rounded-2xl border bg-white p-3 hover:bg-neutral-50"
                    >
                      <div className="flex items-center gap-3">
                        <Avatar src={r.other_avatar_url} name={displayName} size={40} shape="square" />

                        <div className="min-w-0 flex-1">
                          <div className="flex items-center justify-between gap-2">
                            <div className="truncate text-sm font-black">{displayName}</div>
                            <div className="shrink-0 text-[11px] text-muted-foreground">{formatLast(r.last_created_at)}</div>
                          </div>
                          <div className="mt-1 truncate text-xs text-muted-foreground">
                            {r.last_body ?? 'אין עדיין הודעות'}
                          </div>
                        </div>

                        {unread > 0 && (
                          <span className="inline-flex min-w-6 items-center justify-center rounded-full bg-black px-2 py-0.5 text-[11px] font-bold text-white">
                            {unread > 99 ? '99+' : unread}
                          </span>
                        )}
                      </div>
                    </Link>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

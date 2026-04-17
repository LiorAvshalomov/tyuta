'use client'

import Link from 'next/link'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { usePathname } from 'next/navigation'
import { supabase } from '@/lib/supabaseClient'
import { waitForClientSession } from '@/lib/auth/clientSession'
import Avatar from '@/components/Avatar'
import { resolveUserIdentity, SYSTEM_USER_ID } from '@/lib/systemIdentity'
import { getModerationStatus } from '@/lib/moderation'

type ConvRow = {
  conversation_id: string
  other_user_id: string
  other_username: string
  other_display_name: string | null
  other_avatar_url: string | null
  last_body: string | null
  last_created_at: string | null
  unread_count: number
}

type TypingEntry = { isTyping: boolean; updatedAt: number }

function daysDiff(from: Date, to: Date) {
  const a = new Date(from.getFullYear(), from.getMonth(), from.getDate()).getTime()
  const b = new Date(to.getFullYear(), to.getMonth(), to.getDate()).getTime()
  return Math.round((b - a) / (1000 * 60 * 60 * 24))
}

function formatLastTime(iso: string | null) {
  if (!iso) return ''
  const d = new Date(iso)
  const now = new Date()

  const diff = daysDiff(d, now)
  if (diff === 0) return d.toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' })
  if (diff === 1) return 'אתמול'
  if (diff >= 2 && diff <= 6) return d.toLocaleDateString('he-IL', { weekday: 'long' })
  return d.toLocaleDateString('he-IL', { day: '2-digit', month: '2-digit', year: '2-digit' })
}

const THREADS_PAGE_SIZE = 25

const THREADS_SELECT = 'conversation_id, other_user_id, other_username, other_display_name, other_avatar_url, last_body, last_created_at, unread_count'

export default function InboxThreads() {
  const pathname = usePathname()
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [hasMore, setHasMore] = useState(false)
  const [rows, setRows] = useState<ConvRow[]>([])
  const modStatus = getModerationStatus()
  const isBanned = modStatus === 'banned'
  const visibleRows = useMemo(() => (isBanned ? rows.filter((r) => r.other_user_id === SYSTEM_USER_ID) : rows), [isBanned, rows])

  // Typing indicators: conversationId → { isTyping, updatedAt }
  const [typingMap, setTypingMap] = useState<Record<string, TypingEntry>>({})
  const meIdRef = useRef<string | null>(null)
  // One Supabase channel per conversation for typing broadcasts
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const typingChannelsRef = useRef<Map<string, any>>(new Map())
  // Per-conversation timeout handles for clearing typing (mirrors ChatClient's 2500ms)
  const typingTimersRef = useRef<Map<string, number>>(new Map())

  // Debounce refresh bursts (INSERT + UPDATE can arrive together)
  const refreshTimerRef = useRef<number | null>(null)

  const cursorRef = useRef<string | null>(null)
  const loadingMoreRef = useRef(false)
  const genRef = useRef(0)
  const sentinelRef = useRef<HTMLDivElement>(null)

  const selectedConversationId = useMemo(() => {
    const m = pathname.match(/^\/inbox\/([^/]+)$/)
    return m?.[1] ?? null
  }, [pathname])

  const load = useCallback(async () => {
    setLoading(true)
    cursorRef.current = null
    const gen = ++genRef.current

    const resolution = await waitForClientSession(5000)
    if (resolution.status === 'timeout') {
      setLoading(false)
      return
    }

    const meUser = resolution.status === 'authenticated' ? resolution.user : null
    if (!meUser?.id) {
      meIdRef.current = null
      setRows([])
      setHasMore(false)
      setLoading(false)
      return
    }
    meIdRef.current = meUser.id

    const { data, error } = await supabase
      .from('inbox_threads')
      .select(THREADS_SELECT)
      .not('last_created_at', 'is', null)
      .order('last_created_at', { ascending: false, nullsFirst: false })
      .limit(THREADS_PAGE_SIZE + 1)

    if (gen !== genRef.current) return

    if (error) {
      console.error('InboxThreads load error:', error)
      setRows([])
      setHasMore(false)
      setLoading(false)
      return
    }

    const page = ((data ?? []) as ConvRow[]).slice(0, THREADS_PAGE_SIZE)
    const more = (data?.length ?? 0) > THREADS_PAGE_SIZE
    cursorRef.current = page[page.length - 1]?.last_created_at ?? null
    setRows(page)
    setHasMore(more)
    setLoading(false)
  }, [])

  const loadMore = useCallback(async () => {
    if (loadingMoreRef.current || !cursorRef.current) return
    loadingMoreRef.current = true
    setLoadingMore(true)
    const gen = genRef.current
    try {
      const resolution = await waitForClientSession(5000)
      if (gen !== genRef.current) return
      const meUser = resolution.status === 'authenticated' ? resolution.user : null
      if (!meUser?.id) return

      const { data, error } = await supabase
        .from('inbox_threads')
        .select(THREADS_SELECT)
        .not('last_created_at', 'is', null)
        .order('last_created_at', { ascending: false, nullsFirst: false })
        .lt('last_created_at', cursorRef.current)
        .limit(THREADS_PAGE_SIZE + 1)

      if (gen !== genRef.current || error) return

      const page = ((data ?? []) as ConvRow[]).slice(0, THREADS_PAGE_SIZE)
      const more = (data?.length ?? 0) > THREADS_PAGE_SIZE
      cursorRef.current = page[page.length - 1]?.last_created_at ?? null
      setRows((prev) => [...prev, ...page])
      setHasMore(more)
    } finally {
      loadingMoreRef.current = false
      setLoadingMore(false)
    }
  }, [])

  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_OUT') {
        meIdRef.current = null
        setRows([])
        setLoading(false)
        return
      }

      window.setTimeout(() => {
        void load()
      }, 0)
    })

    return () => {
      sub.subscription.unsubscribe()
    }
  }, [load])

  // Subscribe / unsubscribe typing channels as conversation list changes
  useEffect(() => {
    const convIds = new Set(rows.map(r => r.conversation_id))
    const existing = typingChannelsRef.current

    // Remove channels for conversations no longer in list
    for (const [id, ch] of existing) {
      if (!convIds.has(id)) {
        supabase.removeChannel(ch)
        existing.delete(id)
      }
    }

    // Add channels for new conversations
    for (const id of convIds) {
      if (existing.has(id)) continue
      const ch = supabase
        .channel(`typing-${id}`)
        .on('broadcast', { event: 'typing' }, payload => {
          const p = payload?.payload as { user_id?: string } | undefined
          const uid = p?.user_id
          if (!uid || uid === meIdRef.current) return
          setTypingMap(prev => ({ ...prev, [id]: { isTyping: true, updatedAt: Date.now() } }))
          // Reset per-conversation timeout — same 2500ms as ChatClient
          const timers = typingTimersRef.current
          if (timers.has(id)) window.clearTimeout(timers.get(id))
          timers.set(id, window.setTimeout(() => {
            setTypingMap(prev => prev[id]?.isTyping ? { ...prev, [id]: { ...prev[id], isTyping: false } } : prev)
            timers.delete(id)
          }, 2500))
        })
        .subscribe()
      existing.set(id, ch)
    }
  }, [rows])

  // Cleanup all typing channels and timers on unmount
  useEffect(() => {
    const channels = typingChannelsRef.current
    const timers = typingTimersRef.current
    return () => {
      for (const ch of channels.values()) supabase.removeChannel(ch)
      channels.clear()
      for (const t of timers.values()) window.clearTimeout(t)
      timers.clear()
    }
  }, [])

  useEffect(() => {
    if (!hasMore) return
    const el = sentinelRef.current
    if (!el) return
    const observer = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) void loadMore() },
      { rootMargin: '120px' }
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [hasMore, loadMore])

  useEffect(() => {
    void load()

    const scheduleRefresh = () => {
      if (refreshTimerRef.current) window.clearTimeout(refreshTimerRef.current)
      refreshTimerRef.current = window.setTimeout(() => void load(), 250)
    }

    const ch = supabase
      .channel('inbox-threads-refresh')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, scheduleRefresh)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'messages' }, scheduleRefresh)
      .subscribe()

    // Re-query when ChatClient marks a conversation as read, or SiteHeader realtime fires
    const onThreadRead = () => void load()
    window.addEventListener('tyuta:thread-read', onThreadRead)
    window.addEventListener('tyuta:inbox-refresh', onThreadRead)

    // BroadcastChannel: instant updates from ChatClient (messages + typing) — mounted once, no activeConversationId dependency
    const bc = new BroadcastChannel('tyuta-inbox')
    bc.onmessage = (e: MessageEvent) => {
      const d = e.data as {
        type: string
        conversationId: string
        // message fields
        last_body?: string
        last_created_at?: string
        isOwn?: boolean
        // typing fields
        userId?: string
      }

      if (d.type === 'typing') {
        // Ignore own typing events
        if (d.userId && d.userId === meIdRef.current) return
        const id = d.conversationId
        setTypingMap(prev => ({ ...prev, [id]: { isTyping: true, updatedAt: Date.now() } }))
        const timers = typingTimersRef.current
        if (timers.has(id)) window.clearTimeout(timers.get(id))
        timers.set(id, window.setTimeout(() => {
          setTypingMap(prev => prev[id]?.isTyping ? { ...prev, [id]: { ...prev[id], isTyping: false } } : prev)
          timers.delete(id)
        }, 2500))
        return
      }

      if (d.type !== 'message') return
      setRows(prev => {
        const idx = prev.findIndex(r => r.conversation_id === d.conversationId)
        if (idx === -1) {
          // Unknown conversation (e.g. new chat) — schedule full refresh
          if (refreshTimerRef.current) window.clearTimeout(refreshTimerRef.current)
          refreshTimerRef.current = window.setTimeout(() => void load(), 250)
          return prev
        }
        const old = prev[idx]
        const updated = [...prev]
        updated.splice(idx, 1)
        return [{
          ...old,
          last_body: d.last_body ?? old.last_body,
          last_created_at: d.last_created_at ?? old.last_created_at,
          unread_count: d.isOwn ? old.unread_count : old.unread_count + 1,
        }, ...updated]
      })
    }

    return () => {
      if (refreshTimerRef.current) window.clearTimeout(refreshTimerRef.current)
      supabase.removeChannel(ch)
      window.removeEventListener('tyuta:thread-read', onThreadRead)
      window.removeEventListener('tyuta:inbox-refresh', onThreadRead)
      bc.close()
    }
  }, [load])

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="border-b border-black/5 bg-[#F7F6F3] px-4 py-3 dark:border-white/10 dark:bg-[#1a1a1a]">
        <div className="text-lg font-black">הודעות</div>
        <div className="text-xs text-muted-foreground">השיחות שלך</div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto bg-[#FBFAF8] p-3 dark:bg-[#141414]">
        {loading ? (
          <div className="rounded-2xl border bg-white p-4 text-sm text-muted-foreground dark:bg-card dark:border-border">טוען…</div>
        ) : rows.length === 0 ? (
          <div className="rounded-2xl border bg-white p-4 text-sm text-muted-foreground dark:bg-card dark:border-border">אין עדיין שיחות.</div>
        ) : (
          <div className="space-y-2">
            {visibleRows.map((r) => {
              const identity = resolveUserIdentity({
                userId: r.other_user_id,
                displayName: r.other_display_name,
                username: r.other_username,
                avatarUrl: r.other_avatar_url,
              })
              const displayName = identity.displayName
              const isActive = selectedConversationId === r.conversation_id
              const timeText = formatLastTime(r.last_created_at)
              const unread = Number.isFinite(r.unread_count) ? r.unread_count : 0
              const hasUnread = unread > 0
              const rawBody = (r.last_body ?? '').trim()
              const lastBody = rawBody ? (rawBody.length > 200 ? rawBody.slice(0, 200) + '…' : rawBody) : 'אין עדיין הודעות'
              const isTypingNow = typingMap[r.conversation_id]?.isTyping === true

              const rowClassName = [
                'group block rounded-2xl border p-3 transition-all duration-150 outline-none focus-visible:ring-2 focus-visible:ring-neutral-300 dark:focus-visible:ring-[#3B6CE3]/50',
                isActive
                  ? 'bg-white border-neutral-300 ring-1 ring-neutral-300 dark:bg-[#1e2d4d] dark:border-[#3B6CE3]/50 dark:ring-[#3B6CE3]/50'
                  : hasUnread
                    ? 'bg-white border-neutral-200 hover:bg-neutral-50 hover:shadow-sm hover:-translate-y-[1px] active:translate-y-0 active:shadow-none dark:bg-card dark:border-border dark:hover:bg-muted'
                    : 'bg-white hover:bg-neutral-50 hover:shadow-sm hover:-translate-y-[1px] active:translate-y-0 active:shadow-none dark:bg-card dark:border-border dark:hover:bg-muted',
              ].join(' ')

              return (
                <Link key={r.conversation_id} href={`/inbox/${r.conversation_id}`} className={rowClassName}>
                  <div className="flex items-center gap-3">
                    <Avatar src={identity.avatarUrl} name={displayName} size={44} shape="square" />

                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <div
                          className={[
                            'truncate text-sm font-black',
                            hasUnread ? 'text-neutral-950 dark:text-foreground' : 'text-neutral-900 dark:text-foreground',
                          ].join(' ')}
                        >
                          {displayName}
                        </div>

                        <div className="flex items-center gap-2">
                          <div
                            className={[
                              'shrink-0 text-[11px]',
                              hasUnread ? 'text-neutral-900 font-semibold dark:text-foreground' : 'text-muted-foreground',
                            ].join(' ')}
                          >
                            {timeText}
                          </div>

                          {hasUnread ? (
                            <span className="inline-flex min-w-6 items-center justify-center rounded-full bg-black px-2 py-0.5 text-[11px] font-bold text-white">
                              {unread > 99 ? '99+' : unread}
                            </span>
                          ) : null}
                        </div>
                      </div>

                      {isTypingNow ? (
                        <div
                          dir="rtl"
                          className="mt-1 min-w-0 truncate text-xs italic text-[#3B6CE3] dark:text-[#7a9ff5]"
                          style={{ unicodeBidi: 'isolate' }}
                        >
                          מקליד/ה…
                        </div>
                      ) : (
                        <div
                          className={[
                            'mt-1 min-w-0 truncate text-xs',
                            hasUnread
                              ? 'text-neutral-900 font-semibold dark:text-foreground'
                              : 'text-muted-foreground',
                          ].join(' ')}
                        >
                          {lastBody}
                        </div>
                      )}
                    </div>
                  </div>
                </Link>
              )
            })}
            {hasMore ? <div ref={sentinelRef} className="h-1" /> : null}
            {loadingMore ? (
              <div className="py-2 text-center text-xs text-muted-foreground">טוען עוד…</div>
            ) : null}
          </div>
        )}
      </div>
    </div>
  )
}

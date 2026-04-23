'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import type { RealtimeChannel } from '@supabase/supabase-js'
import Avatar from '@/components/Avatar'
import ChatClient from '@/components/ChatClient'
import ErrorBanner from '@/components/admin/ErrorBanner'
import EmptyState from '@/components/admin/EmptyState'
import { TableSkeleton } from '@/components/admin/AdminSkeleton'
import { adminFetch } from '@/lib/admin/adminFetch'
import { getAdminErrorMessage } from '@/lib/admin/adminUi'
import { supabase } from '@/lib/supabaseClient'
import { Megaphone, Search, X } from 'lucide-react'

type UserHit = {
  id: string
  username: string
  display_name: string | null
  avatar_url: string | null
}

type Thread = {
  conversation_id: string
  other_user_id: string
  other_username: string
  other_display_name: string | null
  other_avatar_url: string | null
  last_body: string | null
  last_created_at: string | null
  unread_count: number
}

type TypingEntry = {
  isTyping: boolean
}

const REFRESH_INTERVAL_MS = 10_000
const SYSTEM_USER_ID = (process.env.NEXT_PUBLIC_SYSTEM_USER_ID ?? '').trim()

function daysDiff(from: Date, to: Date) {
  const start = new Date(from.getFullYear(), from.getMonth(), from.getDate()).getTime()
  const end = new Date(to.getFullYear(), to.getMonth(), to.getDate()).getTime()
  return Math.round((end - start) / (1000 * 60 * 60 * 24))
}

function formatLastTime(iso: string | null) {
  if (!iso) return ''

  try {
    const date = new Date(iso)
    const now = new Date()
    const diff = daysDiff(date, now)

    if (diff === 0) return date.toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' })
    if (diff === 1) return 'אתמול'
    if (diff >= 2 && diff <= 6) return date.toLocaleDateString('he-IL', { weekday: 'long' })
    return date.toLocaleDateString('he-IL', { day: '2-digit', month: '2-digit', year: '2-digit' })
  } catch {
    return ''
  }
}

export default function AdminInboxPage() {
  const searchParams = useSearchParams()
  const [q, setQ] = useState('')
  const [userHits, setUserHits] = useState<UserHit[]>([])
  const [searching, setSearching] = useState(false)

  const [broadcastOpen, setBroadcastOpen] = useState(false)
  const [broadcastBody, setBroadcastBody] = useState('')
  const [broadcastLoading, setBroadcastLoading] = useState(false)
  const [broadcastResult, setBroadcastResult] = useState<string | null>(null)
  const [broadcastError, setBroadcastError] = useState<string | null>(null)

  const [threads, setThreads] = useState<Thread[]>([])
  const [threadsLoading, setThreadsLoading] = useState(true)
  const [selectedConversationId, setSelectedConversationId] = useState<string | null>(
    () => searchParams.get('c') ?? null
  )
  const [error, setError] = useState<string | null>(null)
  const [typingMap, setTypingMap] = useState<Record<string, TypingEntry>>({})

  const typingChannelsRef = useRef<Map<string, RealtimeChannel>>(new Map())
  const typingTimersRef = useRef<Map<string, number>>(new Map())
  // Ref so loadThreads can check the current selection without it being a dependency
  const selectedConversationIdRef = useRef(selectedConversationId)
  selectedConversationIdRef.current = selectedConversationId

  const loadThreads = useCallback(async (quiet = false) => {
    if (!quiet) setThreadsLoading(true)
    setError(null)

    try {
      const res = await adminFetch('/api/admin/inbox/threads')
      const json = await res.json().catch(() => ({}))
      if (!res.ok) {
        throw new Error(getAdminErrorMessage(json, 'שגיאה בטעינת שיחות'))
      }

      const nextThreads = Array.isArray(json?.threads) ? (json.threads as Thread[]) : []
      setThreads(nextThreads)

      // Use ref so this doesn't need selectedConversationId as a dependency
      const cur = selectedConversationIdRef.current
      if (cur && !nextThreads.some((thread) => thread.conversation_id === cur)) {
        setSelectedConversationId(null)
      }
    } catch (caught: unknown) {
      setError(caught instanceof Error ? caught.message : 'שגיאה')
      if (!quiet) setThreads([])
    } finally {
      if (!quiet) setThreadsLoading(false)
    }
  }, []) // stable — no deps that change

  useEffect(() => {
    void loadThreads()
  }, [loadThreads])

  useEffect(() => {
    const c = searchParams.get('c')
    if (c) setSelectedConversationId(c)
  }, [searchParams])

  useEffect(() => {
    const refreshVisible = () => {
      if (document.visibilityState !== 'visible') return
      void loadThreads(true)
    }

    const intervalId = window.setInterval(refreshVisible, REFRESH_INTERVAL_MS)
    window.addEventListener('focus', refreshVisible)
    document.addEventListener('visibilitychange', refreshVisible)
    window.addEventListener('tyuta:thread-read', refreshVisible)
    window.addEventListener('tyuta:inbox-refresh', refreshVisible)

    return () => {
      window.clearInterval(intervalId)
      window.removeEventListener('focus', refreshVisible)
      document.removeEventListener('visibilitychange', refreshVisible)
      window.removeEventListener('tyuta:thread-read', refreshVisible)
      window.removeEventListener('tyuta:inbox-refresh', refreshVisible)
    }
  }, [loadThreads]) // now stable — interval created once

  useEffect(() => {
    const bc = new BroadcastChannel('tyuta-inbox')
    bc.onmessage = (event: MessageEvent) => {
      const data = event.data as {
        type: string
        conversationId: string
        last_body?: string
        last_created_at?: string
        isOwn?: boolean
        userId?: string
      }

      if (data.type === 'typing') {
        if (!data.userId || data.userId === SYSTEM_USER_ID) return

        setTypingMap((prev) => ({
          ...prev,
          [data.conversationId]: { isTyping: true },
        }))

        const timers = typingTimersRef.current
        if (timers.has(data.conversationId)) window.clearTimeout(timers.get(data.conversationId))
        timers.set(
          data.conversationId,
          window.setTimeout(() => {
            setTypingMap((prev) => (prev[data.conversationId]?.isTyping ? {
              ...prev,
              [data.conversationId]: { isTyping: false },
            } : prev))
            timers.delete(data.conversationId)
          }, 2500),
        )

        return
      }

      if (data.type !== 'message') return

      setThreads((prev) => {
        const index = prev.findIndex((thread) => thread.conversation_id === data.conversationId)
        if (index === -1) {
          void loadThreads(true)
          return prev
        }

        const next = [...prev]
        const current = next[index]
        next.splice(index, 1)

        return [{
          ...current,
          last_body: data.last_body ?? current.last_body,
          last_created_at: data.last_created_at ?? current.last_created_at,
          unread_count: data.isOwn ? current.unread_count : current.unread_count + 1,
        }, ...next]
      })
    }

    return () => {
      bc.close()
    }
  }, [loadThreads])

  useEffect(() => {
    const conversationIds = new Set(threads.map((thread) => thread.conversation_id))
    const existingChannels = typingChannelsRef.current

    for (const [conversationId, channel] of existingChannels) {
      if (!conversationIds.has(conversationId)) {
        void supabase.removeChannel(channel)
        existingChannels.delete(conversationId)
      }
    }

    for (const conversationId of conversationIds) {
      if (existingChannels.has(conversationId)) continue

      const channel = supabase
        .channel(`typing-${conversationId}`)
        .on('broadcast', { event: 'typing' }, (payload) => {
          const broadcast = payload?.payload as { user_id?: string } | undefined
          const userId = broadcast?.user_id
          if (!userId || userId === SYSTEM_USER_ID) return

          setTypingMap((prev) => ({
            ...prev,
            [conversationId]: { isTyping: true },
          }))

          const timers = typingTimersRef.current
          if (timers.has(conversationId)) window.clearTimeout(timers.get(conversationId))
          timers.set(
            conversationId,
            window.setTimeout(() => {
              setTypingMap((prev) => (prev[conversationId]?.isTyping ? {
                ...prev,
                [conversationId]: { isTyping: false },
              } : prev))
              timers.delete(conversationId)
            }, 2500),
          )
        })
        .subscribe()

      existingChannels.set(conversationId, channel)
    }
  }, [threads])

  useEffect(() => {
    const channels = typingChannelsRef.current
    const timers = typingTimersRef.current

    return () => {
      for (const channel of channels.values()) {
        void supabase.removeChannel(channel)
      }
      channels.clear()

      for (const timer of timers.values()) {
        window.clearTimeout(timer)
      }
      timers.clear()
    }
  }, [])

  const searchUsers = useCallback(async () => {
    const term = q.trim()
    if (term.length < 2) {
      setUserHits([])
      return
    }

    setSearching(true)
    setError(null)

    try {
      const res = await adminFetch(`/api/admin/inbox/users?q=${encodeURIComponent(term)}`)
      const json = await res.json().catch(() => ({}))
      if (!res.ok) {
        throw new Error(getAdminErrorMessage(json, 'שגיאה בחיפוש משתמשים'))
      }

      setUserHits(Array.isArray(json?.users) ? (json.users as UserHit[]) : [])
    } catch (caught: unknown) {
      setError(caught instanceof Error ? caught.message : 'שגיאה')
      setUserHits([])
    } finally {
      setSearching(false)
    }
  }, [q])

  const startOrOpen = useCallback(async (userId: string) => {
    if (!SYSTEM_USER_ID) {
      setError('חסר NEXT_PUBLIC_SYSTEM_USER_ID ב־env')
      return
    }

    try {
      const res = await adminFetch('/api/admin/inbox/thread', {
        method: 'POST',
        body: JSON.stringify({ user_id: userId }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) {
        throw new Error(getAdminErrorMessage(json, 'שגיאה בפתיחת שיחה'))
      }

      const conversationId = String(json?.conversation_id ?? '')
      if (!conversationId) {
        throw new Error('שגיאה: חסר conversation_id')
      }

      setSelectedConversationId(conversationId)
      setQ('')
      setUserHits([])
      void loadThreads(true)
    } catch (caught: unknown) {
      setError(caught instanceof Error ? caught.message : 'שגיאה')
    }
  }, [loadThreads])

  const sendBroadcast = useCallback(async () => {
    const text = broadcastBody.trim()
    if (!text) return
    setBroadcastLoading(true)
    setBroadcastResult(null)
    setBroadcastError(null)
    try {
      const res = await adminFetch('/api/admin/inbox/broadcast', {
        method: 'POST',
        body: JSON.stringify({ body: text }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(getAdminErrorMessage(json, 'שגיאה בשליחת תפוצה'))
      const sent = typeof json?.sent === 'number' ? json.sent : '?'
      setBroadcastResult(`נשלח בהצלחה ל־${sent} משתמשים`)
      setBroadcastBody('')
    } catch (caught: unknown) {
      setBroadcastError(caught instanceof Error ? caught.message : 'שגיאה')
    } finally {
      setBroadcastLoading(false)
    }
  }, [broadcastBody])

  const threadPane = (
    <div className="flex h-full min-h-0 flex-col">
      <div className="border-b border-black/5 bg-[#F7F6F3] px-4 py-3 dark:border-white/10 dark:bg-[#1a1a1a]">
        <div className="flex items-center justify-between gap-2">
          <div>
            <div className="text-lg font-black">אינבוקס מערכת</div>
            <div className="text-xs text-muted-foreground">חיפוש משתמשים, פתיחת שיחות והמשך טיפול</div>
          </div>
          <button
            type="button"
            title="שלח הודעת תפוצה לכלל המשתמשים"
            onClick={() => {
              setBroadcastOpen((v) => !v)
              setBroadcastResult(null)
              setBroadcastError(null)
            }}
            className={[
              'shrink-0 rounded-xl p-2 transition',
              broadcastOpen
                ? 'bg-black text-white dark:bg-white dark:text-black'
                : 'text-neutral-500 hover:bg-black/5 dark:text-muted-foreground dark:hover:bg-white/10',
            ].join(' ')}
          >
            <Megaphone size={16} />
          </button>
        </div>

        {broadcastOpen && (
          <div className="mt-3 rounded-2xl border border-black/10 bg-white p-3 dark:border-white/10 dark:bg-card">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-xs font-bold text-neutral-700 dark:text-neutral-300">הודעת תפוצה — כלל המשתמשים</span>
              <button
                type="button"
                onClick={() => { setBroadcastOpen(false); setBroadcastResult(null); setBroadcastError(null) }}
                className="text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-300"
              >
                <X size={14} />
              </button>
            </div>
            <textarea
              value={broadcastBody}
              onChange={(e) => { setBroadcastBody(e.target.value); setBroadcastResult(null); setBroadcastError(null) }}
              placeholder="כתוב הודעה לכלל המשתמשים…"
              rows={4}
              maxLength={4000}
              className="w-full resize-none rounded-xl border border-black/10 bg-neutral-50 px-3 py-2 text-sm outline-none transition focus:border-neutral-400 dark:border-white/10 dark:bg-zinc-800/50 dark:text-foreground dark:placeholder:text-muted-foreground dark:focus:border-white/20"
            />
            <div className="mt-2 flex items-center justify-between gap-2">
              <span className="text-[11px] text-muted-foreground">{broadcastBody.length}/4000</span>
              <button
                type="button"
                onClick={() => void sendBroadcast()}
                disabled={broadcastLoading || !broadcastBody.trim()}
                className="rounded-xl bg-black px-4 py-1.5 text-xs font-bold text-white transition hover:opacity-90 disabled:opacity-40 dark:bg-white dark:text-black"
              >
                {broadcastLoading ? 'שולח…' : 'שלח לכולם'}
              </button>
            </div>
            {broadcastResult && (
              <p className="mt-2 text-xs font-medium text-emerald-600 dark:text-emerald-400">{broadcastResult}</p>
            )}
            {broadcastError && (
              <p className="mt-2 text-xs font-medium text-red-600 dark:text-red-400">{broadcastError}</p>
            )}
          </div>
        )}

        <div className="mt-3 flex gap-2">
          <div className="relative min-w-0 flex-1">
            <Search size={15} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-neutral-400 dark:text-muted-foreground" />
            <input
              value={q}
              onChange={(event) => {
                const nextValue = event.target.value
                setQ(nextValue)
                if (nextValue.trim().length < 2) setUserHits([])
              }}
              onKeyDown={(event) => {
                if (event.key === 'Enter') void searchUsers()
              }}
              placeholder="חפש username או שם תצוגה..."
              className="w-full rounded-2xl border border-black/10 bg-white py-2.5 pr-9 pl-3 text-sm outline-none transition focus:border-neutral-400 dark:border-white/10 dark:bg-card dark:text-foreground dark:placeholder:text-muted-foreground dark:focus:border-white/20"
            />
          </div>

          <button
            type="button"
            onClick={() => void searchUsers()}
            disabled={searching}
            className="shrink-0 rounded-2xl bg-black px-4 py-2.5 text-sm font-bold text-white transition hover:opacity-90 disabled:opacity-50"
          >
            חפש
          </button>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto bg-[#FBFAF8] p-3 dark:bg-[#141414]">
        {userHits.length > 0 ? (
          <div className="mb-3">
            <div className="mb-2 px-1 text-[11px] font-bold text-muted-foreground">תוצאות חיפוש</div>
            <div className="space-y-2">
              {userHits.map((user) => {
                const name = (user.display_name ?? '').trim() || (user.username ?? '').trim()
                return (
                  <button
                    key={user.id}
                    type="button"
                    onClick={() => void startOrOpen(user.id)}
                    className="flex w-full items-center gap-3 rounded-2xl border border-neutral-200 bg-white p-3 text-right transition-all duration-150 hover:bg-neutral-50 hover:shadow-sm dark:border-border dark:bg-card dark:hover:bg-muted"
                  >
                    <Avatar src={user.avatar_url} name={name} size={44} shape="square" />

                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-black text-neutral-900 dark:text-foreground">{name}</div>
                      <div className="mt-1 truncate text-xs text-muted-foreground">@{user.username}</div>
                    </div>

                    <span className="text-xs font-bold text-neutral-500 dark:text-muted-foreground">פתח</span>
                  </button>
                )
              })}
            </div>
          </div>
        ) : null}

        {threadsLoading ? (
          <TableSkeleton rows={4} />
        ) : threads.length === 0 ? (
          <EmptyState
            title="אין עדיין שיחות"
            description="אפשר לחפש משתמש למעלה ולפתוח שיחה חדשה."
            icon={<Search size={30} strokeWidth={1.5} />}
          />
        ) : (
          <div className="space-y-2">
            {threads.map((thread) => {
              const displayName =
                (thread.other_display_name ?? '').trim() ||
                (thread.other_username ?? '').trim() ||
                'שיחה'

              const isActive = selectedConversationId === thread.conversation_id
              const unread = Number.isFinite(thread.unread_count) ? thread.unread_count : 0
              const hasUnread = unread > 0
              const rawBody = (thread.last_body ?? '').trim()
              const lastBody = rawBody
                ? (rawBody.length > 200 ? `${rawBody.slice(0, 200)}…` : rawBody)
                : 'אין עדיין הודעות'
              const isTyping = typingMap[thread.conversation_id]?.isTyping === true

              return (
                <button
                  key={thread.conversation_id}
                  type="button"
                  onClick={() => setSelectedConversationId(thread.conversation_id)}
                  className={[
                    'group block w-full rounded-2xl border p-3 text-right transition-all duration-150 outline-none focus-visible:ring-2 focus-visible:ring-neutral-300 dark:focus-visible:ring-[#3B6CE3]/50',
                    isActive
                      ? 'bg-white border-neutral-300 ring-1 ring-neutral-300 dark:bg-[#1e2d4d] dark:border-[#3B6CE3]/50 dark:ring-[#3B6CE3]/50'
                      : hasUnread
                        ? 'bg-white border-neutral-200 hover:bg-neutral-50 hover:shadow-sm hover:-translate-y-[1px] dark:bg-card dark:border-border dark:hover:bg-muted'
                        : 'bg-white hover:bg-neutral-50 hover:shadow-sm hover:-translate-y-[1px] dark:bg-card dark:border-border dark:hover:bg-muted',
                  ].join(' ')}
                >
                  <div className="flex items-center gap-3">
                    <Avatar src={thread.other_avatar_url} name={displayName} size={44} shape="square" />

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
                              hasUnread ? 'font-semibold text-neutral-900 dark:text-foreground' : 'text-muted-foreground',
                            ].join(' ')}
                          >
                            {formatLastTime(thread.last_created_at)}
                          </div>

                          {hasUnread ? (
                            <span className="inline-flex min-w-6 items-center justify-center rounded-full bg-black px-2 py-0.5 text-[11px] font-bold text-white">
                              {unread > 99 ? '99+' : unread}
                            </span>
                          ) : null}
                        </div>
                      </div>

                      {isTyping ? (
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
                            hasUnread ? 'font-semibold text-neutral-900 dark:text-foreground' : 'text-muted-foreground',
                          ].join(' ')}
                        >
                          {lastBody}
                        </div>
                      )}
                    </div>
                  </div>
                </button>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )

  return (
    <div className="h-full min-h-0 overflow-hidden" dir="rtl">
      {error ? <div className="mb-4"><ErrorBanner message={error} /></div> : null}

      <div className="hidden h-full min-h-0 md:grid md:grid-cols-[360px_1fr] md:gap-4">
        <aside className="h-full min-h-0 overflow-hidden rounded-3xl border border-black/5 bg-[#FAF9F6] shadow-sm dark:border-white/10 dark:bg-[#1a1a1a]">
          {threadPane}
        </aside>

        <main className="h-full min-h-0 overflow-hidden">
          {selectedConversationId ? (
            <ChatClient conversationId={selectedConversationId} mode="admin" />
          ) : (
            <div className="flex h-full w-full items-center justify-center rounded-3xl border border-black/5 bg-[#FAF9F6] shadow-sm dark:border-white/10 dark:bg-[#1a1a1a]">
              <div className="text-center">
                <div className="text-lg font-black">בחר שיחה</div>
                <div className="mt-1 text-sm text-muted-foreground">כדי להתחיל לדבר 🙂</div>
              </div>
            </div>
          )}
        </main>
      </div>

      <div className="h-full min-h-0 overflow-hidden md:hidden">
        {selectedConversationId ? (
          <ChatClient conversationId={selectedConversationId} mode="admin" />
        ) : (
          <div className="h-full min-h-0 overflow-hidden rounded-2xl border border-black/5 bg-[#FAF9F6] shadow-sm dark:border-white/10 dark:bg-[#1a1a1a]">
            {threadPane}
          </div>
        )}
      </div>
    </div>
  )
}

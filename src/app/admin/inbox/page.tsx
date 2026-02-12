'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Avatar from '@/components/Avatar'
import { adminFetch } from '@/lib/admin/adminFetch'
import { getAdminErrorMessage } from '@/lib/admin/adminUi'
import PageHeader from '@/components/admin/PageHeader'
import ErrorBanner from '@/components/admin/ErrorBanner'
import EmptyState from '@/components/admin/EmptyState'
import { TableSkeleton } from '@/components/admin/AdminSkeleton'
import {
  Search,
  RefreshCw,
  MessageSquare,
  Send,
  ArrowLeft,
} from 'lucide-react'

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

type Msg = {
  id: string
  conversation_id: string
  sender_id: string
  body: string
  created_at: string
  read_at: string | null
}

function formatTime(iso: string) {
  try {
    return new Date(iso).toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' })
  } catch {
    return ''
  }
}

function formatDay(iso: string) {
  try {
    return new Date(iso).toLocaleDateString('he-IL', { day: '2-digit', month: '2-digit', year: 'numeric' })
  } catch {
    return ''
  }
}

function getSystemUserId(): string | null {
  const v = process.env.NEXT_PUBLIC_SYSTEM_USER_ID
  return typeof v === 'string' && v.trim() ? v.trim() : null
}

export default function AdminInboxPage() {
  const systemUserId = getSystemUserId()

  const [q, setQ] = useState('')
  const [userHits, setUserHits] = useState<UserHit[]>([])
  const [searching, setSearching] = useState(false)

  const [threads, setThreads] = useState<Thread[]>([])
  const [threadsLoading, setThreadsLoading] = useState(true)
  const [selectedConversationId, setSelectedConversationId] = useState<string | null>(null)

  const [messages, setMessages] = useState<Msg[]>([])
  const [messagesLoading, setMessagesLoading] = useState(false)

  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const listRef = useRef<HTMLDivElement | null>(null)

  const selectedThread = useMemo(
    () => threads.find((t) => t.conversation_id === selectedConversationId) ?? null,
    [threads, selectedConversationId]
  )

  const loadThreads = useCallback(async () => {
    setThreadsLoading(true)
    setError(null)
    try {
      const r = await adminFetch('/api/admin/inbox/threads')
      const j = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(getAdminErrorMessage(j, 'שגיאה בטעינת שיחות'))
      setThreads(Array.isArray(j?.threads) ? (j.threads as Thread[]) : [])
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'שגיאה')
      setThreads([])
    } finally {
      setThreadsLoading(false)
    }
  }, [])

  const loadMessages = useCallback(async (conversationId: string) => {
    setMessagesLoading(true)
    setError(null)
    try {
      const r = await adminFetch(`/api/admin/inbox/messages?conversation_id=${encodeURIComponent(conversationId)}`)
      const j = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(getAdminErrorMessage(j, 'שגיאה בטעינת הודעות'))
      setMessages(Array.isArray(j?.messages) ? (j.messages as Msg[]) : [])
      setTimeout(() => {
        const el = listRef.current
        if (!el) return
        el.scrollTop = el.scrollHeight
      }, 0)
      void loadThreads()
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'שגיאה')
      setMessages([])
    } finally {
      setMessagesLoading(false)
    }
  }, [loadThreads])

  useEffect(() => {
    void loadThreads()
  }, [loadThreads])

  useEffect(() => {
    if (!selectedConversationId) {
      setMessages([])
      return
    }
    void loadMessages(selectedConversationId)
  }, [selectedConversationId, loadMessages])

  const searchUsers = useCallback(async () => {
    const term = q.trim()
    if (term.length < 2) {
      setUserHits([])
      return
    }
    setSearching(true)
    setError(null)
    try {
      const r = await adminFetch(`/api/admin/inbox/users?q=${encodeURIComponent(term)}`)
      const j = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(getAdminErrorMessage(j, 'שגיאה בחיפוש משתמשים'))
      setUserHits(Array.isArray(j?.users) ? (j.users as UserHit[]) : [])
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'שגיאה')
      setUserHits([])
    } finally {
      setSearching(false)
    }
  }, [q])

  const startOrOpen = useCallback(async (userId: string) => {
    if (!systemUserId) {
      setError('חסר NEXT_PUBLIC_SYSTEM_USER_ID ב-env')
      return
    }
    try {
      const r = await adminFetch('/api/admin/inbox/thread', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ user_id: userId }),
      })
      const j = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(getAdminErrorMessage(j, 'שגיאה בפתיחת שיחה'))
      const cid = String(j?.conversation_id ?? '')
      if (!cid) throw new Error('שגיאה: חסר conversation_id')
      setSelectedConversationId(cid)
      setQ('')
      setUserHits([])
      void loadThreads()
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'שגיאה')
    }
  }, [loadThreads, systemUserId])

  const send = useCallback(async () => {
    if (!selectedConversationId) return
    const body = text.trim()
    if (body.length < 1) return
    setSending(true)
    setError(null)
    try {
      const r = await adminFetch('/api/admin/inbox/send', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ conversation_id: selectedConversationId, body }),
      })
      const j = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(getAdminErrorMessage(j, 'שגיאה בשליחה'))
      setText('')
      await loadMessages(selectedConversationId)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'שגיאה')
    } finally {
      setSending(false)
    }
  }, [loadMessages, selectedConversationId, text])

  const headerName = useMemo(() => {
    if (!selectedThread) return ''
    return (selectedThread.other_display_name ?? '').trim() || (selectedThread.other_username ?? '').trim() || 'שיחה'
  }, [selectedThread])

  // On mobile: show chat panel when a thread is selected, otherwise show sidebar
  const showChatOnMobile = selectedConversationId !== null

  return (
    <div className="space-y-4" dir="rtl">
      <PageHeader
        title="אינבוקס תמיכת מערכת"
        description="חיפוש משתמשים · פתיחת שיחה · היסטוריה · שליחת הודעות כ״מערכת האתר״."
      />

      {error && <ErrorBanner message={error} />}

      <div className="grid h-[calc(100dvh-160px)] min-h-[400px] gap-4 md:grid-cols-[minmax(320px,360px)_1fr]">
        {/* Left: threads + user search */}
        <aside className={
          'flex min-w-0 min-h-0 flex-col overflow-hidden rounded-xl border border-neutral-200 bg-white ' +
          (showChatOnMobile ? 'hidden md:flex' : 'flex')
        }>
          {/* Search section */}
          <div className="border-b border-neutral-100 p-3">
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Search size={14} className="absolute top-1/2 right-3 -translate-y-1/2 text-neutral-400" />
                <input
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') void searchUsers()
                  }}
                  placeholder="חפש username / שם תצוגה…"
                  className="w-full rounded-lg border border-neutral-200 bg-white py-2 pr-8 pl-3 text-sm outline-none focus:border-neutral-400 focus:ring-1 focus:ring-neutral-400"
                />
              </div>
              <button
                onClick={() => void searchUsers()}
                disabled={searching}
                className="shrink-0 rounded-lg bg-neutral-900 px-3 py-2 text-sm font-medium text-white hover:bg-neutral-800 disabled:opacity-50"
              >
                חפש
              </button>
            </div>

            {searching && <div className="mt-2 text-[11px] text-neutral-400">מחפש…</div>}

            {userHits.length > 0 && (
              <div className="mt-3 space-y-1.5">
                {userHits.map((u) => {
                  const name = (u.display_name ?? '').trim() || (u.username ?? '').trim()
                  return (
                    <button
                      key={u.id}
                      type="button"
                      onClick={() => void startOrOpen(u.id)}
                      className="flex w-full items-center gap-3 rounded-lg border border-neutral-200 bg-white px-3 py-2 text-right transition-colors hover:bg-neutral-50"
                    >
                      <Avatar src={u.avatar_url} name={name} size={32} shape="square" />
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-semibold text-neutral-900">{name}</div>
                        <div className="truncate text-[11px] text-neutral-400">@{u.username}</div>
                      </div>
                      <span className="text-xs font-medium text-neutral-500">פתח</span>
                    </button>
                  )
                })}
              </div>
            )}
          </div>

          {/* Threads list */}
          <div className="min-h-0 flex-1 overflow-y-auto p-3">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-xs font-semibold text-neutral-500 uppercase tracking-wide">שיחות</span>
              <button
                type="button"
                onClick={() => void loadThreads()}
                className="flex h-7 w-7 items-center justify-center rounded-md border border-neutral-200 bg-white text-neutral-400 hover:bg-neutral-50"
                aria-label="רענן"
              >
                <RefreshCw size={12} />
              </button>
            </div>
            {threadsLoading ? (
              <TableSkeleton rows={3} />
            ) : threads.length === 0 ? (
              <EmptyState
                title="אין שיחות עדיין"
                icon={<MessageSquare size={28} strokeWidth={1.5} />}
              />
            ) : (
              <div className="space-y-1.5">
                {threads.map((t) => {
                  const name =
                    (t.other_display_name ?? '').trim() || (t.other_username ?? '').trim() || 'שיחה'
                  const active = t.conversation_id === selectedConversationId
                  const unread = Number.isFinite(t.unread_count) ? t.unread_count : 0
                  const hasUnread = unread > 0
                  const lastBody = (t.last_body ?? '').trim() || 'אין עדיין הודעות'

                  return (
                    <button
                      key={t.conversation_id}
                      type="button"
                      onClick={() => setSelectedConversationId(t.conversation_id)}
                      className={
                        'w-full rounded-lg p-3 text-right transition-colors ' +
                        (active
                          ? 'bg-neutral-100 border border-neutral-300'
                          : 'border border-transparent hover:bg-neutral-50')
                      }
                    >
                      <div className="flex items-center gap-3">
                        <Avatar src={t.other_avatar_url} name={name} size={36} shape="square" />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center justify-between gap-2">
                            <span className="truncate text-sm font-semibold text-neutral-900">{name}</span>
                            {hasUnread && (
                              <span className="inline-flex min-w-5 items-center justify-center rounded-full bg-neutral-900 px-1.5 py-0.5 text-[10px] font-bold text-white">
                                {unread > 99 ? '99+' : unread}
                              </span>
                            )}
                          </div>
                          <div className="mt-0.5 truncate text-[11px] text-neutral-400">{lastBody}</div>
                        </div>
                      </div>
                    </button>
                  )
                })}
              </div>
            )}
          </div>
        </aside>

        {/* Right: chat */}
        <section className={
          'flex min-w-0 min-h-0 flex-col overflow-hidden rounded-xl border border-neutral-200 bg-white ' +
          (showChatOnMobile ? 'flex' : 'hidden md:flex')
        }>
          {!selectedConversationId ? (
            <div className="flex h-full items-center justify-center p-6 text-center">
              <EmptyState
                title="בחר שיחה"
                description="או חפש משתמש כדי לפתוח שיחה חדשה"
                icon={<MessageSquare size={40} strokeWidth={1.5} />}
              />
            </div>
          ) : (
            <>
              {/* Chat header */}
              <div className="flex items-center gap-3 border-b border-neutral-100 px-4 py-3">
                {/* Back button on mobile */}
                <button
                  type="button"
                  onClick={() => setSelectedConversationId(null)}
                  className="flex h-8 w-8 items-center justify-center rounded-lg border border-neutral-200 text-neutral-500 hover:bg-neutral-50 md:hidden"
                  aria-label="חזרה"
                >
                  <ArrowLeft size={16} />
                </button>
                <Avatar
                  src={selectedThread?.other_avatar_url ?? null}
                  name={headerName}
                  size={32}
                  shape="square"
                />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-semibold text-neutral-900">{headerName}</div>
                  <div className="text-[11px] text-neutral-400">
                    {selectedThread?.other_username ? `@${selectedThread.other_username}` : ''}
                  </div>
                </div>
              </div>

              {/* Messages */}
              <div
                ref={listRef}
                className="min-h-0 flex-1 overflow-y-auto p-4"
                style={{ backgroundColor: '#FAFAF9' }}
              >
                {messagesLoading ? (
                  <TableSkeleton rows={3} />
                ) : messages.length === 0 ? (
                  <EmptyState
                    title="אין עדיין הודעות"
                    icon={<MessageSquare size={28} strokeWidth={1.5} />}
                  />
                ) : (
                  <div className="space-y-3">
                    {messages.map((m) => {
                      const isMine = systemUserId ? m.sender_id === systemUserId : false
                      return (
                        <div key={m.id} className={isMine ? 'flex justify-start' : 'flex justify-end'}>
                          <div
                            className={
                              'max-w-[85%] rounded-xl px-3.5 py-2.5 text-sm whitespace-pre-wrap shadow-sm ' +
                              (isMine
                                ? 'bg-white border border-neutral-200 text-neutral-900'
                                : 'bg-neutral-900 text-white')
                            }
                          >
                            <div>{m.body}</div>
                            <div className={
                              'mt-1.5 text-[10px] ' +
                              (isMine ? 'text-neutral-400' : 'text-white/60')
                            }>
                              {formatDay(m.created_at)} · {formatTime(m.created_at)}
                            </div>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>

              {/* Composer */}
              <div className="border-t border-neutral-100 bg-white p-3">
                <div className="flex items-end gap-2">
                  <textarea
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                    rows={2}
                    placeholder="כתוב הודעה…"
                    className="w-full resize-none rounded-lg border border-neutral-200 bg-white p-3 text-sm outline-none focus:border-neutral-400 focus:ring-1 focus:ring-neutral-400"
                    onKeyDown={(e) => {
                      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
                        e.preventDefault()
                        void send()
                      }
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => void send()}
                    disabled={sending || text.trim().length === 0}
                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-neutral-900 text-white hover:bg-neutral-800 disabled:bg-neutral-300 disabled:cursor-not-allowed"
                    aria-label="שלח"
                  >
                    <Send size={16} />
                  </button>
                </div>
                <div className="mt-1.5 text-[11px] text-neutral-400">
                  שליחה כ״מערכת האתר״ (System User). קיצור: Ctrl/⌘ + Enter.
                </div>
              </div>
            </>
          )}
        </section>
      </div>
    </div>
  )
}

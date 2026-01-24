'use client'

import Link from 'next/link'
import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabaseClient'
import Avatar from '@/components/Avatar'

type Msg = {
  id: string
  conversation_id: string
  sender_id: string
  body: string
  created_at: string
  read_at: string | null
}

type MiniProfile = {
  id: string
  username: string
  display_name: string | null
  avatar_url: string | null
}

type InboxThreadRow = {
  conversation_id: string
  other_user_id: string
  other_username: string
  other_display_name: string | null
  other_avatar_url: string | null
}

function formatTime(iso: string) {
  try {
    return new Date(iso).toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' })
  } catch {
    return ''
  }
}

function isSameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
}

function daysDiff(from: Date, to: Date) {
  const a = new Date(from.getFullYear(), from.getMonth(), from.getDate()).getTime()
  const b = new Date(to.getFullYear(), to.getMonth(), to.getDate()).getTime()
  return Math.round((b - a) / (1000 * 60 * 60 * 24))
}

function formatDayLabel(iso: string) {
  const d = new Date(iso)
  const now = new Date()
  const diff = daysDiff(d, now)

  if (diff === 0) return 'היום'
  if (diff === 1) return 'אתמול'
  if (diff >= 2 && diff <= 6) return d.toLocaleDateString('he-IL', { weekday: 'long' })
  return d.toLocaleDateString('he-IL', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

function softWrapEveryN(input: string, n = 55) {
  const lines = input.replace(/\r\n/g, '\n').split('\n')
  const wrapped = lines.map(line => {
    if (line.length <= n) return line
    const parts: string[] = []
    for (let i = 0; i < line.length; i += n) parts.push(line.slice(i, i + n))
    return parts.join('\n')
  })
  return wrapped.join('\n')
}

function mergeMessagesById(prev: Msg[], incoming: Msg[]) {
  const map = new Map<string, Msg>()
  for (const m of prev) map.set(m.id, m)
  for (const m of incoming) map.set(m.id, m)
  return Array.from(map.values()).sort((a, b) => +new Date(a.created_at) - +new Date(b.created_at))
}

function clampBadge(n: number) {
  if (n <= 0) return 0
  if (n > 99) return 99
  return n
}

function computeUnreadCount(list: Msg[], myId: string | null) {
  if (!myId) return 0
  return list.filter(m => m.sender_id !== myId && m.read_at == null).length
}

function computeFirstUnreadIndex(list: Msg[], myId: string | null) {
  if (!myId) return -1
  return list.findIndex(m => m.sender_id !== myId && m.read_at == null)
}

export default function ChatClient({ conversationId }: { conversationId: string }) {
  const router = useRouter()

  const [messages, setMessages] = useState<Msg[]>([])
  const [text, setText] = useState('')
  const [myId, setMyId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)
  const [other, setOther] = useState<MiniProfile | null>(null)

  // typing
  const [isOtherTyping, setIsOtherTyping] = useState(false)
  const typingTimeoutRef = useRef<number | null>(null)
  const typingSentAtRef = useRef<number>(0)

  // scroll
  const listRef = useRef<HTMLDivElement | null>(null)
  const [isAtBottom, setIsAtBottom] = useState(true)
  const isAtBottomRef = useRef(true)
  const didInitialScrollRef = useRef(false)

  // auto-follow: אם המשתמש גלל למעלה, לא “נגרור” אותו לתחתית
  const [autoFollow, setAutoFollow] = useState(true)
  const autoFollowRef = useRef(true)

  // sticky day
  const [stickyDay, setStickyDay] = useState<string | null>(null)
  const [isAtTop, setIsAtTop] = useState(true)

  // unread UI: divider/arrow badge behavior control
  const [unreadUiVisible, setUnreadUiVisible] = useState(false)
  const bottomSessionRef = useRef(0)


  // timers
  const stableBottomTimerRef = useRef<number | null>(null)

  // seen cache
  const seenIdsRef = useRef<Set<string>>(new Set())

  const computeIsAtBottom = useCallback(() => {
    const el = listRef.current
    if (!el) return true
    const epsilon = 10
    return el.scrollTop + el.clientHeight >= el.scrollHeight - epsilon
  }, [])

  const scrollListToBottom = useCallback((behavior: 'auto' | 'smooth' = 'smooth') => {
    const el = listRef.current
    if (!el) return
    const top = el.scrollHeight
    if (behavior === 'auto') el.scrollTop = top
    else el.scrollTo({ top, behavior: 'smooth' })
  }, [])

  const fetchMessages = useCallback(async () => {
    const { data, error } = await supabase
      .from('messages')
      .select('id, conversation_id, sender_id, body, created_at, read_at')
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: true })

    if (error) {
      console.error('fetchMessages error:', error)
      return []
    }

    const list = (data ?? []) as Msg[]
    const s = new Set(seenIdsRef.current)
    for (const m of list) s.add(m.id)
    seenIdsRef.current = s

    setMessages(prev => mergeMessagesById(prev, list))
    return list
  }, [conversationId])

  const markReadNow = useCallback(async () => {
    const { data } = await supabase.auth.getUser()
    if (!data.user?.id) return
    await supabase.rpc('mark_conversation_read', { p_conversation_id: conversationId })
    await fetchMessages()
  }, [conversationId, fetchMessages])

  function clearStableBottomTimer() {
    if (stableBottomTimerRef.current) {
      window.clearTimeout(stableBottomTimerRef.current)
      stableBottomTimerRef.current = null
    }
  }

  // mark-read policy: רק אם באמת בתחתית ונשאר שם ~1.8s
const scheduleMarkReadIfStableBottom = useCallback(
  (unreadNowLocal: number) => {
    clearStableBottomTimer()
    if (unreadNowLocal <= 0) return
    if (!isAtBottomRef.current) return

    // capture session at scheduling time
    const sessionAtSchedule = bottomSessionRef.current

    stableBottomTimerRef.current = window.setTimeout(async () => {
      // אם בינתיים יצאת מהתחתית אפילו פעם אחת -> לא מסמנים
      if (bottomSessionRef.current !== sessionAtSchedule) return
      if (!isAtBottomRef.current) return

      await markReadNow()
    }, 1800)
  },
  [markReadNow]
)

  // ---- auth (me) ----
  useEffect(() => {
    let mounted = true

    async function loadMe() {
      const { data } = await supabase.auth.getUser()
      if (!mounted) return
      setMyId(data.user?.id ?? null)
    }

    void loadMe()

    const { data: sub } = supabase.auth.onAuthStateChange(() => {
      void loadMe()
    })

    return () => {
      mounted = false
      sub.subscription.unsubscribe()
    }
  }, [])

  // reset per conversation
  useEffect(() => {
    setMessages([])
    setLoading(true)
    setUnreadUiVisible(false)
    setStickyDay(null)
    setIsAtTop(true)

    setAutoFollow(true)
    autoFollowRef.current = true

    setIsAtBottom(true)
    isAtBottomRef.current = true

    clearStableBottomTimer()
    seenIdsRef.current = new Set()
    didInitialScrollRef.current = false
  }, [conversationId])

  // load other
  useEffect(() => {
    let mounted = true

    async function loadOther() {
      const { data: me } = await supabase.auth.getUser()
      if (!me.user?.id) return

      const { data, error } = await supabase
        .from('inbox_threads')
        .select('conversation_id, other_user_id, other_username, other_display_name, other_avatar_url')
        .eq('conversation_id', conversationId)
        .maybeSingle()

      if (!mounted) return
      if (error || !data) {
        setOther(null)
        return
      }

      const row = data as InboxThreadRow
      setOther({
        id: row.other_user_id,
        username: row.other_username,
        display_name: row.other_display_name,
        avatar_url: row.other_avatar_url,
      })
    }

    void loadOther()
    return () => {
      mounted = false
    }
  }, [conversationId])

  // unreadNow as truth (state)
  const unreadNow = useMemo(() => computeUnreadCount(messages, myId), [messages, myId])

  const firstUnreadIndex = useMemo(() => computeFirstUnreadIndex(messages, myId), [messages, myId])

  // grouped list
  const grouped = useMemo(() => {
    const out: Array<{ type: 'day'; label: string } | { type: 'msg'; msg: Msg }> = []
    for (let i = 0; i < messages.length; i++) {
      const cur = messages[i]
      const prev = messages[i - 1]
      const curD = new Date(cur.created_at)
      const prevD = prev ? new Date(prev.created_at) : null
      if (!prevD || !isSameDay(prevD, curD)) out.push({ type: 'day', label: formatDayLabel(cur.created_at) })
      out.push({ type: 'msg', msg: cur })
    }
    return out
  }, [messages])

  useLayoutEffect(() => {
  if (loading) return
  if (didInitialScrollRef.current) return

  // מחכים שה-DOM יתיישב (לפעמים צריך 2 פריימים)
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      scrollListToBottom('auto')
      const atBottomNow = computeIsAtBottom()
      setIsAtBottom(atBottomNow)
      isAtBottomRef.current = atBottomNow

      // אם יש unread – תציג UI (אבל לא לסמן נקרא מיד)
      if (unreadNow > 0) setUnreadUiVisible(true)

      if (atBottomNow) scheduleMarkReadIfStableBottom(unreadNow)

      didInitialScrollRef.current = true
    })
  })
}, [loading, messages.length, scrollListToBottom, computeIsAtBottom, unreadNow, scheduleMarkReadIfStableBottom])


  // initial load (fixed: compute unread from fetched list + real myId)
  useEffect(() => {
    let mounted = true

    void (async () => {
      const { data: me } = await supabase.auth.getUser()
      const uid = me.user?.id ?? null
      if (!mounted) return
      if (uid && uid !== myId) setMyId(uid)

      const list = await fetchMessages()
      if (!mounted) return

      setLoading(false)

      // כניסה: יורד לתחתית, אבל לא מסמן נקרא מיד
      scrollListToBottom('auto')

      // אחרי שה-DOM התייצב: עדכן מצב bottom + unread
      setTimeout(() => {
        const atBottomNow = computeIsAtBottom()
        setIsAtBottom(atBottomNow)
        isAtBottomRef.current = atBottomNow

        const unreadOnEntry = computeUnreadCount(list, uid)
        if (unreadOnEntry > 0) setUnreadUiVisible(true)

        if (atBottomNow) scheduleMarkReadIfStableBottom(unreadOnEntry)
      }, 120)
    })()

    return () => {
      mounted = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversationId, fetchMessages])

  // auto-hide divider only when truth says 0 and we are at bottom
  useEffect(() => {
    if (unreadNow <= 0 && isAtBottom) {
      setUnreadUiVisible(false)
    }
  }, [unreadNow, isAtBottom])

  // scroll listener (UI + autoFollow + sticky day)
  useEffect(() => {
    const root = listRef.current
    if (!root) return

    let raf = 0

    function onScroll() {
      const el = listRef.current
if (el) {
  const epsilon = 10
  const atBottomSync = el.scrollTop + el.clientHeight >= el.scrollHeight - epsilon
  isAtBottomRef.current = atBottomSync
}

      cancelAnimationFrame(raf)
      raf = requestAnimationFrame(() => {
        const el = listRef.current
        if (!el) return

        const atBottomNow = computeIsAtBottom()
        setIsAtBottom(atBottomNow)
        isAtBottomRef.current = atBottomNow

        // autoFollow: אם בתחתית -> true, אם לא -> false
        if (atBottomNow) {
          setAutoFollow(true)
          autoFollowRef.current = true
        } else {
          setAutoFollow(false)
          autoFollowRef.current = false
        }

        // אם המשתמש יצא מהתחתית ויש unread -> keep UI visible
        if (!atBottomNow && unreadNow > 0) setUnreadUiVisible(true)

        const atTopNow = el.scrollTop <= 2
        setIsAtTop(atTopNow)
        if (atTopNow) setStickyDay(null)

        if (!atTopNow) {
          const nodes = Array.from(el.querySelectorAll('[data-day-sep="1"]')) as HTMLElement[]
          if (nodes.length > 0) {
            const topY = el.getBoundingClientRect().top
            let current: string | null = null
            for (const n of nodes) {
              const rect = n.getBoundingClientRect()
              if (rect.top - topY <= 10) current = n.getAttribute('data-day-label')
              else break
            }
            setStickyDay(current)
          }
        }

        // mark read only after stable bottom
        if (atBottomNow) {
  scheduleMarkReadIfStableBottom(unreadNow)
} else {
  // יצאנו מהתחתית -> invalidate לכל טיימר קיים/עתידי שנקבע קודם
  bottomSessionRef.current += 1
  clearStableBottomTimer()
}
      })
    }

    root.addEventListener('scroll', onScroll, { passive: true })
    onScroll()

    return () => {
      root.removeEventListener('scroll', onScroll)
      cancelAnimationFrame(raf)
    }
  }, [computeIsAtBottom, scheduleMarkReadIfStableBottom, unreadNow])

  // realtime subscription
  useEffect(() => {
    const channel = supabase
      .channel(`chat-${conversationId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'messages',
          filter: `conversation_id=eq.${conversationId}`,
        },
        payload => {
          if (payload.eventType === 'INSERT') {
            const next = payload.new as Msg
            if (seenIdsRef.current.has(next.id)) return
            seenIdsRef.current.add(next.id)

            setMessages(prev => [...prev, next])

            const mine = !!myId && next.sender_id === myId

            // שלי: תמיד לתחתית
            if (mine) {
              setTimeout(() => scrollListToBottom('auto'), 0)
              return
            }

            // שלו/ה:
            if (autoFollowRef.current) {
              // אם אני נעול לתחתית - לגלול למטה, ואז להפעיל mark-read יציב
              setTimeout(() => {
                scrollListToBottom('auto')
                const atBottomNow = computeIsAtBottom()
                setIsAtBottom(atBottomNow)
                isAtBottomRef.current = atBottomNow

                // unreadNow עדיין לא התעדכן, אז נשתמש ב-unreadNow + 1 (הודעה חדשה שלהם)
                const unreadLocal = unreadNow + 1
                if (unreadLocal > 0) setUnreadUiVisible(true)
                if (atBottomNow) scheduleMarkReadIfStableBottom(unreadLocal)
              }, 0)
            } else {
              // אני למעלה: לא מסמן נקרא, אבל מציג UI + badge
              setUnreadUiVisible(true)
            }

            return
          }

          if (payload.eventType === 'UPDATE') {
            const next = payload.new as Msg
            setMessages(prev => prev.map(m => (m.id === next.id ? { ...m, read_at: next.read_at } : m)))
          }
        }
      )
      .subscribe()

    // safety polling
    const interval = window.setInterval(() => {
      void fetchMessages()
    }, 6000)

    return () => {
      window.clearInterval(interval)
      supabase.removeChannel(channel)
    }
  }, [
    conversationId,
    computeIsAtBottom,
    fetchMessages,
    myId,
    scheduleMarkReadIfStableBottom,
    scrollListToBottom,
    unreadNow,
  ])

  // typing broadcast
  useEffect(() => {
    if (!myId) return

    const typingChannel = supabase
      .channel(`typing-${conversationId}`)
      .on('broadcast', { event: 'typing' }, payload => {
        const p = payload?.payload as { user_id?: string } | undefined
        const uid = p?.user_id
        if (!uid) return
        if (uid === myId) return

        setIsOtherTyping(true)
        if (typingTimeoutRef.current) window.clearTimeout(typingTimeoutRef.current)
        typingTimeoutRef.current = window.setTimeout(() => setIsOtherTyping(false), 2500)
      })
      .subscribe()

    return () => {
      if (typingTimeoutRef.current) window.clearTimeout(typingTimeoutRef.current)
      supabase.removeChannel(typingChannel)
    }
  }, [conversationId, myId])

  const sendTyping = useCallback(async () => {
    if (!myId) return
    const now = Date.now()
    if (now - typingSentAtRef.current < 700) return
    typingSentAtRef.current = now

    await supabase.channel(`typing-${conversationId}`).send({ type: 'broadcast', event: 'typing', payload: { user_id: myId } })
  }, [conversationId, myId])

  async function send() {
    const bodyTrimmed = text.trim()
    if (!bodyTrimmed) return

    const { data } = await supabase.auth.getUser()
    const uid = data.user?.id
    if (!uid) {
      alert('כדי לשלוח הודעה צריך להתחבר 🙂')
      router.push('/login')
      return
    }

    setSending(true)
    try {
      const safeBody = softWrapEveryN(bodyTrimmed, 55)

      const { data: messageId, error } = await supabase.rpc('send_message', {
        p_conversation_id: conversationId,
        p_body: safeBody,
      })

      if (error || !messageId) {
        alert(`לא הצלחתי לשלוח הודעה.\n${error?.message ?? 'נסי שוב.'}`)
        console.error('send_message error:', error)
        return
      }

      setText('')
      await fetchMessages()
      setTimeout(() => scrollListToBottom('auto'), 0)
    } finally {
      setSending(false)
    }
  }

  const otherDisplay = (other?.display_name ?? '').trim() || (other?.username ?? 'שיחה')
  const headerSubText = isOtherTyping ? 'מקליד/ה…' : ''

  // divider shown if unread exists AND we decided it should be visible
  const showUnreadDivider = unreadNow > 0 && unreadUiVisible

  // arrow badge: use unreadNow (אמת של read_at==null)
  const arrowBadgeCount = clampBadge(unreadNow)

  return (
    <div
      className="flex min-h-0 flex-col overflow-hidden rounded-3xl border bg-white shadow-sm h-[calc(100dvh-180px)] md:h-full"
      dir="rtl"
    >
      {/* Header */}
      <div className="relative flex items-center gap-3 border-b border-black/5 bg-white/70 px-4 py-3 backdrop-blur">
        <div className="absolute inset-y-2 right-0 w-1 rounded-l-full bg-[#D64545]/70" aria-hidden="true" />
        <Avatar src={other?.avatar_url ?? null} name={otherDisplay} size={40} shape="square" />

        <div className="min-w-0">
          {other?.username ? (
            <Link
              href={`/u/${other.username}`}
              className="truncate text-sm font-black hover:underline"
              title={`לפרופיל של @${other.username}`}
            >
              {otherDisplay}
            </Link>
          ) : (
            <div className="truncate text-sm font-black">{otherDisplay}</div>
          )}
          <div className="text-xs text-muted-foreground">{headerSubText}</div>
        </div>
      </div>

      {/* Wrapper relative for overlay */}
      <div className="relative flex min-h-0 flex-1 flex-col">
        {/* Messages scroller */}
        <div
          ref={listRef}
          className="min-h-0 flex-1 overflow-y-auto bg-gradient-to-b from-[#F7F6F3] to-[#EEEAE2] px-4 py-6 pb-28"
        >
          {!isAtTop && stickyDay && (
            <div className="pointer-events-none sticky top-2 z-10 flex justify-center">
              <div className="rounded-full border bg-white/85 px-3 py-1 text-xs font-semibold text-neutral-700 shadow-sm backdrop-blur">
                {stickyDay}
              </div>
            </div>
          )}

          {_groupedRender(grouped, messages, myId, firstUnreadIndex, showUnreadDivider ? unreadNow : 0)}

          {loading && (
            <div className="mx-auto max-w-sm rounded-2xl border bg-white/80 p-4 text-center text-sm text-muted-foreground">
              טוען שיחה…
            </div>
          )}
        </div>

        {/* Arrow overlay: show whenever not at bottom */}
        {!isAtBottom && (
          <button
            onClick={() => {
              scrollListToBottom('smooth')
              setAutoFollow(true)
              autoFollowRef.current = true

              setTimeout(() => {
                const atBottomNow = computeIsAtBottom()
                setIsAtBottom(atBottomNow)
                isAtBottomRef.current = atBottomNow
                if (atBottomNow) scheduleMarkReadIfStableBottom(unreadNow)
              }, 240)
            }}
            className="absolute bottom-4 right-4 z-20 inline-flex items-center gap-2 rounded-full border border-black/5 bg-white/80 px-3 py-2 text-xs font-black shadow-lg backdrop-blur transition hover:bg-white"
            title="קפוץ להודעה האחרונה"
          >
            {arrowBadgeCount > 0 && (
              <span className="inline-flex min-w-6 items-center justify-center rounded-full bg-[#D64545] px-2 py-0.5 text-[11px] font-bold text-white">
                {arrowBadgeCount >= 99 ? '99+' : arrowBadgeCount}
              </span>
            )}

            <span>למטה</span>

            <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true">
              <path
                d="M7 10l5 5 5-5"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
        )}
      </div>

      {/* Composer */}
      <div
        className="border-t border-black/5 bg-white/80 p-3 backdrop-blur"
        style={{ paddingBottom: 'calc(0.75rem + env(safe-area-inset-bottom))' }}
      >
        <div className="flex items-stretch gap-2">
          <textarea
            value={text}
            onChange={e => {
              setText(e.target.value)
              void sendTyping()
            }}
            placeholder="כתוב הודעה…"
            rows={1}
            className="h-11 flex-1 resize-none rounded-full border border-black/10 bg-[#F7F6F3] px-4 py-2 text-sm outline-none transition focus:border-black/20 focus:bg-white"
            disabled={sending}
            onKeyDown={e => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                void send()
              }
            }}
          />

          <button
            onClick={() => void send()}
            disabled={sending || !text.trim()}
            className={[
              'h-11 shrink-0 rounded-full px-5 text-sm font-bold',
              sending || !text.trim()
                ? 'cursor-not-allowed bg-neutral-200 text-neutral-500'
                : 'bg-[#D64545] text-white shadow-sm hover:opacity-90',
            ].join(' ')}
          >
            שלח
          </button>
        </div>

        <div className="mt-1 text-[11px] text-muted-foreground">Enter לשליחה · Shift+Enter לשורה חדשה</div>
      </div>
    </div>
  )
}

function _groupedRender(
  grouped: Array<{ type: 'day'; label: string } | { type: 'msg'; msg: Msg }>,
  rawMessages: Msg[],
  myId: string | null,
  firstUnreadIndex: number,
  unreadCountForDivider: number
) {
  if (grouped.length === 0) {
    return (
      <div className="mx-auto max-w-sm rounded-2xl border bg-white/80 p-4 text-center text-sm text-muted-foreground">
        אין עדיין הודעות. תגיד/י שלום 🙂
      </div>
    )
  }

  const indexById = new Map<string, number>()
  for (let i = 0; i < rawMessages.length; i++) indexById.set(rawMessages[i].id, i)

  return (
    <div className="space-y-3">
      {grouped.map((item, idx) => {
        if (item.type === 'day') {
          return (
            <div key={`day-${idx}`} className="flex justify-center" data-day-sep="1" data-day-label={item.label}>
              <span className="rounded-full border bg-white/80 px-3 py-1 text-xs font-semibold text-neutral-600 shadow-sm">
                {item.label}
              </span>
            </div>
          )
        }

        const m = item.msg
        const mine = !!myId && m.sender_id === myId
        const status = mine ? (m.read_at ? 'נראה' : 'נמסר') : null

        const bubbleWrapClass = mine ? 'ml-auto' : 'mr-auto'
        const metaAlignClass = mine ? 'justify-end' : 'justify-start'

        const rawIndex = indexById.get(m.id) ?? -1
        const shouldInsertDivider =
          unreadCountForDivider > 0 && firstUnreadIndex >= 0 && rawIndex === firstUnreadIndex

        return (
          <div key={m.id} className="space-y-3">
            {shouldInsertDivider && (
              <div className="flex items-center justify-center">
                <div className="rounded-full border bg-white/90 px-4 py-1 text-xs font-black text-neutral-800 shadow-sm">
                  {unreadCountForDivider} הודעות שלא נקראו
                </div>
              </div>
            )}

            <div className="flex">
              <div className={`max-w-[78%] ${bubbleWrapClass}`}>
                <div
                  className={[
                    'px-4 py-2 text-sm leading-relaxed shadow-sm',
                    'whitespace-pre-wrap break-words',
                    mine
                      ? 'bg-[#1C1C1C] text-white rounded-3xl rounded-bl-lg'
                      : 'bg-white/80 text-black border border-black/5 rounded-3xl rounded-br-lg',
                  ].join(' ')}
                  style={{ overflowWrap: 'anywhere', wordBreak: 'break-word' }}
                >
                  {m.body}
                </div>

                <div className={['mt-1 flex items-center gap-2 text-[11px] text-neutral-500', metaAlignClass].join(' ')}>
                  <span>{formatTime(m.created_at)}</span>
                  {status && <span>· {status}</span>}
                </div>
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}

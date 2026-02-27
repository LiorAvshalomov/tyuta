'use client'

import Link from 'next/link'
import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabaseClient'
import { mapSupabaseError, mapModerationRpcError } from '@/lib/mapSupabaseError'
import { useToast } from '@/components/Toast'
import Avatar from '@/components/Avatar'
import { resolveUserIdentity } from '@/lib/systemIdentity'
import { getSupportConversationId } from '@/lib/moderation'

type Msg = {
  id: string
  conversation_id: string
  sender_id: string
  body: string
  created_at: string
  read_at: string | null
  reply_to_id: string | null
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

// --- Reply / Reactions / Emoji (Patch 3) ---

type ReplyTo = {
  id: string
  authorName: string
  snippet: string
  side: 'outgoing' | 'incoming'
}

type LocalReaction = { emoji: string; count: number; mine: boolean }
type ReplyMeta = { snippet: string; sender_id: string }

const REACTION_EMOJIS = ['👍', '❤️', '😂', '😮', '😢', '😡'] as const

const EMOJI_PICKER_LIST = [
  '😀','😂','😍','🥰','😊','😎','🤔','😢',
  '😭','😡','🤯','🥺','😏','😴','🤗','😇',
  '👍','👎','👏','🙏','💪','🤞','✌️','🫂',
  '❤️','🧡','💛','💚','💙','💜','🖤','🤍',
  '🎉','🔥','✨','🌟','💯','🎊','🎵','🌈',
  '🍕','☕','🍰','🌮','🍜','🍣','🎯','🌊',
] as const

function getSystemUserId(): string | null {
  const v = process.env.NEXT_PUBLIC_SYSTEM_USER_ID
  return typeof v === 'string' && v.trim() ? v.trim() : null
}

function isSystemUser(userId: string | null | undefined): boolean {
  const sid = getSystemUserId()
  return !!sid && !!userId && userId === sid
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
  const { toast } = useToast()

  const [messages, setMessages] = useState<Msg[]>([])
  const [text, setText] = useState('')
  const [myId, setMyId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)
  const [reportOpen, setReportOpen] = useState(false)
  const [reportCategory, setReportCategory] = useState<'harassment' | 'spam' | 'self-harm' | 'other'>('harassment')
  const [reportDetails, setReportDetails] = useState('')
  const [reportSending, setReportSending] = useState(false)
  const [reportOk, setReportOk] = useState<string | null>(null)
  const [reportErr, setReportErr] = useState<string | null>(null)

  const [other, setOther] = useState<MiniProfile | null>(null)

  const [reportedMessage, setReportedMessage] = useState<Msg | null>(null)

  const canReport = !!myId && !!other?.id && other.id !== myId && !isSystemUser(other.id)

  const submitReport = useCallback(async () => {
    if (!canReport || !other?.id || !myId) return
    setReportOk(null)
    setReportErr(null)
    try {
      setReportSending(true)
      const { error } = await supabase.from('user_reports').insert({
        reporter_id: myId,
        reported_user_id: other.id,
        conversation_id: conversationId,
        category: reportCategory,
        details: reportDetails.trim() || null,
        message_id: reportedMessage?.id ?? null,
        message_created_at: reportedMessage?.created_at ?? null,
        message_excerpt: reportedMessage ? String(reportedMessage.body).slice(0, 280) : null,
      })
      if (error) throw error
      setReportOk('דיווח נשלח. תודה ששמרת על הקהילה 🙏')
      setReportDetails('')
      setReportedMessage(null)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'לא הצלחנו לשלוח דיווח'
      setReportErr(msg)
    } finally {
      setReportSending(false)
    }
  }, [canReport, other?.id, myId, conversationId, reportCategory, reportDetails, reportedMessage])

  // NOTE: This is a private 1:1 chat UI. We intentionally do NOT show avatars inside message bubbles.

  // typing
  const [isOtherTyping, setIsOtherTyping] = useState(false)
  const typingTimeoutRef = useRef<number | null>(null)
  const typingSentAtRef = useRef<number>(0)

  // scroll
  const listRef = useRef<HTMLDivElement | null>(null)
  const [isAtBottom, setIsAtBottom] = useState(true)
  const isAtBottomRef = useRef(true)
  const didInitialScrollRef = useRef(false)

  // auto-follow: אם המשתמש גלל למעלה, לא "נגרור" אותו לתחתית
  const [, setAutoFollow] = useState(true)
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
  const sendingRef = useRef(false)
  const [hasOlderMessages, setHasOlderMessages] = useState(true)
  const messagesRef = useRef<Msg[]>([])
  messagesRef.current = messages

  // reply / reactions / emoji (Patch 3)
  const [replyTo, setReplyTo] = useState<ReplyTo | null>(null)
  const [replyMeta, setReplyMeta] = useState<Map<string, ReplyMeta>>(new Map())
  const [reactions, setReactions] = useState<Map<string, LocalReaction[]>>(new Map())
  const [emojiPickerOpen, setEmojiPickerOpen] = useState(false)
  const [reactingMsgId, setReactingMsgId] = useState<string | null>(null)
  const textareaRef = useRef<HTMLTextAreaElement | null>(null)
  const emojiAnchorRef = useRef<HTMLDivElement | null>(null)

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
      .select('id, conversation_id, sender_id, body, created_at, read_at, reply_to_id')
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: false })
      .limit(200)

    if (error) {
      console.error('fetchMessages error:', error)
      return []
    }

    const list = ((data ?? []) as Msg[]).reverse()
    const s = new Set(seenIdsRef.current)
    for (const m of list) s.add(m.id)
    seenIdsRef.current = s

    setMessages(prev => mergeMessagesById(prev, list))
    return list
  }, [conversationId])

  /** Load older messages before the earliest currently loaded. Ready for future "load more" UI. */
  const fetchOlderMessages = useCallback(async () => {
    if (!hasOlderMessages) return
    const oldest = messagesRef.current[0]?.created_at
    if (!oldest) return

    const { data, error } = await supabase
      .from('messages')
      .select('id, conversation_id, sender_id, body, created_at, read_at, reply_to_id')
      .eq('conversation_id', conversationId)
      .lt('created_at', oldest)
      .order('created_at', { ascending: false })
      .limit(200)

    if (error) {
      console.error('fetchOlderMessages error:', error)
      return
    }

    const list = ((data ?? []) as Msg[]).reverse()
    if (list.length < 200) setHasOlderMessages(false)

    const s = new Set(seenIdsRef.current)
    for (const m of list) s.add(m.id)
    seenIdsRef.current = s

    setMessages(prev => mergeMessagesById(prev, list))
  }, [conversationId, hasOlderMessages])

  const doLoadReplyMeta = useCallback(async (ids: string[]) => {
    if (ids.length === 0) return
    const { data } = await supabase
      .from('messages')
      .select('id, body, sender_id')
      .in('id', ids)
    if (!data) return
    setReplyMeta(prev => {
      const next = new Map(prev)
      for (const row of data as { id: string; body: string; sender_id: string }[]) {
        next.set(row.id, {
          snippet: row.body.slice(0, 80) + (row.body.length > 80 ? '…' : ''),
          sender_id: row.sender_id,
        })
      }
      return next
    })
  }, [])

  const loadReactions = useCallback(async (msgs: Msg[], userId: string | null) => {
    const ids = msgs.map(m => m.id)
    if (ids.length === 0) return
    const { data } = await supabase
      .from('message_reactions')
      .select('message_id, sender_id, emoji')
      .in('message_id', ids)
    if (!data) return
    const map = new Map<string, LocalReaction[]>()
    for (const row of data as { message_id: string; sender_id: string; emoji: string }[]) {
      const list = map.get(row.message_id) ?? []
      const idx = list.findIndex(r => r.emoji === row.emoji)
      if (idx === -1) {
        list.push({ emoji: row.emoji, count: 1, mine: row.sender_id === userId })
      } else {
        list[idx] = { ...list[idx], count: list[idx].count + 1, mine: list[idx].mine || row.sender_id === userId }
      }
      map.set(row.message_id, list)
    }
    setReactions(map)
  }, [])

  const markReadNow = useCallback(async () => {
    const { data } = await supabase.auth.getUser()
    if (!data.user?.id) return
    await supabase.rpc('mark_conversation_read', { p_conversation_id: conversationId })
    await fetchMessages()
    // Notify sidebar/header to re-query unread counts
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('tyuta:thread-read'))
    }
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
    setHasOlderMessages(true)
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
      if (list.length < 200) setHasOlderMessages(false)

      // Load reply metadata and reactions for initial messages
      const replyIds = list.map(m => m.reply_to_id).filter((id): id is string => id != null)
      void doLoadReplyMeta(replyIds)
      void loadReactions(list, uid)

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

  // realtime: message_reactions — re-fetch on any change to keep counts in sync
  useEffect(() => {
    if (!myId) return
    const channel = supabase
      .channel(`reactions-${conversationId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'message_reactions' },
        () => { void loadReactions(messagesRef.current, myId) }
      )
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [conversationId, myId, loadReactions])

  const sendTyping = useCallback(async () => {
    if (!myId) return
    const now = Date.now()
    if (now - typingSentAtRef.current < 700) return
    typingSentAtRef.current = now

    await supabase.channel(`typing-${conversationId}`).send({ type: 'broadcast', event: 'typing', payload: { user_id: myId } })
  }, [conversationId, myId])

  // --- Patch 3 helpers ---

  function insertEmoji(emoji: string) {
    const el = textareaRef.current
    if (!el) { setText(prev => prev + emoji); return }
    const start = el.selectionStart ?? text.length
    const end = el.selectionEnd ?? text.length
    const next = text.slice(0, start) + emoji + text.slice(end)
    setText(next)
    const offset = emoji.length // UTF-16 units
    requestAnimationFrame(() => {
      if (!textareaRef.current) return
      textareaRef.current.selectionStart = start + offset
      textareaRef.current.selectionEnd = start + offset
      textareaRef.current.focus()
    })
  }

  const toggleReaction = useCallback(async (msgId: string, emoji: string) => {
    if (!myId) return
    // One reaction per user per message (FB/WA model): find the user's current reaction
    const currentList = reactions.get(msgId) ?? []
    const myCurrentReaction = currentList.find(r => r.mine)

    // Optimistic update
    setReactions(prev => {
      const next = new Map(prev)
      const list = [...(next.get(msgId) ?? [])]

      // Remove old reaction count if switching emojis
      if (myCurrentReaction) {
        const oldIdx = list.findIndex(r => r.emoji === myCurrentReaction.emoji)
        if (oldIdx !== -1) {
          const r = list[oldIdx]
          if (r.count <= 1) list.splice(oldIdx, 1)
          else list[oldIdx] = { ...r, count: r.count - 1, mine: false }
        }
      }

      // Add new reaction (unless toggling off the same emoji)
      if (!myCurrentReaction || myCurrentReaction.emoji !== emoji) {
        const newIdx = list.findIndex(r => r.emoji === emoji)
        if (newIdx === -1) {
          list.push({ emoji, count: 1, mine: true })
        } else {
          list[newIdx] = { ...list[newIdx], count: list[newIdx].count + 1, mine: true }
        }
      }

      next.set(msgId, list)
      return next
    })

    // Persist to DB
    if (myCurrentReaction && myCurrentReaction.emoji === emoji) {
      // Toggle off: remove reaction
      await supabase
        .from('message_reactions')
        .delete()
        .eq('message_id', msgId)
        .eq('sender_id', myId)
    } else {
      // Add or replace (upsert on UNIQUE(message_id, sender_id))
      await supabase
        .from('message_reactions')
        .upsert({ message_id: msgId, sender_id: myId, emoji }, { onConflict: 'message_id,sender_id' })
    }
  }, [myId, reactions])

  function handleReply(m: Msg, mine: boolean) {
    const authorName = mine ? 'אתה' : (other?.display_name ?? other?.username ?? 'צד שני')
    const snippet = m.body.slice(0, 80) + (m.body.length > 80 ? '…' : '')
    setReplyTo({ id: m.id, authorName, snippet, side: mine ? 'outgoing' : 'incoming' })
    textareaRef.current?.focus()
  }

  const handleQuoteClick = useCallback((quotedMsgId: string) => {
    const el = listRef.current?.querySelector(`[data-bubble-id="${quotedMsgId}"]`) as HTMLElement | null
    if (!el) return
    el.scrollIntoView({ behavior: 'smooth', block: 'center' })
    // Restart highlight animation on the bubble only
    el.removeAttribute('data-highlight')
    requestAnimationFrame(() => {
      el.setAttribute('data-highlight', 'true')
      setTimeout(() => el.removeAttribute('data-highlight'), 2500)
    })
  }, [])

  // Auto-fetch reply meta for any messages whose reply_to_id isn't in the map yet.
  // Runs when messages array or replyMeta map changes (e.g. after a realtime INSERT).
  useEffect(() => {
    const missingIds = [...new Set(
      messages
        .map(m => m.reply_to_id)
        .filter((id): id is string => id != null && !replyMeta.has(id))
    )]
    if (missingIds.length === 0) return
    void doLoadReplyMeta(missingIds)
  }, [messages, replyMeta, doLoadReplyMeta])

  // Close emoji picker on outside click / Escape
  useEffect(() => {
    if (!emojiPickerOpen) return
    function onDown(e: MouseEvent) {
      if (emojiAnchorRef.current?.contains(e.target as Node)) return
      setEmojiPickerOpen(false)
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setEmojiPickerOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [emojiPickerOpen])

  // Close reaction picker on outside click / Escape.
  // Uses a ref so clicks INSIDE the popover can stopPropagation before the doc handler fires.
  const reactionPopoverRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!reactingMsgId) return
    function onDown(e: MouseEvent) {
      if (reactionPopoverRef.current?.contains(e.target as Node)) return
      setReactingMsgId(null)
    }
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') setReactingMsgId(null) }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [reactingMsgId])

  async function send() {
    const bodyTrimmed = text.trim()
    if (!bodyTrimmed || sendingRef.current) return
    sendingRef.current = true

    // Capture and optimistically clear reply state
    const capturedReply = replyTo
    setReplyTo(null)

    const { data } = await supabase.auth.getUser()
    const uid = data.user?.id
    if (!uid) {
      sendingRef.current = false
      toast('כדי לשלוח הודעה צריך להתחבר', 'info')
      router.push('/auth/login')
      return
    }

    // Soft-suspend enforcement: allow messaging only to "System" while suspended.
    // DB/RLS should also enforce this, but this prevents confusing UX.
    try {
      const { data: mod, error: modErr } = await supabase
        .from('user_moderation')
        .select('is_suspended, is_banned')
        .eq('user_id', uid)
        .maybeSingle()

      if (!modErr && mod?.is_banned === true && !isSystem) {
        sendingRef.current = false
        toast('החשבון שלך הורחק לצמיתות. אפשר לפנות למערכת האתר.', 'error')
        router.replace(`/banned?from=${encodeURIComponent(`/inbox/${conversationId}`)}`)
        return
      }

      if (!modErr && mod?.is_suspended === true && !isSystem) {
        sendingRef.current = false
        toast('החשבון שלך הוגבל. אפשר לפנות למערכת האתר דרך האינבוקס.', 'error')
        router.replace(`/restricted?from=${encodeURIComponent(`/inbox/${conversationId}`)}`)
        return
      }
    } catch {
      // ignore
    }

    setSending(true)
    try {
      const safeBody = softWrapEveryN(bodyTrimmed, 55)

      const { data: messageId, error } = await supabase.rpc('send_message', {
        p_conversation_id: conversationId,
        p_body: safeBody,
        p_reply_to_id: capturedReply?.id ?? null,
      })

      if (error || !messageId) {
        const friendly = mapSupabaseError(error ?? null)
          ?? mapModerationRpcError(error?.message ?? '')
        toast(friendly ?? `לא הצלחתי לשלוח הודעה.\n${error?.message ?? 'נסי שוב.'}`, 'error')
        if (!friendly) console.error('send_message error:', error)
        // Restore reply state so user can retry with the same quote
        if (capturedReply) setReplyTo(capturedReply)
        return
      }

      setText('')
      await fetchMessages()
      setTimeout(() => scrollListToBottom('auto'), 0)
      // Notify sidebar/header (thread may be new or have new unread)
      window.dispatchEvent(new CustomEvent('tyuta:thread-read'))
    } finally {
      setSending(false)
      sendingRef.current = false
    }
  }

  const supportCid = useMemo(() => getSupportConversationId(), [])
  const systemId = useMemo(() => getSystemUserId(), [])

  const identity = other?.id
    ? resolveUserIdentity({
        userId: other.id,
        displayName: other.display_name,
        username: other.username,
        avatarUrl: other.avatar_url,
      })
    : supportCid && supportCid === conversationId && systemId
      ? resolveUserIdentity({ userId: systemId })
      : { displayName: 'שיחה', avatarUrl: null, isSystem: false }

  const isSystem = identity.isSystem
  const otherDisplay = identity.displayName
  const headerSubText = isOtherTyping ? 'מקליד/ה…' : ''

  // divider shown if unread exists AND we decided it should be visible
  const showUnreadDivider = unreadNow > 0 && unreadUiVisible

  // arrow badge: use unreadNow (אמת של read_at==null)
  const arrowBadgeCount = clampBadge(unreadNow)

  return (
    <div
      className="flex min-h-0 flex-col overflow-hidden rounded-3xl border bg-white text-black shadow-sm h-full dark:bg-[#141414] dark:text-white dark:border-white/10"
      dir="rtl"
    >
      {/* Header */}
      <div className="flex items-center justify-between border-b border-black/5 bg-white/70 px-4 py-3 backdrop-blur dark:border-white/10 dark:bg-[#141414]/90">
        {/* Right side: back arrow (mobile) + avatar + name */}
        <div className="flex items-center gap-3 min-w-0">
          <div className="absolute inset-y-2 right-0 w-1 rounded-l-full bg-[#D64545]/70" aria-hidden="true" />
          {/* Back arrow — mobile only, RTL (points right = back) */}
          <button
            type="button"
            onClick={() => router.push('/inbox')}
            aria-label="חזרה להודעות"
            className="md:hidden shrink-0 flex h-11 w-11 items-center justify-center rounded-full -mr-1 hover:bg-black/5 dark:hover:bg-white/10 transition"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M9 18l6-6-6-6" />
            </svg>
          </button>
          <Avatar src={identity.avatarUrl} name={otherDisplay} size={40} shape="square" />

          <div className="min-w-0">
            {!isSystem && other?.username ? (
              <Link href={`/u/${other.username}`} className="truncate text-sm font-black hover:underline">
                {otherDisplay}
              </Link>
            ) : (
              <div className="truncate text-sm font-black">{otherDisplay}</div>
            )}
            <div className="text-xs text-muted-foreground">{headerSubText}</div>
          </div>
        </div>

        {/* Left side: report */}
        {canReport && (
          <button
            type="button"
            onClick={() => {
              setReportErr(null)
              setReportOk(null)
              setReportedMessage(null)
              setReportOpen(true)
            }}
            className="shrink-0 cursor-pointer rounded-full border px-3 py-1 text-xs font-bold hover:bg-black/5 dark:border-border dark:bg-card dark:text-foreground dark:hover:bg-muted"
          >
            דווח/י
          </button>
        )}
      </div>



      {/* Wrapper relative for overlay */}
      <div className="relative flex min-h-0 flex-1 flex-col">
        {/* Report modal */}
        {reportOpen && (
          <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/30 p-4">
            <div className="w-full max-w-lg rounded-3xl border bg-white p-5 shadow-xl dark:bg-[#1e1e1e] dark:border-white/10 dark:text-foreground">
              <div className="flex items-start gap-3">
                <div className="min-w-0">
                  <div className="text-sm font-black">דיווח על התנהגות פוגענית</div>
                  <div className="mt-1 text-xs text-neutral-600 dark:text-muted-foreground">
                    הדיווח יישלח לצוות האתר. אם יש סכנה מיידית — פנה/י לגורמי חירום.
                  </div>
                  {reportedMessage && (
                    <div className="mt-3 rounded-2xl border bg-black/5 p-3 text-xs text-neutral-700 dark:bg-white/10 dark:border-white/10 dark:text-foreground">
                      <div className="font-bold">דיווח על הודעה ספציפית</div>
                      <div className="mt-1 whitespace-pre-wrap">{String(reportedMessage.body).slice(0, 280)}{reportedMessage.body.length > 280 ? '…' : ''}</div>
                      <div className="mt-1 text-[11px] text-neutral-500 dark:text-muted-foreground">{formatTime(reportedMessage.created_at)}</div>
                    </div>
                  )}
                </div>
                <button
                  type="button"
                  className="mr-auto rounded-full border px-3 py-1 text-xs font-bold hover:bg-black/5 dark:border-white/10 dark:hover:bg-white/10 dark:text-foreground"
                  onClick={() => { setReportOpen(false); setReportedMessage(null) }}
                >
                  סגור
                </button>
              </div>

              {!canReport ? (
                <div className="mt-4 rounded-2xl border bg-black/5 p-3 text-sm dark:bg-white/10 dark:border-white/10 dark:text-foreground">
                  לא ניתן לדווח על עצמך.
                </div>
              ) : (
                <div className="mt-4 space-y-3">
                  <label className="block">
                    <div className="mb-1 text-xs font-bold text-neutral-700 dark:text-foreground">סוג דיווח</div>
                    <select
                      value={reportCategory}
                      onChange={(e) => setReportCategory(e.target.value as typeof reportCategory)}
                      className="w-full rounded-2xl border bg-white px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-black/10 dark:bg-[#2a2a2a] dark:border-white/10 dark:text-foreground dark:focus:ring-white/10"
                    >
                      <option value="harassment">הטרדה / אלימות מילולית</option>
                      <option value="spam">ספאם</option>
                      <option value="self-harm">חשש לפגיעה עצמית</option>
                      <option value="other">אחר</option>
                    </select>
                  </label>

                  <label className="block">
                    <div className="mb-1 text-xs font-bold text-neutral-700 dark:text-foreground">פרטים (אופציונלי)</div>
                    <textarea
                      value={reportDetails}
                      onChange={(e) => setReportDetails(e.target.value)}
                      rows={4}
                      maxLength={2000}
                      className="w-full resize-none rounded-2xl border bg-white px-4 py-3 text-sm leading-relaxed outline-none focus:ring-2 focus:ring-black/10 whitespace-pre-wrap dark:bg-[#2a2a2a] dark:border-white/10 dark:text-foreground dark:placeholder:text-muted-foreground dark:focus:ring-white/10"
                      placeholder="תיאור קצר שיעזור לנו לטפל…"
                    />
                    <div className="mt-1 text-xs text-neutral-500 dark:text-muted-foreground">{reportDetails.length}/2000</div>
                  </label>

                  {reportErr && (
                    <div className="rounded-2xl border border-red-200 bg-red-50 p-3 text-sm text-red-800 dark:border-red-800/40 dark:bg-red-950/30 dark:text-red-400">{reportErr}</div>
                  )}
                  {reportOk && (
                    <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800 dark:border-emerald-800/40 dark:bg-emerald-950/30 dark:text-emerald-400">
                      {reportOk}
                    </div>
                  )}

                  <div className="flex items-center justify-between gap-2">
                    <button
                      type="button"
                      className="rounded-full border px-4 py-2 text-sm font-bold hover:bg-black/5 dark:border-white/10 dark:hover:bg-white/10 dark:text-foreground"
                      onClick={() => setReportOpen(false)}
                    >
                      ביטול
                    </button>
                    <button
                      type="button"
                      disabled={reportSending}
                      onClick={submitReport}
                      className={[
                        "rounded-full px-5 py-2 text-sm font-black text-white",
                        reportSending ? "bg-black/30" : "bg-black hover:bg-black/90",
                      ].join(" ")}
                    >
                      {reportSending ? "שולח…" : "שלח/י דיווח"}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
        {/* Messages scroller */}
        <div
          ref={listRef}
          className="min-h-0 flex-1 overflow-y-auto bg-gradient-to-b from-[#F7F6F3] to-[#EEEAE2] px-4 py-6 pb-4 dark:from-[#141414] dark:to-[#1a1a1a]"
          onClick={() => setReactingMsgId(null)}
        >
          {!isAtTop && stickyDay && (
            <div className="pointer-events-none sticky top-2 z-10 flex justify-center">
              <div className="rounded-full border bg-white/85 px-3 py-1 text-xs font-semibold text-neutral-700 shadow-sm backdrop-blur dark:bg-[#2a2a2a]/90 dark:border-white/10 dark:text-muted-foreground">
                {stickyDay}
              </div>
            </div>
          )}

          {!loading && _groupedRender(
            grouped,
            messages,
            myId,
            firstUnreadIndex,
            showUnreadDivider ? unreadNow : 0,
            canReport,
            (m) => {
              setReportErr(null)
              setReportOk(null)
              setReportedMessage(m)
              setReportOpen(true)
            },
            {
              replyMeta,
              reactions,
              otherName: other?.display_name ?? other?.username ?? 'צד שני',
              onReply: handleReply,
              onReact: toggleReaction,
              reactingMsgId,
              setReactingMsgId,
              reactionPopoverRef,
              listRef,
              onQuoteClick: handleQuoteClick,
            }
          )}

          {loading && (
            <div className="mx-auto max-w-sm rounded-2xl border bg-white/80 p-4 text-center text-sm text-muted-foreground dark:bg-[#2a2a2a] dark:border-white/10">
              טוען הודעות
            </div>
          )}
        </div>

        {/* Scroll-to-bottom FAB — centered, circular */}
        {!isAtBottom && (
          <div className="pointer-events-none absolute bottom-4 inset-x-0 z-20 flex justify-center">
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
              className="pointer-events-auto relative cursor-pointer flex h-10 w-10 items-center justify-center rounded-full border border-black/10 bg-white shadow-lg backdrop-blur transition hover:scale-105 hover:shadow-xl active:scale-95 dark:border-white/10 dark:bg-card dark:text-foreground"
              title="קפוץ להודעה האחרונה"
              aria-label="גלול למטה"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
                <path
                  d="M7 10l5 5 5-5"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>

              {arrowBadgeCount > 0 && (
                <span className="absolute -top-1.5 -right-1.5 flex min-w-[1.25rem] items-center justify-center rounded-full bg-[#D64545] px-1 py-px text-[10px] font-bold leading-none text-white shadow">
                  {arrowBadgeCount >= 99 ? '99+' : arrowBadgeCount}
                </span>
              )}
            </button>
          </div>
        )}
      </div>

      {/* Composer */}
      <div
        className="border-t border-black/5 bg-white/80 p-3 backdrop-blur dark:border-white/10 dark:bg-[#141414]/90"
        style={{ paddingBottom: 'calc(0.75rem + env(safe-area-inset-bottom))' }}
      >
        {/* Reply preview bar */}
        {replyTo && (
          <div className="mb-2 flex items-center gap-2 rounded-2xl border border-[#3B6CE3]/30 bg-[#3B6CE3]/5 px-3 py-2 dark:border-[#3B6CE3]/40 dark:bg-[#3B6CE3]/10">
            <div className="h-8 w-0.5 shrink-0 rounded-full bg-[#3B6CE3]" />
            <div className="min-w-0 flex-1">
              <div className="text-xs font-bold text-[#3B6CE3]">{replyTo.authorName}</div>
              <div className="truncate text-xs text-muted-foreground">{replyTo.snippet}</div>
            </div>
            <button
              type="button"
              onClick={() => setReplyTo(null)}
              className="shrink-0 cursor-pointer rounded-full p-1 text-muted-foreground hover:bg-black/5 dark:hover:bg-white/10"
              aria-label="בטל תשובה"
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden>
                <path d="M18 6L6 18M6 6l12 12" />
              </svg>
            </button>
          </div>
        )}

        <div className="flex items-center gap-2">
          {/* Input wrapper — emoji anchor sits inside at physical-left edge */}
          <div className="relative flex-1">
            <textarea
              ref={textareaRef}
              value={text}
              onChange={e => {
                setText(e.target.value)
                void sendTyping()
              }}
              placeholder="כתוב הודעה…"
              rows={1}
              className="h-11 w-full resize-none rounded-full border border-black/10 bg-[#F7F6F3] py-2 pr-4 pl-10 text-sm outline-none transition focus:border-black/20 focus:bg-white dark:border-white/10 dark:bg-[#2a2a2a] dark:text-white dark:placeholder:text-muted-foreground dark:focus:border-white/20 dark:focus:bg-[#333]"
              disabled={sending}
              onKeyDown={e => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  void send()
                }
              }}
            />

            {/* Emoji button + picker — anchored inside input at far left */}
            <div ref={emojiAnchorRef} className="absolute left-1.5 top-1/2 -translate-y-1/2">
              <button
                type="button"
                onClick={() => setEmojiPickerOpen(v => !v)}
                title="אמוג׳י"
                className="flex h-7 w-7 cursor-pointer items-center justify-center rounded-full text-base leading-none transition hover:bg-black/8 dark:hover:bg-white/10"
                aria-label="אמוג׳י"
                aria-expanded={emojiPickerOpen}
              >
                😊
              </button>

              {emojiPickerOpen && (
                <div className="absolute bottom-9 left-0 z-40 w-64 rounded-2xl border bg-white p-2 shadow-xl dark:bg-card dark:border-border">
                  <div className="grid grid-cols-8 gap-0.5">
                    {EMOJI_PICKER_LIST.map(e => (
                      <button
                        key={e}
                        type="button"
                        onClick={() => { insertEmoji(e); setEmojiPickerOpen(false) }}
                        className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg text-xl transition hover:bg-black/5 dark:hover:bg-white/10"
                      >
                        {e}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>

          <button
            onClick={() => void send()}
            disabled={sending || !text.trim()}
            className={[
              'h-11 shrink-0 rounded-full px-6 text-sm font-bold min-w-[4.5rem] transition',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-1',
              sending || !text.trim()
                ? 'cursor-not-allowed bg-neutral-200 text-neutral-400 dark:bg-[#2a2a2a] dark:text-muted-foreground'
                : 'cursor-pointer bg-[#D64545] text-white shadow-sm hover:opacity-90 active:scale-95 focus-visible:ring-[#D64545]/50',
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

type GroupedRenderExtras = {
  replyMeta: Map<string, ReplyMeta>
  reactions: Map<string, LocalReaction[]>
  otherName: string
  onReply: (m: Msg, mine: boolean) => void
  onReact: (msgId: string, emoji: string) => void
  reactingMsgId: string | null
  setReactingMsgId: (id: string | null) => void
  reactionPopoverRef: React.MutableRefObject<HTMLDivElement | null>
  listRef: React.MutableRefObject<HTMLDivElement | null>
  onQuoteClick: (quotedMsgId: string) => void
}

function _groupedRender(
  grouped: Array<{ type: 'day'; label: string } | { type: 'msg'; msg: Msg }>,
  rawMessages: Msg[],
  myId: string | null,
  firstUnreadIndex: number,
  unreadCountForDivider: number,
  canReportMessage: boolean,
  onReportMessage: (m: Msg) => void,
  extras: GroupedRenderExtras
) {
  if (grouped.length === 0) {
    return (
      <div className="mx-auto max-w-sm rounded-2xl border bg-white/80 p-4 text-center text-sm text-muted-foreground dark:bg-[#2a2a2a] dark:border-white/10">
        אין עדיין הודעות. תגיד/י שלום 🙂
      </div>
    )
  }

  const indexById = new Map<string, number>()
  for (let i = 0; i < rawMessages.length; i++) indexById.set(rawMessages[i].id, i)

  // Shared action bar (reply + react icons) — rendered as absolute child inside bubble wrapper
  function ActionBar({ m, mine }: { m: Msg; mine: boolean }) {
    const isReacting = extras.reactingMsgId === m.id
    return (
      <div className="flex items-center gap-0.5 opacity-30 transition-opacity sm:opacity-0 sm:group-hover:opacity-100">
        <button
          type="button"
          title="השב"
          onClick={() => extras.onReply(m, mine)}
          className="flex h-7 w-7 cursor-pointer items-center justify-center rounded-full text-neutral-400 transition hover:bg-black/5 hover:text-neutral-600 dark:text-muted-foreground dark:hover:bg-white/10 dark:hover:text-foreground"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M9 17l-5-5 5-5" /><path d="M20 18v-2a4 4 0 0 0-4-4H4" />
          </svg>
        </button>
        <button
          type="button"
          title="הגב"
          onClick={(e) => { e.stopPropagation(); extras.setReactingMsgId(isReacting ? null : m.id) }}
          className="flex h-7 w-7 cursor-pointer items-center justify-center rounded-full text-neutral-400 transition hover:bg-black/5 dark:text-muted-foreground dark:hover:bg-white/10"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <circle cx="12" cy="12" r="10" />
            <path d="M8 14s1.5 2 4 2 4-2 4-2" />
            <line x1="9" y1="9" x2="9.01" y2="9" />
            <line x1="15" y1="9" x2="15.01" y2="9" />
          </svg>
        </button>
      </div>
    )
  }

  return (
    <div className="space-y-1.5">
      {grouped.map((item, idx) => {
        if (item.type === 'day') {
          return (
            <div key={`day-${idx}`} className="flex justify-center py-1" data-day-sep="1" data-day-label={item.label}>
              <span className="rounded-full border bg-white/80 px-3 py-1 text-xs font-semibold text-neutral-600 shadow-sm dark:bg-[#2a2a2a] dark:border-white/10 dark:text-muted-foreground">
                {item.label}
              </span>
            </div>
          )
        }

        const m = item.msg
        const mine = !!myId && m.sender_id === myId
        const status = mine ? (m.read_at ? 'נראה' : 'נמסר') : null
        const bubbleWrapClass = mine ? 'ml-auto' : 'mr-auto'
        const rowAlign = mine ? 'justify-end' : 'justify-start'
        const rawIndex = indexById.get(m.id) ?? -1
        const shouldInsertDivider = unreadCountForDivider > 0 && firstUnreadIndex >= 0 && rawIndex === firstUnreadIndex
        const quotedMeta = m.reply_to_id ? extras.replyMeta.get(m.reply_to_id) : null
        const msgReactions = extras.reactions.get(m.id) ?? []
        const isReacting = extras.reactingMsgId === m.id

        return (
          <div key={m.id} data-msg-id={m.id} className="space-y-1">
            {shouldInsertDivider && (
              <div className="flex items-center justify-center py-1">
                <div className="rounded-full border bg-white/90 px-4 py-1 text-xs font-black text-neutral-800 shadow-sm dark:bg-[#2a2a2a] dark:border-white/10 dark:text-foreground">
                  {unreadCountForDivider} הודעות שלא נקראו
                </div>
              </div>
            )}

            {/* Message row — `group` enables action-bar hover reveal */}
            <div className={`group flex ${rowAlign} items-end`}>

              {/* Bubble wrapper — relative so ActionBar + reaction picker can be absolute */}
              <div className={`relative max-w-[78%] ${bubbleWrapClass}`}>

                {/* ActionBar — absolutely positioned outside bubble bounds */}
                <div className={[
                  'absolute top-1/2 -translate-y-1/2 z-10 flex items-center gap-0.5',
                  mine ? 'right-full pr-1.5' : 'left-full pl-1.5',
                ].join(' ')}>
                  <ActionBar m={m} mine={mine} />
                </div>

                {/* Reaction picker popover */}
                {isReacting && (
                  <div
                    ref={extras.reactionPopoverRef}
                    className={[
                      'absolute bottom-full z-30 mb-1 flex gap-0.5 rounded-full border bg-white px-2 py-1.5 shadow-xl dark:bg-card dark:border-border',
                      mine ? 'right-0' : 'left-0',
                    ].join(' ')}
                  >
                    {REACTION_EMOJIS.map(e => (
                      <button
                        key={e}
                        type="button"
                        onClick={() => { extras.onReact(m.id, e); extras.setReactingMsgId(null) }}
                        className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-full text-xl transition hover:scale-125"
                      >
                        {e}
                      </button>
                    ))}
                  </div>
                )}

                {/* Bubble — contains quote block (if any) + body text */}
                <div
                  data-bubble-id={m.id}
                  className={[
                    'overflow-hidden shadow-sm',
                    mine
                      ? 'rounded-3xl rounded-bl-lg bg-[#1C1C1C] text-white dark:bg-[#3B6CE3]'
                      : 'rounded-3xl rounded-br-lg border border-black/5 bg-white/80 text-black dark:border-white/10 dark:bg-[#2a2a2a] dark:text-white',
                  ].join(' ')}
                >
                  {/* WhatsApp-style quote preview inside bubble */}
                  {quotedMeta && (
                    <button
                      type="button"
                      onClick={() => extras.onQuoteClick(m.reply_to_id!)}
                      className={[
                        'flex w-full cursor-pointer items-stretch gap-0 transition',
                        mine
                          ? 'border-b border-white/10 bg-white/10 hover:bg-white/[0.15]'
                          : 'border-b border-black/5 bg-black/5 hover:bg-black/10 dark:border-white/5 dark:bg-white/5 dark:hover:bg-white/10',
                      ].join(' ')}
                    >
                      {/* Accent bar (RTL: right side = inline-start) */}
                      <div className={['w-1 shrink-0 self-stretch', mine ? 'bg-white/50' : 'bg-[#3B6CE3]'].join(' ')} />
                      <div className="min-w-0 flex-1 px-3 py-1.5 text-right">
                        <div className={['truncate text-xs font-bold leading-snug', mine ? 'text-white/80' : 'text-[#3B6CE3]'].join(' ')}>
                          {quotedMeta.sender_id === myId ? 'אתה' : extras.otherName}
                        </div>
                        <div className="mt-0.5 line-clamp-2 text-[11px] leading-snug opacity-60">
                          {quotedMeta.snippet}
                        </div>
                      </div>
                    </button>
                  )}
                  {/* Message body */}
                  <div className="px-4 py-2 text-sm leading-relaxed whitespace-pre-wrap break-words">
                    {m.body}
                  </div>
                </div>

                {/* Reactions — WhatsApp/FB style: overlaps bubble bottom edge, sits above meta row */}
                {msgReactions.length > 0 && (
                  <div className={[
                    'relative z-10 -mt-2.5 mb-0.5 flex flex-wrap gap-0.5',
                    mine ? 'justify-end pr-2' : 'justify-start pl-2',
                  ].join(' ')}>
                    {msgReactions.map(r => (
                      <button
                        key={r.emoji}
                        type="button"
                        onClick={() => extras.onReact(m.id, r.emoji)}
                        className={[
                          'inline-flex cursor-pointer items-center gap-0.5 rounded-full border px-1.5 py-0.5 text-xs shadow-sm transition hover:scale-105',
                          r.mine
                            ? 'border-[#3B6CE3]/40 bg-[#3B6CE3]/10 dark:border-[#3B6CE3]/50 dark:bg-[#3B6CE3]/20'
                            : 'border-black/10 bg-white/90 dark:border-white/10 dark:bg-card',
                        ].join(' ')}
                      >
                        {r.emoji}
                        {r.count > 1 && (
                          <span className="text-[10px] font-bold text-neutral-600 dark:text-muted-foreground">{r.count}</span>
                        )}
                      </button>
                    ))}
                  </div>
                )}

                {/* Meta row: time · status · report */}
                <div className={['mt-1 flex items-center gap-2 text-[11px] text-neutral-500 dark:text-muted-foreground', mine ? 'justify-end' : 'justify-start'].join(' ')}>
                  <span>{formatTime(m.created_at)}</span>
                  {status && <span>· {status}</span>}
                  {!mine && canReportMessage && (
                    <button
                      type="button"
                      onClick={() => onReportMessage(m)}
                      className="cursor-pointer rounded-full border bg-white px-2 py-0.5 text-[11px] font-bold opacity-0 transition hover:bg-neutral-100 group-hover:opacity-100 dark:bg-card dark:border-border dark:text-foreground dark:hover:bg-muted"
                      title="דווח/י על הודעה זו"
                    >
                      דווח
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}
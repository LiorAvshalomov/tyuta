'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { usePathname, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '@/lib/supabaseClient'
import { event as gaEvent } from '@/lib/gtag'
import Avatar from '@/components/Avatar'

type AuthorMini = {
  username: string | null
  display_name: string | null
  avatar_url: string | null
}

type CommentRow = {
  id: string
  post_id: string
  author_id: string
  parent_comment_id: string | null
  content: string
  created_at: string
  updated_at: string | null
  author: AuthorMini | null
}

type Props = { postId: string; postSlug: string; postTitle: string }

type DeleteTarget = {
  id: string
  snippet: string
  authorName: string
}

type LikeSummaryRow = { comment_id: string; likes_count: number }

type RealtimePayload<T> = {
  eventType: 'INSERT' | 'UPDATE' | 'DELETE'
  new: Partial<T>
  old: Partial<T>
}

function formatHe(dt: string) {
  try {
    return new Date(dt).toLocaleString('he-IL')
  } catch {
    return dt
  }
}

function normalizeAuthor(input: unknown): AuthorMini | null {
  if (!input) return null
  if (Array.isArray(input)) return (input[0] as AuthorMini | undefined) ?? null
  return input as AuthorMini
}

// Some browsers/environments (and non-HTTPS origins) don't expose crypto.randomUUID.
// We only need a client-side temp id for optimistic UI.
function makeTempId() {
  const uuid =
    typeof globalThis !== 'undefined' &&
    'crypto' in globalThis &&
    (globalThis.crypto as Crypto | undefined)?.randomUUID
      ? (globalThis.crypto as Crypto).randomUUID()
      : `${Date.now()}-${Math.random().toString(16).slice(2)}`
  return `temp-${uuid}`
}


function clipOneLine(s: string, maxChars: number) {
  const oneLine = s.replace(/\s+/g, ' ').trim()
  if (oneLine.length <= maxChars) return oneLine
  return oneLine.slice(0, Math.max(0, maxChars - 1)).trimEnd() + '…'
}

export default function PostComments({ postId, postSlug, postTitle }: Props) {
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)

  const [userId, setUserId] = useState<string | null>(null)
  const [me, setMe] = useState<AuthorMini | null>(null)

  // Admins can moderate (e.g., delete other users' comments) via RPC.
  const [isAdmin, setIsAdmin] = useState(false)

  // Admin moderation UI (3-dots menu like /notes)
  const [openMenuId, setOpenMenuId] = useState<string | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget | null>(null)
  const [deleteReason, setDeleteReason] = useState('')
  const [deleting, setDeleting] = useState(false)

  const [text, setText] = useState('')
  const [items, setItems] = useState<CommentRow[]>([])
  const [err, setErr] = useState<string | null>(null)

  const searchParams = useSearchParams()
  const pathname = usePathname()

  // When arriving from a notification link, temporarily highlight the target comment(s).
  // - Single highlight: /post/[slug]?hl=<id>
  // - Group highlight uses sessionStorage + short token: /post/[slug]?n=<token>&hl=<first>
  //
  // IMPORTANT:
  // Comments can render asynchronously (load/realtime/hydration). If we clear highlight too early,
  // some targets won't be highlighted. We therefore:
  // - keep a pending set of ids
  // - activate highlight only when the DOM element exists
  // - remove each highlight 4s *after* activation (per-id timer)
  // - observe DOM changes for a short time to catch late renders
  const [highlightIds, setHighlightIds] = useState<Set<string>>(new Set())
  const listRef = useRef<HTMLDivElement | null>(null)
  const pendingHighlightRef = useRef<Set<string>>(new Set())
  const highlightTimersRef = useRef<Map<string, number>>(new Map())
  const observerRef = useRef<MutationObserver | null>(null)
  const stopObserverTimerRef = useRef<number | null>(null)
  const scrolledRef = useRef(false)
  const scrollTargetIdRef = useRef<string | null>(null)
  const tokenStorageKeyRef = useRef<string | null>(null)

  // collapsed replies (default: collapsed; auto-expand on deep-link)
  const [expandedParents, setExpandedParents] = useState<Set<string>>(new Set())

  const clearHighlightTimer = (key: string) => {
    const t = highlightTimersRef.current.get(key)
    if (t) window.clearTimeout(t)
    highlightTimersRef.current.delete(key)
  }

  const activateHighlight = (rawId: string) => {
    const key = `comment-${rawId}`

    setHighlightIds(prev => {
      if (prev.has(key)) return prev
      const next = new Set(prev)
      next.add(key)
      return next
    })

    clearHighlightTimer(key)
    const t = window.setTimeout(() => {
      setHighlightIds(prev => {
        const next = new Set(prev)
        next.delete(key)
        return next
      })
      highlightTimersRef.current.delete(key)
    }, 4000)
    highlightTimersRef.current.set(key, t)
  }

  const tryActivatePending = () => {
    if (typeof window === 'undefined') return
    const pending = pendingHighlightRef.current

    // Activate any ids whose element exists in the DOM.
    if (pending.size > 0) {
      Array.from(pending).forEach((rawId) => {
        const el = document.getElementById(`comment-${rawId}`)
        if (!el) return
        activateHighlight(rawId)
        pending.delete(rawId)
      })
    }

    // Scroll exactly once, to the hl target (the "first" comment chosen by NotificationsBell).
    // Runs independently of pending — highlight may already have activated but scroll still
    // needed (e.g. after auto-expand of a collapsed reply parent).
    if (!scrolledRef.current) {
      const targetId = scrollTargetIdRef.current
      if (targetId) {
        const targetEl = document.getElementById(`comment-${targetId}`)
        if (targetEl) {
          scrolledRef.current = true
          scrollTargetIdRef.current = null

          const header = document.querySelector('header') as HTMLElement | null
          const headerH = header?.offsetHeight ?? 56
          const extra = 12
          // Calculate absolute scroll position and use a single scrollTo call.
          // scrollIntoView + scrollBy with smooth behavior conflict on mobile browsers
          // (two concurrent smooth scrolls cancel each other → no visible scroll).
          setTimeout(() => {
            const rect = targetEl.getBoundingClientRect()
            const scrollTop = window.pageYOffset || document.documentElement.scrollTop
            const targetY = scrollTop + rect.top - headerH - extra
            const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
            const behavior: ScrollBehavior = prefersReduced ? 'auto' : 'smooth'
            window.scrollTo({ top: Math.max(0, targetY), behavior })
          }, 80)
        }
      }
    }
  }

  // Reactive deep-link params — effect re-runs when URL changes (same-page nav)
  const hlParam = searchParams?.get('hl') ?? ''
  const nParam = searchParams?.get('n') ?? ''
  const tParam = searchParams?.get('t') ?? ''


// Close admin menu on outside click / tap
useEffect(() => {
  if (!openMenuId) return
  const onDown = (e: MouseEvent | TouchEvent) => {
    const target = e.target as HTMLElement | null
    if (!target) return
    if (target.closest('[data-comment-menu]')) return
    setOpenMenuId(null)
  }
  document.addEventListener('mousedown', onDown)
  document.addEventListener('touchstart', onDown, { passive: true })
  return () => {
    document.removeEventListener('mousedown', onDown)
    document.removeEventListener('touchstart', onDown)
  }
}, [openMenuId])

  useEffect(() => {
    if (typeof window === 'undefined') return

    const timers = highlightTimersRef.current

    // Reset from prior navigation
    scrollTargetIdRef.current = null
    timers.forEach((t) => window.clearTimeout(t))
    timers.clear()
    setHighlightIds(new Set())

    const pending = new Set<string>()

    // Read params from actual URL (reliable across all environments / hydration states).
    // The React searchParams-derived deps (hlParam/nParam/tParam) only trigger re-runs.
    let currentN: string | null = null
    let currentHl: string | null = null
    try {
      const url = new URL(window.location.href)
      currentN = url.searchParams.get('n')
      currentHl = url.searchParams.get('hl')
    } catch { /* ignore */ }

    // 1) Multi-highlight via token
    try {
      const token = currentN
      if (token) {
        const keyPrimary = `tyuta:comment-highlight:${token}`
        const keyPendemic = `pendemic:comment-highlight:${token}`
        const keyLegacy = `notif:${token}`

        const rawPrimary = window.sessionStorage.getItem(keyPrimary)
        const rawPendemic = rawPrimary ? null : window.sessionStorage.getItem(keyPendemic)
        const rawLegacy = (rawPrimary || rawPendemic) ? null : window.sessionStorage.getItem(keyLegacy)
        const raw = rawPrimary ?? rawPendemic ?? rawLegacy

        if (raw) {
          // Remember which key we used so we can clean it up later (important for React strict mode).
          tokenStorageKeyRef.current = rawPrimary ? keyPrimary : rawPendemic ? keyPendemic : keyLegacy

          let list: unknown[] = []
          let ts = 0

          try {
  const parsed: unknown = JSON.parse(raw)
  if (Array.isArray(parsed)) {
    list = parsed
  } else if (parsed && typeof parsed === 'object') {
    const obj = parsed as Record<string, unknown>
    const ids = obj['ids']
    const tsVal = obj['ts']
    if (Array.isArray(ids)) list = ids
    if (typeof tsVal === 'number') ts = tsVal
  }
} catch {
            // If it's not JSON, ignore.
          }

          // best-effort TTL (10 minutes) so old tokens don't linger.
          if (list.length > 0 && (ts === 0 || Date.now() - ts < 10 * 60 * 1000)) {
            list.forEach((v) => {
              if (typeof v === 'string' && v.trim()) pending.add(v)
            })
          }
        }
      }
    } catch {
      // ignore
    }

    // 2) Single highlight via hl query param (preferred)
    if (currentHl) {
      const id = currentHl.trim()
      if (id) {
        pending.add(id)
        scrollTargetIdRef.current = id
      }
    }

    // 3) Fallback: hash #comment-<id> (legacy links)
    if (!scrollTargetIdRef.current) {
      const hash = window.location.hash
      if (hash && hash.startsWith('#comment-')) {
        const id = hash.replace('#comment-', '').trim()
        if (id) {
          pending.add(id)
          scrollTargetIdRef.current = id
        }
      }
    }

    if (pending.size === 0) return

    pendingHighlightRef.current = pending
    scrolledRef.current = false

    // Try immediately (in case the DOM is already ready)
    tryActivatePending()

    // Observe DOM changes for a short time to catch late renders
    if (listRef.current && pendingHighlightRef.current.size > 0) {
      observerRef.current?.disconnect()
      observerRef.current = new MutationObserver(() => {
        tryActivatePending()
      })
      observerRef.current.observe(listRef.current, { childList: true, subtree: true })

      if (stopObserverTimerRef.current) window.clearTimeout(stopObserverTimerRef.current)
      stopObserverTimerRef.current = window.setTimeout(() => {
        observerRef.current?.disconnect()
        observerRef.current = null
        stopObserverTimerRef.current = null
        pendingHighlightRef.current.clear()
        if (tokenStorageKeyRef.current) {
          window.sessionStorage.removeItem(tokenStorageKeyRef.current)
          tokenStorageKeyRef.current = null
        }
      }, 8000)
    }

    // Fallback: retry periodically in case MutationObserver misses a React-driven
    // DOM change (e.g. expand of collapsed replies via state update).
    const retryId = window.setInterval(() => {
      tryActivatePending()
      if (pendingHighlightRef.current.size === 0 && (scrolledRef.current || !scrollTargetIdRef.current)) {
        window.clearInterval(retryId)
      }
    }, 300)

    return () => {
      window.clearInterval(retryId)
      observerRef.current?.disconnect()
      observerRef.current = null
      if (stopObserverTimerRef.current) window.clearTimeout(stopObserverTimerRef.current)
      stopObserverTimerRef.current = null
      // IMPORTANT: do NOT remove the sessionStorage token in cleanup.
      // In Next.js/React Strict Mode (dev), effects mount/unmount twice.
      // Removing here would delete the token before the second mount can read it,
      // which breaks multi-highlight. Token cleanup is handled by the observer timeout.
      // clear any per-id timers
      timers.forEach((t) => window.clearTimeout(t))
      timers.clear()
      pendingHighlightRef.current.clear()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hlParam, nParam, tParam, pathname])

  // After comments are loaded, try again (covers async load without relying on MutationObserver only).
  useEffect(() => {
    tryActivatePending()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items.length])

  // Auto-expand parents of highlighted/pending-highlighted replies
  useEffect(() => {
    const idsToCheck = new Set<string>()
    highlightIds.forEach(key => idsToCheck.add(key.replace('comment-', '')))
    pendingHighlightRef.current.forEach(id => idsToCheck.add(id))
    if (idsToCheck.size === 0) return

    const parentsToExpand = new Set<string>()
    for (const id of idsToCheck) {
      const comment = items.find(c => c.id === id)
      if (comment?.parent_comment_id) parentsToExpand.add(comment.parent_comment_id)
    }

    if (parentsToExpand.size > 0) {
      setExpandedParents(prev => {
        let changed = false
        const next = new Set(prev)
        parentsToExpand.forEach(id => { if (!next.has(id)) { next.add(id); changed = true } })
        return changed ? next : prev
      })
    }
  }, [highlightIds, items])

// After parent expand, reply elements appear in the DOM → retry highlight + scroll.
  useEffect(() => {
    if (expandedParents.size === 0) return
    const id = requestAnimationFrame(() => tryActivatePending())
    return () => cancelAnimationFrame(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expandedParents])

// auto-hide errors (3s)
const errTimerRef = useRef<number | null>(null)
const setErrFor = (msg: string | null) => {
  setErr(msg)
  if (errTimerRef.current) {
    window.clearTimeout(errTimerRef.current)
    errTimerRef.current = null
  }
  if (msg) {
    errTimerRef.current = window.setTimeout(() => setErr(null), 3000)
  }
}

// report (same flow as ChatClient)
type ReportReasonCode = 'abusive_language' | 'spam_promo' | 'hate_incitement' | 'privacy_exposure' | 'other'
const [reportOpen, setReportOpen] = useState(false)
// UI reasons (keep the old 5 options) + persist into DB as reason_code
const [reportReason, setReportReason] = useState<ReportReasonCode>('abusive_language')
const [reportDetails, setReportDetails] = useState('')
const [reportSending, setReportSending] = useState(false)
const [reportOk, setReportOk] = useState<string | null>(null)
const [reportErr, setReportErr] = useState<string | null>(null)
const [reportedComment, setReportedComment] = useState<CommentRow | null>(null)

const canReportComment = !!userId && !!reportedComment?.author_id && reportedComment.author_id !== userId

async function submitReport() {
  if (!canReportComment || !userId || !reportedComment) return
  setReportOk(null)
  setReportErr(null)
  try {
    setReportSending(true)
    const reasonLabel = reportReason === 'abusive_language'
      ? 'שפה פוגענית / הקנטה'
      : reportReason === 'spam_promo'
        ? 'ספאם / פרסום'
        : reportReason === 'hate_incitement'
          ? 'שנאה / הסתה'
          : reportReason === 'privacy_exposure'
            ? 'חשיפת מידע אישי'
            : 'אחר'

    const category: 'harassment' | 'spam' | 'self-harm' | 'other' =
      reportReason === 'spam_promo' ? 'spam' : reportReason === 'other' || reportReason === 'privacy_exposure' ? 'other' : 'harassment'

    const details = [
      reportDetails.trim() || null,
      `reason_label: ${reasonLabel}`,
      `post: ${postSlug}`,
      `title: ${String(postTitle || '').slice(0, 120)}`,
    ]
      .filter(Boolean)
      .join('\n')

    const { error } = await supabase.from('user_reports').insert({
      reporter_id: userId,
      reported_user_id: reportedComment.author_id,
      conversation_id: null,
      category,
      reason_code: reportReason,
      details: details || null,
      message_id: reportedComment.id,
      message_created_at: reportedComment.created_at,
      message_excerpt: String(reportedComment.content).slice(0, 280),
    })

    if (error) throw error
    setReportOk('תודה על הדיווח ועל התרומה לקהילה 🙏\nנבדוק את זה בהקדם.')
    setReportDetails('')
    // נסגור את המודאל אוטומטית אחרי רגע (כדי שלא ייתקע על "לא ניתן לדווח על עצמך")
    window.setTimeout(() => {
      setReportOpen(false)
      setReportedComment(null)
      setReportErr(null)
      setReportOk(null)
    }, 2200)
  } catch (e: unknown) {
    setReportErr(e instanceof Error ? e.message : 'לא הצלחנו לשלוח דיווח')
  } finally {
    setReportSending(false)
  }
}


  // likes
  const [myLiked, setMyLiked] = useState<Set<string>>(new Set())
  const [likeCounts, setLikeCounts] = useState<Record<string, number>>({})

  // like tooltip
  const [likerNames, setLikerNames] = useState<Record<string, { names: string[]; total: number }>>({})
  const [tooltipId, setTooltipId] = useState<string | null>(null)
  const tooltipTimerRef = useRef<number | null>(null)

  // reply state (one level)
  const [replyToId, setReplyToId] = useState<string | null>(null)
  const [replyToName, setReplyToName] = useState<string | null>(null)

  // edit state
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editText, setEditText] = useState('')

  const canSend = useMemo(() => text.trim().length >= 2 && !sending, [text, sending])
  const canSaveEdit = useMemo(() => editText.trim().length >= 2 && !sending, [editText, sending])

  const { topLevel, repliesByParent } = useMemo(() => {
    const top: CommentRow[] = []
    const replies: Record<string, CommentRow[]> = {}

    for (const c of items) {
      if (c.parent_comment_id) {
        const key = c.parent_comment_id
        if (!replies[key]) replies[key] = []
        replies[key].push(c)
      } else {
        top.push(c)
      }
    }

    // top-level: newest first
    top.sort((a, b) => (a.created_at < b.created_at ? 1 : -1))
    // replies: oldest first
    Object.keys(replies).forEach((k) => replies[k].sort((a, b) => (a.created_at > b.created_at ? 1 : -1)))

    return { topLevel: top, repliesByParent: replies }
  }, [items])

  const refreshLikes = async (commentIds: string[], uid: string | null) => {
    if (commentIds.length === 0) {
      setLikeCounts({})
      setMyLiked(new Set())
      return
    }

    // counts
    const { data: countsData } = await supabase
      .from('comment_like_summary')
      .select('comment_id, likes_count')
      .in('comment_id', commentIds)

    const counts: Record<string, number> = {}
    ;(countsData as LikeSummaryRow[] | null | undefined)?.forEach((r) => {
      counts[r.comment_id] = Number(r.likes_count ?? 0)
    })
    setLikeCounts(counts)

    // my likes
    if (!uid) {
      setMyLiked(new Set())
      return
    }
    const { data: myData } = await supabase
      .from('comment_likes')
      .select('comment_id')
      .eq('user_id', uid)
      .in('comment_id', commentIds)

    const mine = new Set<string>()
    ;(myData as { comment_id: string }[] | null | undefined)?.forEach((r) => {
      if (r?.comment_id) mine.add(String(r.comment_id))
    })
    setMyLiked(mine)
  }

  const load = async () => {
    setErrFor(null)
    setLoading(true)

    const { data: auth } = await supabase.auth.getUser()
    const u = auth.user
    setUserId(u?.id ?? null)

    // admin check (used for moderator actions like deleting comments)
    if (u?.id) {
      const { data: adminRow } = await supabase
        .from('admins')
        .select('user_id')
        .eq('user_id', u.id)
        .maybeSingle()
      setIsAdmin(!!adminRow)
    } else {
      setIsAdmin(false)
    }

    // load my profile for optimistic author
    if (u?.id) {
      const { data: myProfile } = await supabase
        .from('profiles')
        .select('username, display_name, avatar_url')
        .eq('id', u.id)
        .single()

      setMe((myProfile as AuthorMini | null) ?? null)
    } else {
      setMe(null)
    }

    const { data, error } = await supabase
      .from('comments')
      .select(
        `
        id,
        post_id,
        author_id,
        parent_comment_id,
        content,
        created_at,
        updated_at,
        author:profiles!fk_comments_author_id_profiles (
          username,
          display_name,
          avatar_url
        )
      `
      )
      .eq('post_id', postId)
      .order('created_at', { ascending: true })
      .limit(150)

    if (error) {
      setErrFor(error.message)
      setLoading(false)
      return
    }

    const normalized: CommentRow[] = (data ?? []).map(r => {
      const rr = r as unknown as Omit<CommentRow, 'author'> & { author: unknown }
      return {
        id: rr.id,
        post_id: rr.post_id,
        author_id: rr.author_id,
        parent_comment_id: rr.parent_comment_id ?? null,
        content: rr.content,
        created_at: rr.created_at,
        updated_at: rr.updated_at ?? null,
        author: normalizeAuthor(rr.author),
      }
    })

    setItems(normalized)
    await refreshLikes(normalized.map((x) => x.id).filter(Boolean), u?.id ?? null)
    setLoading(false)
  }

  useEffect(() => {
    if (!postId) return
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [postId])

  // realtime
  useEffect(() => {
    if (!postId) return

    const ch = supabase
      .channel(`comments-${postId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'comments', filter: `post_id=eq.${postId}` },
        async payloadRaw => {
          const payload = payloadRaw as unknown as RealtimePayload<CommentRow>

          if (payload.eventType === 'INSERT') {
            const newId = payload.new?.id
            if (!newId) return

            const { data } = await supabase
              .from('comments')
              .select(
                `
                id, post_id, author_id, parent_comment_id, content, created_at, updated_at,
                author:profiles!fk_comments_author_id_profiles ( username, display_name, avatar_url )
              `
              )
              .eq('id', newId)
              .single()

            if (!data) return

            const d = data as unknown as Omit<CommentRow, 'author'> & { author: unknown }
            const row: CommentRow = {
              id: d.id,
              post_id: d.post_id,
              author_id: d.author_id,
              parent_comment_id: d.parent_comment_id ?? null,
              content: d.content,
              created_at: d.created_at,
              updated_at: d.updated_at ?? null,
              author: normalizeAuthor(d.author),
            }

            setItems(prev => {
              if (prev.some(x => x.id === row.id)) return prev
              return [row, ...prev]
            })
          }

          if (payload.eventType === 'DELETE') {
            const oldId = payload.old?.id
            if (!oldId) return
            setItems(prev => prev.filter(x => x.id !== oldId))
          }

          if (payload.eventType === 'UPDATE') {
            const upId = payload.new?.id
            if (!upId) return
            const newContent = payload.new?.content
            const updatedAt = (payload.new as Partial<CommentRow>)?.updated_at ?? null

            setItems(prev =>
              prev.map(x =>
                x.id === upId
                  ? { ...x, content: newContent ?? x.content, updated_at: updatedAt ?? x.updated_at }
                  : x
              )
            )
          }
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(ch)
    }
  }, [postId])

  const send = async () => {
    setErrFor(null)

    const value = text.trim()
    if (value.length < 2) {
      setErrFor('התגובה קצרה מדי')
      return
    }

    const { data: auth } = await supabase.auth.getUser()
    const u = auth.user
    if (!u) {
      setErrFor('צריך להתחבר כדי להגיב')
      return
    }

    setSending(true)

    const tempId = makeTempId()
    const optimistic: CommentRow = {
      id: tempId,
      post_id: postId,
      author_id: u.id,
      parent_comment_id: replyToId,
      content: value,
      created_at: new Date().toISOString(),
      updated_at: null,
      author: me ?? { username: null, display_name: 'אנונימי', avatar_url: null },
    }

    setItems(prev => [optimistic, ...prev])
    setLikeCounts(prev => ({ ...prev, [tempId]: 0 }))
    setText('')
    setReplyToId(null)
    setReplyToName(null)

    const { data: inserted, error } = await supabase
      .from('comments')
      .insert({
        post_id: postId,
        author_id: u.id,
        parent_comment_id: replyToId,
        content: value,
      })
      .select('id')
      .single()

    setSending(false)

    if (error) {
      setItems(prev => prev.filter(x => x.id !== tempId))
      setErrFor(error.message)
      return
    }

    gaEvent('comment_created', { post_id: postId })

    if (inserted?.id) {
      setItems(prev => prev.map(x => (x.id === tempId ? { ...x, id: inserted.id } : x)))
    }
  }

  const startReply = (c: CommentRow) => {
    setErrFor(null)
    setReplyToId(c.id)
    setReplyToName(c.author?.display_name ?? 'אנונימי')
    setText('')
    requestAnimationFrame(() => {
      const el = document.getElementById('comment-composer')
      if (!el) return
      const mobile = window.matchMedia('(max-width: 767px)').matches
      el.scrollIntoView({ behavior: mobile ? 'smooth' : 'auto', block: 'start' })
    })
  }

  const cancelReply = () => {
    setReplyToId(null)
    setReplyToName(null)
  }

  const toggleLike = async (commentId: string) => {
    setErrFor(null)
    if (!userId) {
      setErrFor('צריך להתחבר כדי לתת לייק')
      return
    }

    const already = myLiked.has(commentId)

    // optimistic
    const next = new Set(myLiked)
    if (already) next.delete(commentId)
    else next.add(commentId)
    setMyLiked(next)
    setLikeCounts(prev => {
      const cur = Number(prev[commentId] ?? 0)
      return { ...prev, [commentId]: Math.max(0, cur + (already ? -1 : 1)) }
    })

    if (already) {
      const { error } = await supabase
        .from('comment_likes')
        .delete()
        .eq('comment_id', commentId)
        .eq('user_id', userId)

      if (error) {
        // rollback
        const rb = new Set(next)
        rb.add(commentId)
        setMyLiked(rb)
        setLikeCounts(prev => ({ ...prev, [commentId]: Number(prev[commentId] ?? 0) + 1 }))
        setErrFor(error.message)
      }
      return
    }

    const { error } = await supabase.from('comment_likes').insert({
      comment_id: commentId,
      user_id: userId,
    })

    if (error) {
      // rollback
      const rb = new Set(next)
      rb.delete(commentId)
      setMyLiked(rb)
      setLikeCounts(prev => ({ ...prev, [commentId]: Math.max(0, Number(prev[commentId] ?? 0) - 1) }))
      setErrFor(error.message)
    }
    // notification is created by DB trigger
  }

  const fetchLikers = async (commentId: string) => {
    const currentCount = Number(likeCounts[commentId] ?? 0)
    if (currentCount === 0) return
    const cached = likerNames[commentId]
    if (cached && cached.total === currentCount) return

    const { data: likesData } = await supabase
      .from('comment_likes')
      .select('user_id')
      .eq('comment_id', commentId)
      .order('created_at', { ascending: false })
      .limit(6)

    if (!likesData || likesData.length === 0) return

    const userIds = (likesData as { user_id: string }[]).map(r => r.user_id)

    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, display_name, username')
      .in('id', userIds)

    const nameMap = new Map<string, string>()
    ;(profiles as { id: string; display_name: string | null; username: string | null }[] | null)?.forEach(p => {
      nameMap.set(p.id, p.display_name ?? p.username ?? 'משתמש')
    })

    const names = userIds.slice(0, 5).map(uid => nameMap.get(uid) ?? 'משתמש')
    setLikerNames(prev => ({ ...prev, [commentId]: { names, total: currentCount } }))
  }

  const showTooltip = (commentId: string) => {
    if (tooltipTimerRef.current) window.clearTimeout(tooltipTimerRef.current)
    fetchLikers(commentId)
    setTooltipId(commentId)
  }

  const hideTooltip = () => {
    tooltipTimerRef.current = window.setTimeout(() => setTooltipId(null), 300)
  }

  const startEdit = (c: CommentRow) => {
    setErrFor(null)
    setEditingId(c.id)
    setEditText(c.content)
  }

  const cancelEdit = () => {
    setEditingId(null)
    setEditText('')
  }

  const saveEdit = async (commentId: string) => {
    setErrFor(null)
    const value = editText.trim()
    if (value.length < 2) {
      setErrFor('התגובה קצרה מדי')
      return
    }

    setSending(true)

    // optimistic update
    setItems(prev => prev.map(x => (x.id === commentId ? { ...x, content: value } : x)))

    const { error } = await supabase
      .from('comments')
      .update({ content: value, updated_at: new Date().toISOString() })
      .eq('id', commentId)

    setSending(false)

    if (error) {
      setErrFor(error.message)
      await load()
      return
    }

    cancelEdit()
  }

  const remove = async (commentId: string) => {
    setErrFor(null)
    if (!confirm('למחוק את התגובה?')) return

    // optimistic remove
    const snapshot = items
    setItems(prev => prev.filter(x => x.id !== commentId))

    const { error } = await supabase.from('comments').delete().eq('id', commentId)

    if (error) {
      setErrFor(error.message)
      setItems(snapshot) // rollback
    }
  }

  const adminRemove = async (commentId: string, reason: string) => {
  setErrFor(null)
  if (!isAdmin) return

  const clean = reason.trim()
  if (clean.length < 3) {
    setErrFor('חובה לציין סיבה (לפחות 3 תווים)')
    return
  }

  const snapshot = items
  // optimistic remove
  setItems(prev => prev.filter(x => x.id !== commentId))

  const { error } = await supabase.rpc('admin_delete_comment', {
    p_comment_id: commentId,
    p_reason: clean,
  })

  if (error) {
    setErrFor(error.message)
    setItems(snapshot)
  }
}

  return (

<>
  <style>{`
    @keyframes tyutaGlow {
      0%  { transform: scale(1);     box-shadow: 0 0 0 0     rgba(251,191,36,0.35); }
      35% { transform: scale(1.005); box-shadow: 0 0 24px -2px rgba(251,191,36,0.28); }
      100%{ transform: scale(1);     box-shadow: 0 0 12px -3px rgba(251,191,36,0.10); }
    }
  `}</style>
  {/* Report modal */}
  {reportOpen && (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4"
      dir="rtl"
      onMouseDown={(e) => {
        // סגירה בלחיצה מחוץ לתיבה
        if (e.target === e.currentTarget) {
          setReportOpen(false)
          setReportedComment(null)
          setReportErr(null)
          setReportOk(null)
        }
      }}
    >
      <div className="w-full max-w-lg rounded-3xl border bg-white p-5 shadow-xl">
        <div className="flex items-start gap-3">
          <div className="min-w-0">
            <div className="text-sm font-black">דיווח על תגובה בפוסט</div>
            <div className="mt-1 text-xs text-neutral-600">
              הדיווח יישלח לצוות האתר. אנחנו מתייחסים לדיווחים ברצינות ומטפלים בהם בהקדם.
            </div>

            {reportedComment && (
              <div className="mt-3 rounded-2xl border bg-black/5 p-3 text-xs text-neutral-700">
                <div className="font-bold">תגובה שדווחה</div>
                <div className="mt-1 whitespace-pre-wrap">
                  {String(reportedComment.content).slice(0, 280)}
                  {String(reportedComment.content).length > 280 ? '…' : ''}
                </div>
                <div className="mt-1 text-[11px] text-neutral-500">{formatHe(reportedComment.created_at)}</div>
              </div>
            )}
          </div>

          <button
            type="button"
            className="mr-auto rounded-full border px-3 py-1 text-xs font-bold hover:bg-black/5"
            onClick={() => {
              setReportOpen(false)
              setReportedComment(null)
              setReportErr(null)
              setReportOk(null)
            }}
          >
            סגור
          </button>
        </div>

        {!canReportComment ? (
          <div className="mt-4 rounded-2xl border bg-black/5 p-3 text-sm">לא ניתן לדווח על עצמך.</div>
        ) : (
          <div className="mt-4 space-y-3">
            <label className="block">
              <div className="mb-1 text-xs font-bold text-neutral-700">סוג דיווח</div>
              <select
                value={reportReason}
                onChange={(e) => setReportReason(e.target.value as typeof reportReason)}
                className="w-full rounded-2xl border bg-white px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-black/10"
              >
                <option value="abusive_language">שפה פוגענית / הקנטה</option>
                <option value="spam_promo">ספאם / פרסום</option>
                <option value="hate_incitement">שנאה / הסתה</option>
                <option value="privacy_exposure">חשיפת מידע אישי</option>
                <option value="other">אחר</option>
              </select>
            </label>

            <label className="block">
              <div className="mb-1 text-xs font-bold text-neutral-700">פרטים (אופציונלי)</div>
              <textarea
                value={reportDetails}
                onChange={(e) => setReportDetails(e.target.value)}
                rows={4}
                maxLength={2000}
                className="w-full resize-none rounded-2xl border bg-white px-4 py-3 text-sm leading-relaxed outline-none focus:ring-2 focus:ring-black/10 whitespace-pre-wrap"
                placeholder="תיאור קצר שיעזור לנו לטפל…"
              />
              <div className="mt-1 text-xs text-neutral-500">{reportDetails.length}/2000</div>
            </label>

            {reportErr && (
              <div className="rounded-2xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">{reportErr}</div>
            )}
            {reportOk && (
              <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">{reportOk}</div>
            )}

            <div className="flex items-center justify-between gap-2">
              <button
                type="button"
                className="rounded-full border px-4 py-2 text-sm font-bold hover:bg-black/5"
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

    <section className="mt-6 rounded-2xl border bg-white p-4" dir="rtl">
      <div className="flex items-center justify-between gap-3">
        <h3 className="m-0 text-sm font-bold">תגובות</h3>
        <div className="text-xs text-muted-foreground">{items.length} תגובות</div>
      </div>

      {/* Composer */}
      <div id="comment-composer" className="mt-3 rounded-2xl border bg-neutral-50 p-3 scroll-mt-24">
        {replyToId ? (
          <div className="mb-2 flex items-center justify-between gap-3 rounded-xl border bg-white px-3 py-2">
            <div className="text-xs text-neutral-700">
              משיב/ה ל־<span className="font-bold">{replyToName ?? 'אנונימי'}</span>
            </div>
            <button
              type="button"
              onClick={cancelReply}
              className="text-xs font-semibold text-neutral-600 hover:underline"
              disabled={sending}
            >
              ביטול
            </button>
          </div>
        ) : null}

        <textarea
          className="w-full resize-none rounded-xl border bg-white px-3 py-2 text-sm leading-6 outline-none focus:ring-2 focus:ring-black/10"
          rows={3}
          maxLength={700}
          placeholder={userId ? (replyToId ? 'כתוב תגובת תשובה…' : 'כתוב תגובה…') : 'התחבר כדי להגיב…'}
          value={text}
          onChange={e => setText(e.target.value)}
          disabled={!userId || sending}
        />

        <div className="mt-2 flex items-center justify-between">
          <div className="text-xs text-muted-foreground">מינימום 2 תווים</div>

          <button
            type="button"
            onClick={send}
            disabled={!userId || !canSend}
            className="rounded-xl bg-black px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
          >
            {sending ? 'שולח…' : 'שלח'}
          </button>
        </div>

        {!userId ? (
          <div className="mt-2 text-xs text-muted-foreground">
            <Link className="font-semibold hover:underline" href="/auth/login">
              התחבר
            </Link>{' '}
            כדי להגיב.
          </div>
        ) : null}
      </div>

      {err ? (
        <div className="mt-3 rounded-xl border bg-red-50 p-3 text-sm text-red-700">{err}</div>
      ) : null}

      {/* List */}
      <div ref={listRef} className="mt-4 space-y-3">
        {loading ? (
          <div className="text-sm text-muted-foreground">טוען תגובות…</div>
        ) : items.length === 0 ? (
          <div className="text-sm text-muted-foreground">אין עדיין תגובות.</div>
        ) : (
          topLevel.map(c => {
            const a = c.author
            const name = a?.display_name ?? 'אנונימי'
            const username = a?.username ?? null
            const avatar = a?.avatar_url ?? null
            const isMine = !!userId && c.author_id === userId
            const isTemp = String(c.id).startsWith('temp-')
            const isEditing = editingId === c.id
            const liked = myLiked.has(c.id)
            const likes = Number(likeCounts[c.id] ?? 0)
            const replies = repliesByParent[c.id] ?? []

            const headerRow = (
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3">
                  <Avatar src={avatar} name={name} />
                  <div className="leading-tight">
                    <div className="text-sm font-semibold">
                      {username ? (
                        <Link className="hover:underline" href={`/u/${username}`}>
                          {name}
                        </Link>
                      ) : (
                        name
                      )}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {formatHe(c.created_at)}
                      {c.updated_at ? <span> · נערך</span> : null}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  {isTemp ? <div className="text-xs text-muted-foreground">שולח…</div> : null}

                  {isMine && !isTemp ? (
                    <>
                      <button
                        type="button"
                        onClick={() => startEdit(c)}
                        className="text-xs font-semibold text-neutral-600 hover:underline"
                      >
                        עריכה
                      </button>
                      <button
                        type="button"
                        onClick={() => remove(c.id)}
                        className="text-xs font-semibold text-red-600 hover:underline"
                      >
                        מחיקה
                      </button>
                    </>
                  ) : null}
{!isMine && !isTemp && userId ? (
  <button
    type="button"
    onClick={() => {
      setReportedComment(c)
      setReportOpen(true)
      setReportErr(null)
      setReportOk(null)
    }}
    className="text-xs font-semibold text-neutral-500 hover:underline"
  >
    דווח
  </button>
) : null}

                </div>
              </div>
            )

            const body = isEditing ? (
              <div className="mt-3 rounded-2xl border bg-neutral-50 p-3">
                <textarea
                  className="w-full resize-none rounded-xl border bg-white px-3 py-2 text-sm leading-6 outline-none focus:ring-2 focus:ring-black/10"
                  rows={3}
                  maxLength={700}
                  value={editText}
                  onChange={e => setEditText(e.target.value)}
                  disabled={sending}
                />
                <div className="mt-2 flex items-center justify-end gap-2">
                  <button
                    type="button"
                    onClick={cancelEdit}
                    className="rounded-xl border px-3 py-2 text-sm font-semibold hover:bg-white"
                    disabled={sending}
                  >
                    ביטול
                  </button>
                  <button
                    type="button"
                    onClick={() => saveEdit(c.id)}
                    disabled={!canSaveEdit}
                    className="rounded-xl bg-black px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"
                  >
                    שמירה
                  </button>
                </div>
              </div>
            ) : (
              <div className="mt-3 whitespace-pre-wrap text-sm leading-7 text-neutral-800 break-words [overflow-wrap:anywhere]">
                {c.content}
              </div>
            )

            return (
              <div
                key={c.id}
                id={`comment-${c.id}`}
                className={
                  `relative rounded-2xl border p-3 scroll-mt-24 transition-all duration-500 ease-out ` +
                  (highlightIds.has(`comment-${c.id}`) ? 'ring-1 ring-amber-200/50 bg-amber-50/50 shadow-[0_0_12px_-3px_rgba(251,191,36,0.10)] animate-[tyutaGlow_900ms_ease-out] motion-reduce:animate-none' : '')
                }
              >
{isAdmin && !isTemp && !isMine ? (
  <div className="absolute left-2 top-2" data-comment-menu>
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation()
        setOpenMenuId((prev) => (prev === c.id ? null : c.id))
      }}
      className="inline-flex h-8 w-8 items-center justify-center rounded-xl border border-black/10 bg-white text-neutral-700 shadow-sm hover:bg-neutral-50"
      aria-label="פעולות אדמין"
      title="פעולות אדמין"
    >
      ⋯
    </button>

    {openMenuId === c.id ? (
      <div className="absolute left-0 mt-2 w-40 overflow-hidden rounded-2xl border border-black/10 bg-white shadow-lg">
        <button
          type="button"
          className="w-full px-3 py-2 text-right text-sm font-semibold text-red-600 hover:bg-red-50"
          onClick={(e) => {
            e.stopPropagation()
            setOpenMenuId(null)
            setDeleteTarget({
              id: c.id,
              snippet: clipOneLine(c.content, 80),
              authorName: name,
            })
            setDeleteReason('')
          }}
        >
          מחק תגובה
        </button>
      </div>
    ) : null}
  </div>
) : null}

                {headerRow}

                {body}

                {/* פעולות (כמו פייסבוק – עדין, לא מוגזם) */}
                {!isEditing ? (
                  <div className="mt-3 flex items-center gap-4 text-xs">
                    <div className="relative inline-flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => toggleLike(c.id)}
                        className={`font-semibold hover:underline ${liked ? 'text-red-600' : 'text-neutral-600'}`}
                        disabled={isTemp || sending}
                      >
                        ❤ לייק
                      </button>
                      {likes > 0 && (
                        <span
                          className="cursor-pointer font-semibold text-neutral-500"
                          onMouseEnter={() => showTooltip(c.id)}
                          onMouseLeave={hideTooltip}
                          onClick={(e) => { e.stopPropagation(); fetchLikers(c.id); setTooltipId(prev => prev === c.id ? null : c.id) }}
                        >
                          ({likes})
                        </span>
                      )}
                      {tooltipId === c.id && likes > 0 && likerNames[c.id] && (
                        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 rounded-lg bg-neutral-900 px-3 py-2 text-[11px] text-white shadow-lg z-20 pointer-events-none flex flex-col space-y-0.5" dir="rtl">
                          {likerNames[c.id].names.map((name, i) => (
                            <span key={i}>{name}</span>
                          ))}
                          {likerNames[c.id].total > 5 && <span className="text-neutral-400 text-[10px]">ועוד {likerNames[c.id].total - 5}+</span>}
                        </div>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => startReply(c)}
                      className="font-semibold text-neutral-600 hover:underline"
                      disabled={isTemp || sending}
                    >
                      הגב
                    </button>
                  </div>
                ) : null}

                {/* Replies */}
                {replies.length ? (
                  expandedParents.has(c.id) ? (
                  <div id={`replies-${c.id}`} className="mt-4 scroll-mt-24">
                  <div className="space-y-2 border-r border-neutral-200 pr-4 mr-6">
                    {replies.map(r => {
                      const ra = r.author
                      const rName = ra?.display_name ?? 'אנונימי'
                      const rUsername = ra?.username ?? null
                      const rAvatar = ra?.avatar_url ?? null
                      const rMine = !!userId && r.author_id === userId
                      const rTemp = String(r.id).startsWith('temp-')
                      const rEditing = editingId === r.id
                      const rLiked = myLiked.has(r.id)
                      const rLikes = Number(likeCounts[r.id] ?? 0)

                      return (
                        <div
                          key={r.id}
                          id={`comment-${r.id}`}
                          className={
                            `relative rounded-2xl border bg-white p-3 scroll-mt-24 transition-all duration-500 ease-out ` +
                            (highlightIds.has(`comment-${r.id}`) ? 'ring-1 ring-amber-200/50 bg-amber-50/50 shadow-[0_0_12px_-3px_rgba(251,191,36,0.10)] animate-[tyutaGlow_900ms_ease-out] motion-reduce:animate-none' : '')
                          }
                        >
{isAdmin && !rTemp && !rMine ? (
  <div className="absolute left-2 top-2" data-comment-menu>
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation()
        setOpenMenuId((prev) => (prev === r.id ? null : r.id))
      }}
      className="inline-flex h-8 w-8 items-center justify-center rounded-xl border border-black/10 bg-white text-neutral-700 shadow-sm hover:bg-neutral-50"
      aria-label="פעולות אדמין"
      title="פעולות אדמין"
    >
      ⋯
    </button>

    {openMenuId === r.id ? (
      <div className="absolute left-0 mt-2 w-40 overflow-hidden rounded-2xl border border-black/10 bg-white shadow-lg">
        <button
          type="button"
          className="w-full px-3 py-2 text-right text-sm font-semibold text-red-600 hover:bg-red-50"
          onClick={(e) => {
            e.stopPropagation()
            setOpenMenuId(null)
            setDeleteTarget({
              id: r.id,
              snippet: clipOneLine(r.content, 80),
              authorName: rName,
            })
            setDeleteReason('')
          }}
        >
          מחק תגובה
        </button>
      </div>
    ) : null}
  </div>
) : null}

                          <div className="flex items-start justify-between gap-3">
                            <div className="flex items-center gap-3">
                              <Avatar src={rAvatar} name={rName} />
                              <div className="leading-tight">
                                <div className="text-sm font-semibold">
                                  {rUsername ? (
                                    <Link className="hover:underline" href={`/u/${rUsername}`}>
                                      {rName}
                                    </Link>
                                  ) : (
                                    rName
                                  )}
                                </div>
                                <div className="text-xs text-muted-foreground">{formatHe(r.created_at)}</div>
                              </div>
                            </div>

                            <div className="flex items-center gap-2">
                              {rTemp ? <div className="text-xs text-muted-foreground">שולח…</div> : null}

                              {rMine && !rTemp ? (
                                <>
                                  <button
                                    type="button"
                                    onClick={() => startEdit(r)}
                                    className="text-xs font-semibold text-neutral-600 hover:underline"
                                  >
                                    עריכה
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => remove(r.id)}
                                    className="text-xs font-semibold text-red-600 hover:underline"
                                  >
                                    מחיקה
                                  </button>
                                </>
                              ) : null}
{!rMine && !rTemp && userId ? (
                                <button
                                  type="button"
                                  onClick={() => {
                                    setReportedComment(r)
                                    setReportOpen(true)
                                    setReportErr(null)
                                    setReportOk(null)
                                  }}
                                  className="text-xs font-semibold text-neutral-500 hover:underline"
                                >
                                  דווח
                                </button>
                              ) : null}
                            </div>
                          </div>

                          {rEditing ? (
                            <div className="mt-3 rounded-2xl border bg-neutral-50 p-3">
                              <textarea
                                className="w-full resize-none rounded-xl border bg-white px-3 py-2 text-sm leading-6 outline-none focus:ring-2 focus:ring-black/10"
                                rows={3}
                                maxLength={700}
                                value={editText}
                                onChange={e => setEditText(e.target.value)}
                                disabled={sending}
                              />
                              <div className="mt-2 flex items-center justify-end gap-2">
                                <button
                                  type="button"
                                  onClick={cancelEdit}
                                  className="rounded-xl border px-3 py-2 text-sm font-semibold hover:bg-white"
                                  disabled={sending}
                                >
                                  ביטול
                                </button>
                                <button
                                  type="button"
                                  onClick={() => saveEdit(r.id)}
                                  disabled={!canSaveEdit}
                                  className="rounded-xl bg-black px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"
                                >
                                  שמירה
                                </button>
                              </div>
                            </div>
                          ) : (
                            <div className="mt-3 whitespace-pre-wrap text-sm leading-7 text-neutral-800 break-words [overflow-wrap:anywhere]">
                              {r.content}
                            </div>
                          )}

                          {!rEditing ? (
                            <div className="mt-3 flex items-center gap-4 text-xs">
                              <div className="relative inline-flex items-center gap-1">
                                <button
                                  type="button"
                                  onClick={() => toggleLike(r.id)}
                                  className={`font-semibold hover:underline ${rLiked ? 'text-red-600' : 'text-neutral-600'}`}
                                  disabled={rTemp || sending}
                                >
                                  ❤ לייק
                                </button>
                                {rLikes > 0 && (
                                  <span
                                    className="cursor-pointer font-semibold text-neutral-500"
                                    onMouseEnter={() => showTooltip(r.id)}
                                    onMouseLeave={hideTooltip}
                                    onClick={(e) => { e.stopPropagation(); fetchLikers(r.id); setTooltipId(prev => prev === r.id ? null : r.id) }}
                                  >
                                    ({rLikes})
                                  </span>
                                )}
                                {tooltipId === r.id && rLikes > 0 && likerNames[r.id] && (
                                  <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 rounded-lg bg-neutral-900 px-3 py-2 text-[11px] text-white shadow-lg z-20 pointer-events-none flex flex-col space-y-0.5" dir="rtl">
                                    {likerNames[r.id].names.map((name, i) => (
                                      <span key={i}>{name}</span>
                                    ))}
                                    {likerNames[r.id].total > 5 && <span className="text-neutral-400 text-[10px]">ועוד {likerNames[r.id].total - 5}+</span>}
                                  </div>
                                )}
                              </div>
                            </div>
                          ) : null}
                        </div>
                      )
                    })}
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setExpandedParents(prev => { const n = new Set(prev); n.delete(c.id); return n })
                      requestAnimationFrame(() => {
                        const el = document.getElementById(`comment-${c.id}`)
                        if (!el) return
                        const mobile = window.matchMedia('(max-width: 767px)').matches
                        el.scrollIntoView({ behavior: mobile ? 'smooth' : 'auto', block: 'start' })
                      })
                    }}
                    className="mt-2 mr-6 text-xs font-semibold text-neutral-500 hover:underline"
                  >
                    הסתר תגובות
                  </button>
                  </div>
                  ) : (
                  <button
                    type="button"
                    onClick={() => {
                      setExpandedParents(prev => new Set(prev).add(c.id))
                      if (window.matchMedia('(max-width: 767px)').matches) {
                        requestAnimationFrame(() => {
                          document.getElementById(`replies-${c.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
                        })
                      }
                    }}
                    className="mt-3 text-xs font-semibold text-blue-600 hover:underline"
                  >
                    {`הצג ${replies.length} ${replies.length === 1 ? 'תגובה' : 'תגובות'}`}
                  </button>
                  )
                ) : null}
              </div>
            )
          })
        )}
      </div>
    

{/* Admin delete modal */}
{deleteTarget ? (
  <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/30 p-4 sm:items-center" dir="rtl">
    <div className="w-full max-w-md rounded-2xl bg-white p-4 shadow-xl">
      <div className="text-base font-black">מחיקת תגובה</div>
      <div className="mt-1 text-sm text-muted-foreground">
        תגובה מאת {deleteTarget.authorName}: ״{deleteTarget.snippet}״
      </div>

      <textarea
        className="mt-3 w-full rounded-xl border border-black/10 bg-white p-3 text-sm outline-none focus:ring-2 focus:ring-black/20"
        rows={4}
        value={deleteReason}
        onChange={(e) => setDeleteReason(e.target.value)}
        placeholder="סיבה למחיקה…"
      />

      <div className="mt-4 flex gap-2">
        <button
          type="button"
          className="flex-1 rounded-xl border border-black/10 px-3 py-2 text-sm font-semibold"
          onClick={() => {
            setDeleteTarget(null)
            setDeleteReason('')
          }}
          disabled={deleting}
        >
          ביטול
        </button>

        <button
          type="button"
          className="flex-1 rounded-xl bg-black px-3 py-2 text-sm font-bold text-white disabled:opacity-50"
          disabled={deleting || deleteReason.trim().length < 3}
          onClick={async () => {
            if (!deleteTarget) return
            setDeleting(true)
            await adminRemove(deleteTarget.id, deleteReason)
            setDeleting(false)
            setDeleteTarget(null)
            setDeleteReason('')
          }}
        >
          {deleting ? 'מוחק…' : 'מחק'}
        </button>
      </div>
    </div>
  </div>
) : null}

</section>
    </>
  )
}

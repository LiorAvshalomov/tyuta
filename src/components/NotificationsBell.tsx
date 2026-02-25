"use client"

import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { createPortal } from "react-dom"
import { Bell, X } from "lucide-react"
import { supabase } from "@/lib/supabaseClient"
import Avatar from "@/components/Avatar"

type ProfileLite = {
  id: string
  username: string | null
  display_name: string | null
  avatar_url: string | null
}

type NotificationType =
  | "follow"
  | "reaction"
  | "comment"
  | "comment_like"
  | "system_message"
  | "post_deleted"
  | "new_post"

type NotifRowDb = {
  id: string
  user_id: string
  actor_id: string | null
  type: NotificationType | string
  entity_type?: string | null
  entity_id?: string | null
  payload: Record<string, unknown> | null
  is_read: boolean
  read_at: string | null
  created_at: string
  actor?: ProfileLite | null
}

type NotifNormalized = {
  id: string
  created_at: string
  type: NotificationType | string
  raw_type: string
  payload: Record<string, unknown>
  is_read: boolean
  read_at: string | null
  entity_type: string | null
  entity_id: string | null
  actor_display_name: string | null
  actor_username: string | null
  actor_avatar_url: string | null
}

type NotifGroup = {
  key: string
  type: NotificationType | string
  created_at: string
  rows: NotifNormalized[]
  actor_display_names: string[]
  actor_avatars: (string | null)[]
  any_unread: boolean
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === "object" && !Array.isArray(v)
}

function str(v: unknown): string | null {
  return typeof v === "string" ? v : null
}

function titleFromPayload(payload: Record<string, unknown>): string | null {
  const direct = str(payload.post_title) || str(payload.title)
  if (direct) return direct
  const post = payload.post
  if (isRecord(post)) return str(post.title) || null
  return null
}

function messageFromPayload(payload: Record<string, unknown>): string | null {
  return str(payload.message) || null
}

function reasonFromPayload(payload: Record<string, unknown>): string | null {
  return str(payload.reason) || null
}

function noteSnippetFromPayload(payload: Record<string, unknown>): string | null {
  const direct = str(payload.note_snippet) || str(payload.note_preview) || str(payload.note_body)
  if (direct) return direct
  const note = payload.note
  if (isRecord(note)) return str(note.snippet) || str(note.body) || null
  return null
}

function postSlugFromPayload(payload: Record<string, unknown>): string | null {
  return str(payload.post_slug) || str(payload.slug) || null
}


function isReplyToComment(payload: Record<string, unknown>): boolean {
  // We only treat it as a reply when we have an explicit signal (no guessing).
  const direct = payload.parent_comment_id ?? payload.reply_to_comment_id ?? payload.reply_to_id
  if (typeof direct === 'string' && direct.length > 0) return true
  const nested = payload.comment
  if (isRecord(nested)) {
    const pid = nested.parent_comment_id ?? nested.reply_to_comment_id
    return typeof pid === 'string' && pid.length > 0
  }
  return false
}

function actorNameFromPayload(payload: Record<string, unknown>): string | null {
  return (
    str(payload.actor_display_name) ||
    str(payload.actor_username) ||
    str(payload.from_user_name) ||
    str(payload.from_user_display_name) ||
    null
  )
}

function effectiveType(rawType: string, payload: Record<string, unknown>): string {
  // Some older rows store the real action under payload.action.
// We use it only when it maps to an existing UI type. Otherwise we keep the raw type.
const a = str(payload.action)
if (a === 'comment_like') return 'comment_like'
if (a === 'comment_reply') return 'comment'

  // Heuristic (safe): if the payload clearly refers to a comment thread, treat it as a comment notification.
  // This fixes legacy triggers that stored an unrelated `type` while still providing comment_id/parent_comment_id.
  const nestedComment = payload.comment
  const hasCommentSignals =
    typeof payload.comment_id === 'string' ||
    typeof payload.parent_comment_id === 'string' ||
    typeof payload['parentCommentId'] === 'string' ||
    typeof payload.reply_to_comment_id === 'string' ||
    typeof payload.reply_to_id === 'string' ||
    typeof payload['commentId'] === 'string' ||
    (isRecord(nestedComment) && (typeof nestedComment.id === 'string' || typeof nestedComment.parent_comment_id === 'string'))
  if (hasCommentSignals) return 'comment'

  return rawType
}

function normalizeRow(r: NotifRowDb): NotifNormalized {
  // Some legacy triggers store the data under payload.payload (nested json).
  // We flatten it shallowly so UI + navigation can rely on the same keys.
  const p0 = isRecord(r.payload) ? { ...r.payload } : {}
  const nested = p0['payload']
  const payload = isRecord(nested) ? { ...p0, ...nested } : p0
  const actor = r.actor ?? null

  const raw_type = String(r.type ?? '')
  const type = effectiveType(raw_type, payload)

  const actor_display_name =
    (actor?.display_name ?? "").trim() ||
    (actor?.username ?? "").trim() ||
    (actorNameFromPayload(payload) ?? "")

  return {
    id: r.id,
    created_at: r.created_at,
    raw_type,
    type,
    payload,
    is_read: r.is_read,
    read_at: r.read_at,
    entity_type: (r.entity_type ?? null) as string | null,
    entity_id: (r.entity_id ?? null) as string | null,
    actor_display_name: actor_display_name ? actor_display_name : null,
    actor_username: (actor?.username ?? "").trim() || null,
    actor_avatar_url: actor?.avatar_url ?? null,
  }
}

function groupKey(n: NotifNormalized): string {
  if (n.type === "system_message" || n.type === "post_deleted") return `${n.type}|${n.id}`

  // Comments: group by post (and by reply/non-reply) instead of per-comment,
  // so multiple commenters appear as a single grouped notification.
  if (n.type === 'comment') {
    const p = n.payload
    const action = str(p.action)
    const isReply = action === 'comment_reply' || typeof p.parent_comment_id === 'string' || typeof p['parentCommentId'] === 'string'
    const postId = str(p.post_id) || ''
    const slug = postSlugFromPayload(p) || ''
    const title = titleFromPayload(p) || ''
    // Separate buckets so replies don't merge with new top-level comments.
    const kind = isReply ? 'comment_reply' : 'comment'
    return [kind, postId, slug, title].join('|')
  }

  const p = n.payload
  const entityType = n.entity_type || str(p.entity_type) || ""

  const entityId = n.entity_id || str(p.entity_id) || str(p.post_id) || ""
  const slug = postSlugFromPayload(p) || ""
  const title = titleFromPayload(p) || ""
  return [n.type, entityType, entityId, slug, title].join("|")
}

function uniqueActorNames(names: string[]): string[] {
  const uniq: string[] = []
  for (const n of names) {
    const t = n.trim()
    if (!t) continue
    if (!uniq.includes(t)) uniq.push(t)
  }
  return uniq
}

function formatActorsHeb(names: string[]): string {
  const uniq = uniqueActorNames(names)
  if (uniq.length === 0) return "מישהו"
  if (uniq.length === 1) return uniq[0]!
  if (uniq.length === 2) return `${uniq[0]} ו${uniq[1]}`
  if (uniq.length === 3) return `${uniq[0]}, ${uniq[1]} ו${uniq[2]}`
  return `${uniq[0]} ועוד ${uniq.length - 1}`
}

function verbByCount(count: number, singular: string, plural: string): string {
  return count <= 1 ? singular : plural
}


function formatDateTime(iso: string): string {
  const d = new Date(iso)
  const pad = (x: number) => String(x).padStart(2, "0")
  return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()} · ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export default function NotificationsBell() {
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [unread, setUnread] = useState(0)
  const [groups, setGroups] = useState<NotifGroup[]>([])
  const wrapRef = useRef<HTMLDivElement | null>(null)
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  const getUid = useCallback(async () => {
    const { data } = await supabase.auth.getUser()
    return data.user?.id ?? null
  }, [])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const uid = await getUid()
      if (!uid) {
        setGroups([])
        setUnread(0)
        return
      }

      const { data, error } = await supabase
        .from("notifications")
        .select(
          `
          id, user_id, actor_id, type, entity_type, entity_id, payload, is_read, read_at, created_at,
          actor:profiles!notifications_actor_id_fkey (id, username, display_name, avatar_url)
        `
        )
        .eq("user_id", uid)
        .order("created_at", { ascending: false })
        .limit(200)

      if (error) throw error

      const rows = (data ?? []) as unknown as NotifRowDb[]

      // --- Enrich missing actor/post/comment data from payloads (legacy triggers)
      const profileIds = new Set<string>()
      const postIds = new Set<string>()
      const commentIds = new Set<string>()

      for (const r of rows) {
        if (r.actor_id) profileIds.add(String(r.actor_id))
        const p = isRecord(r.payload) ? r.payload : null
        if (p) {
          const fromId = str(p.from_user_id)
          if (fromId) profileIds.add(fromId)
          const authorId = str(p.author_id)
          if (authorId) profileIds.add(authorId)

          const postId = str(p.post_id)
          if (postId) postIds.add(postId)

          const nested = p['payload']
          const nestedComment = p['comment']
          const cId =
            str(p.comment_id) ||
            (isRecord(nested) ? str(nested['comment_id']) : null) ||
            (isRecord(nestedComment) ? str(nestedComment['id']) : null)
          if (cId) commentIds.add(cId)
        }
        const rawType = String(r.type ?? '')
        if ((r.entity_type === 'comment' || rawType === 'comment') && r.entity_id) commentIds.add(String(r.entity_id))
      }

      const profilesById = new Map<string, ProfileLite>()
      if (profileIds.size > 0) {
        const { data: ps } = await supabase
          .from('profiles')
          .select('id, username, display_name, avatar_url')
          .in('id', Array.from(profileIds))
          .limit(500)
        const list = (ps ?? []) as unknown as ProfileLite[]
        for (const pr of list) profilesById.set(pr.id, pr)
      }

      type PostLite = { id: string; slug: string; title: string | null }
      const postsById = new Map<string, PostLite>()
      if (postIds.size > 0) {
        const { data: posts } = await supabase
          .from('posts')
          .select('id, slug, title')
          .in('id', Array.from(postIds))
          .limit(500)
        const list = (posts ?? []) as unknown as PostLite[]
        for (const p of list) postsById.set(p.id, p)
      }

      type CommentLite = { id: string; content: string; parent_comment_id: string | null; post_id: string }
      const commentsById = new Map<string, CommentLite>()
      if (commentIds.size > 0) {
        const { data: cs } = await supabase
          .from('comments')
          .select('id, content, parent_comment_id, post_id')
          .in('id', Array.from(commentIds))
          .limit(500)
        const list = (cs ?? []) as unknown as CommentLite[]
        for (const c of list) commentsById.set(c.id, c)
      }

      const hydrated: NotifRowDb[] = rows.map((r) => {
        const p0 = isRecord(r.payload) ? { ...r.payload } : {}
        const fromId = str(p0.from_user_id)
        const fallbackActorId = fromId ?? (r.actor_id ? String(r.actor_id) : null)
        const actor = r.actor ?? (fallbackActorId ? profilesById.get(fallbackActorId) ?? null : null)

        // If this is a comment-like / reply flow, hydrate comment details
        const rawType = String(r.type ?? '')
        const commentId =
          (r.entity_type === 'comment' || rawType === 'comment')
            ? (r.entity_id ? String(r.entity_id) : str(p0.comment_id))
            : str(p0.comment_id)
        if (commentId && commentsById.has(commentId)) {
          const c = commentsById.get(commentId)!
          if (!('comment_id' in p0)) p0.comment_id = commentId
          if (!('comment_text' in p0)) p0.comment_text = c.content
          if (!('parent_comment_id' in p0)) p0.parent_comment_id = c.parent_comment_id
          if (!('post_id' in p0)) p0.post_id = c.post_id
        }

        const postId = str(p0.post_id)
        if (postId && postsById.has(postId)) {
          const post = postsById.get(postId)!
          if (!('post_slug' in p0)) p0.post_slug = post.slug
          if (!('post_title' in p0) && post.title) p0.post_title = post.title
        }

        return {
          ...r,
          actor,
          payload: p0,
        }
      })

      const norm = hydrated.map(normalizeRow)
      const unreadCount = norm.reduce((acc, n) => acc + (n.is_read || n.read_at ? 0 : 1), 0)
      setUnread(unreadCount)

      const map = new Map<string, NotifGroup>()
      for (const n of norm) {
        const key = groupKey(n)
        const g = map.get(key)
        const actorName = n.actor_display_name || actorNameFromPayload(n.payload) || ""

        if (!g) {
          map.set(key, {
            key,
            type: n.type,
            created_at: n.created_at,
            rows: [n],
            actor_display_names: actorName ? [actorName] : [],
            actor_avatars: [n.actor_avatar_url ?? null],
            any_unread: !(n.is_read || n.read_at),
          })
        } else {
          g.rows.push(n)
          if (g.created_at < n.created_at) g.created_at = n.created_at
          if (actorName) g.actor_display_names.push(actorName)
          g.actor_avatars.push(n.actor_avatar_url ?? null)
          if (!(n.is_read || n.read_at)) g.any_unread = true
        }
      }

      const arr = Array.from(map.values()).sort((a, b) => (a.created_at < b.created_at ? 1 : -1))
      setGroups(arr)
    } finally {
      setLoading(false)
    }
  }, [getUid])

  const markAllRead = useCallback(async () => {
    const uid = await getUid()
    if (!uid) return

    const now = new Date().toISOString()
    setUnread(0)
    setGroups(prev =>
      prev.map(g => ({
        ...g,
        any_unread: false,
        rows: g.rows.map(r => (r.is_read || r.read_at ? r : { ...r, is_read: true, read_at: now })),
      }))
    )

    await supabase.from("notifications").update({ is_read: true, read_at: now }).eq("user_id", uid).eq("is_read", false)
  }, [getUid])

  const markGroupRead = useCallback(
    async (ids: string[]) => {
      if (ids.length === 0) return
      const uid = await getUid()
      if (!uid) return

      const now = new Date().toISOString()
      setGroups(prev =>
        prev.map(g => {
          const has = g.rows.some(r => ids.includes(r.id))
          if (!has) return g
          return {
            ...g,
            any_unread: g.rows.some(r => !ids.includes(r.id) && !(r.is_read || r.read_at)),
            rows: g.rows.map(r => (ids.includes(r.id) ? { ...r, is_read: true, read_at: r.read_at ?? now } : r)),
          }
        })
      )
      setUnread(u => Math.max(0, u - ids.length))

      await supabase.from("notifications").update({ is_read: true, read_at: now }).eq("user_id", uid).in("id", ids)
    },
    [getUid]
  )

  const clearAll = useCallback(async () => {
    const uid = await getUid()
    if (!uid) return

    const { error } = await supabase.from("notifications").delete().eq("user_id", uid)
    if (!error) {
      setGroups([])
      setUnread(0)
    } else {
      alert(error.message)
    }
  }, [getUid])

  // close on click outside (desktop)
  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      // On mobile we use a full-screen panel; don't close it on random taps.
      // Close is handled via the X button or navigation.
      if (typeof window !== 'undefined' && window.matchMedia('(max-width: 1023px)').matches) return
      const el = wrapRef.current
      if (!el) return
      if (e.target instanceof Node && !el.contains(e.target)) setOpen(false)
    }
    document.addEventListener("mousedown", onDown)
    return () => document.removeEventListener("mousedown", onDown)
  }, [open])

  // Close when other header UI opens (hamburger / dropdowns) or on route changes.
  useEffect(() => {
    const onClose = () => setOpen(false)
    window.addEventListener('tyuta:close-notifications', onClose as EventListener)
    return () => window.removeEventListener('tyuta:close-notifications', onClose as EventListener)
  }, [])

  useEffect(() => {
    if (!open) return
    // Any navigation should close the panel.
    setOpen(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname, searchParams.toString()])

  // load once + realtime refresh
  useEffect(() => {
    void load()

    const ch = supabase
      .channel("notifications-bell")
      .on("postgres_changes", { event: "*", schema: "public", table: "notifications" }, () => void load())
      .subscribe()

    return () => {
      void supabase.removeChannel(ch)
    }
  }, [load])

  // opening panel = mark all read + drop badge immediately
  useEffect(() => {
    if (!open) return
    void markAllRead()
  }, [open, markAllRead])
  const items = useMemo(() => groups, [groups])

  const makeShortToken = useCallback(() => {
    const raw =
      typeof globalThis !== 'undefined' &&
      'crypto' in globalThis &&
      (globalThis.crypto as Crypto | undefined)?.randomUUID
        ? (globalThis.crypto as Crypto).randomUUID()
        : `${Date.now()}-${Math.random().toString(16).slice(2)}`
    // Keep it short and URL-safe.
    return raw.replace(/[^a-zA-Z0-9]/g, '').slice(0, 12)
  }, [])

  const storeHighlightToken = useCallback((commentIds: string[]) => {
    try {
      if (typeof window === 'undefined') return null
      if (commentIds.length <= 1) return null
      const token = makeShortToken()
      // sessionStorage only (requirement): short token in URL, full list stored here.
      window.sessionStorage.setItem(
        `tyuta:comment-highlight:${token}`,
        JSON.stringify({ ids: commentIds, ts: Date.now() })
      )
      return token
    } catch {
      return null
    }
  }, [makeShortToken])

  const navHrefForGroup = useCallback((g: NotifGroup): string | null => {
    if (g.type === "system_message" || g.type === "post_deleted") return null
    const first = g.rows[0]
    const payload = first?.payload ?? {}

    if (g.type === "follow") {
      const u = first?.actor_username || str(payload.username) || str(payload.actor_username)
      return u ? `/u/${u}` : null
    }

    const slug = postSlugFromPayload(payload)
    if (!slug) return null

    const commentId =
      str(payload.comment_id) ||
      (first?.entity_type === 'comment' ? (first.entity_id ?? '') : '') ||
      (first?.raw_type === 'comment' ? (first.entity_id ?? '') : '')
    const hl = commentId ? `?hl=${commentId}` : ''
    return `/post/${slug}${hl}`
  }, [])

  const navTargetForGroup = useCallback(
    (g: NotifGroup): string | null => {
      if (g.type === 'system_message' || g.type === 'post_deleted') return null
      const first = g.rows[0]
      const payload = first?.payload ?? {}

      if (g.type === 'follow') {
        const u = first?.actor_username || str(payload.username) || str(payload.actor_username)
        return u ? `/u/${u}` : null
      }

      const slug = postSlugFromPayload(payload)
      if (!slug) return null

      // Collect comment ids for highlight.
const entries: { id: string; created_at: string }[] = []
for (const r of g.rows) {
  const p = r.payload ?? {}
  const nested = p['payload']
  const nestedComment = p['comment']
  const cid =
    str(p['comment_id']) ||
    (isRecord(nested) ? str(nested['comment_id']) : null) ||
    (isRecord(nestedComment) ? str(nestedComment['id']) : null) ||
    (r.entity_type === 'comment' ? (r.entity_id ?? null) : null) ||
    (r.raw_type === 'comment' ? (r.entity_id ?? null) : null)

  if (!cid) continue
  // Keep the earliest timestamp per comment id (stable ordering for scroll target).
  const existing = entries.find(e => e.id === cid)
  if (!existing) entries.push({ id: cid, created_at: r.created_at })
  else if (existing.created_at > r.created_at) existing.created_at = r.created_at
}

const ids = entries
  .sort((a, b) => (a.created_at > b.created_at ? 1 : -1))
  .map(e => e.id)

const firstId = ids[0] ?? str(payload.comment_id) ?? null
const token = storeHighlightToken(ids)
      const params = new URLSearchParams()
      if (token) params.set('n', token)
      if (firstId) params.set('hl', firstId)
      const qs = params.toString()
      return `/post/${slug}${qs ? `?${qs}` : ''}`
    },
    [storeHighlightToken]
  )

  const renderContent = useCallback((g: NotifGroup) => {
  const first = g.rows[0]
  const payload = first?.payload ?? {}

  if (g.type === "system_message") {
    const action = str((payload as Record<string, unknown>).action)

    // ✅ note deleted (admin/system)
    if (action === "note_deleted") {
      const snippet = noteSnippetFromPayload(payload) ?? titleFromPayload(payload) ?? "פתק"
      const reason = reasonFromPayload(payload)
      return (
        <div className="text-right leading-snug">
          <div className="font-semibold truncate">מערכת האתר מחקה לך את הפתק ״{snippet}״</div>
          {reason ? <div className="text-neutral-600 dark:text-muted-foreground mt-0.5">סיבה: {reason}</div> : null}
        </div>
      )

    }

    // ✅ comment deleted (admin/system)
    if (action === "comment_deleted") {
      const snippet = str((payload as Record<string, unknown>).comment_snippet) || "תגובה"
      const reason = reasonFromPayload(payload)
      const title = titleFromPayload(payload)
      return (
        <div className="text-right leading-snug">
          <div className="font-semibold truncate">
            מערכת האתר מחקה לך תגובה{title ? ` בפוסט ״${title}״` : ""}: ״{snippet}״
          </div>
          {reason ? <div className="text-neutral-600 dark:text-muted-foreground mt-0.5">סיבה: {reason}</div> : null}
        </div>
      )
    }

    

    const t = titleFromPayload(payload) ?? ""
    const m = messageFromPayload(payload)
    return (
      <div className="text-right leading-snug">
        <div className="font-semibold">מערכת האתר ״{t || "הודעה"}״</div>
        {m ? <div className="text-neutral-600 dark:text-muted-foreground mt-0.5">{m}</div> : null}
      </div>
    )
  }

  if (g.type === "post_deleted") {
    const t = titleFromPayload(payload) ?? "פוסט"
    const reason = reasonFromPayload(payload)
    return (
      <div className="text-right leading-snug">
        <div className="font-semibold">הפוסט ״{t}״ נמחק ע&quot;י מערכת האתר</div>
        {reason ? <div className="text-neutral-600 dark:text-muted-foreground mt-0.5">סיבה: {reason}</div> : null}
      </div>
    )
  }

  const uniqActors = uniqueActorNames(g.actor_display_names)
  const who = formatActorsHeb(uniqActors)
  const count = uniqActors.length
  const title = titleFromPayload(payload)

  if (g.type === "follow") {
    return (
      <span>
        <span className="font-semibold">{who}</span>{" "}
        {verbByCount(count, "התחיל/ה", "התחילו")} לעקוב אחריך
      </span>
    )
  }

  if (g.type === "comment_like") {
    const verb = verbByCount(count, "עשה/תה", "עשו")
    const postTitle = title ?? "ללא כותרת"
    return (
      <div className="text-right leading-snug">
        <div>
          <span className="font-semibold">{who}</span> {verb} לייק לתגובה שלך בפוסט: ״{postTitle}״
        </div>
      </div>
    )
  }

  if (g.type === "comment") {
    const isReply = isReplyToComment(payload)
    const verb = verbByCount(count, "הגיב/ה", "הגיבו")
    const postTitle = title ?? "ללא כותרת"
    return (
      <div className="text-right leading-snug">
        <div>
          <span className="font-semibold">{who}</span>{" "}
          {isReply ? `${verb} על התגובה שלך בפוסט` : `${verb} בפוסט שלך`}: ״{postTitle}״
        </div>
      </div>
    )
  }

  if (g.type === "new_post") {
    return (
      <span>
        <span className="font-semibold">{who}</span>{" "}
        {verbByCount(count, "העלה/תה", "העלו")} פוסט חדש{title ? `: ״${title}״` : ""}
      </span>
    )
  }

  if (g.type === "reaction") {
    return (
      <span>
        <span className="font-semibold">{who}</span>{" "}
        {verbByCount(count, "דירג/ה", "דירגו")} את הפוסט שלך{title ? `: ״${title}״` : ""}
      </span>
    )
  }

  return (
    <span>
      <span className="font-semibold">{who}</span> שלח/ה עדכון{title ? `: ״${title}״` : ""}
    </span>
  )
}, [])


  const emptyState = <div className="py-10 text-center text-sm text-neutral-600 dark:text-muted-foreground">אין התראות</div>

  const renderPanel = (mode: 'desktop' | 'mobile') => {
    const isMobile = mode === 'mobile'

    return (
      <div
        className={
          "bg-white dark:bg-popover shadow-xl border border-neutral-200 dark:border-border overflow-hidden " +
          (isMobile ? "rounded-none h-[calc(100vh-56px)] flex flex-col" : "rounded-xl")
        }
      >
        <div className="sticky top-0 z-10 bg-gradient-to-b from-neutral-100 to-neutral-50 dark:from-card dark:to-card border-b border-neutral-200 dark:border-border px-4 py-3">
          {isMobile ? (
            <div className="flex items-center justify-between">
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="p-2 -ml-1 rounded-lg hover:bg-neutral-200 dark:hover:bg-muted transition-colors"
                aria-label="סגור"
                title="סגור"
              >
                <X size={18} className="text-neutral-700 dark:text-foreground" />
              </button>
              <h3 className="text-sm font-bold text-neutral-900 dark:text-foreground">התראות</h3>
              <button
                onClick={() => void clearAll()}
                className="text-xs font-semibold text-neutral-600 dark:text-muted-foreground hover:text-neutral-900 dark:hover:text-foreground hover:bg-neutral-200 dark:hover:bg-muted px-2 py-1 rounded-lg transition-colors"
              >
                נקה הכל
              </button>
            </div>
          ) : (
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-neutral-900 dark:text-foreground">התראות</h3>
              <button
                onClick={() => void clearAll()}
                className="text-xs font-semibold text-neutral-600 dark:text-muted-foreground hover:text-neutral-900 dark:hover:text-foreground hover:bg-neutral-200 dark:hover:bg-muted px-2 py-1 rounded-lg transition-colors"
              >
                נקה הכל
              </button>
            </div>
          )}
        </div>

        <div className={isMobile ? "flex-1 overflow-auto" : "max-h-[440px] overflow-auto"}>
          {loading ? (
            <div className="py-10 text-center text-sm text-neutral-600 dark:text-muted-foreground">טוען...</div>
          ) : items.length === 0 ? (
            emptyState
          ) : (
            <div className="p-2 space-y-2">
              {items.map((g) => {
                const href = navHrefForGroup(g)
                const ids = g.rows.map((r) => r.id)
                const isSystem = g.type === "system_message" || g.type === "post_deleted"
                // System notifications (deletions, automated actions) use the site logo as avatar
                const avatar = isSystem
                  ? '/apple-touch-icon.png'
                  : (g.actor_avatars.find(Boolean) ?? null)
                const actorName = isSystem
                  ? 'מערכת האתר'
                  : (uniqueActorNames(g.actor_display_names)[0] ?? 'משתמש')

                const blockClass =
                  "block w-full rounded-xl border border-neutral-200 dark:border-border bg-white dark:bg-card transition px-3 py-2 " +
                  (isSystem ? "cursor-default" : "group cursor-pointer hover:bg-neutral-50 dark:hover:bg-muted")

                const inner = (
                  <div className="flex items-start gap-3">
                    <div className="mt-1">
                      <Avatar src={avatar} name={actorName} />
                    </div>

                    <div className="flex-1">
                      <div className="text-sm text-neutral-900 dark:text-foreground text-right">{renderContent(g)}</div>
                      <div className="mt-1 text-xs text-neutral-500 dark:text-muted-foreground text-right">{formatDateTime(g.created_at)}</div>
                    </div>
                  </div>
                )

                if (href) {
                  const doNav = () => {
                    const target = navTargetForGroup(g) || href
                    // Guard: only navigate to relative same-origin paths
                    if (!target.startsWith('/') || target.startsWith('//')) return
                    void markGroupRead(ids)
                    // Cache-buster forces re-highlight even on same-page navigation
                    const sep = target.includes('?') ? '&' : '?'
                    const navUrl = target.includes('/post/') ? `${target}${sep}t=${Date.now()}` : target
                    setOpen(false)
                    // Mobile post deep-links: hard navigation guarantees fresh mount + reliable hl/scroll.
                    // Desktop & non-post URLs: SPA push for smooth experience.
                    const isMobilePost = typeof window !== 'undefined'
                      && window.matchMedia('(max-width: 1023px)').matches
                      && navUrl.includes('/post/')
                    if (isMobilePost) {
                      window.location.href = navUrl
                    } else {
                      router.push(navUrl)
                    }
                  }
                  return (
                    <div
                      key={g.key}
                      role="button"
                      tabIndex={0}
                      onClick={doNav}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); doNav() }
                      }}
                      className={blockClass}
                    >
                      {inner}
                    </div>
                  )
                }

                return (
                  <div
                    key={g.key}
                    className={blockClass}
                    onClick={() => {
                      if (isSystem) return
                      void markGroupRead(ids)
                      setOpen(false)
                    }}
                  >
                    {inner}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="relative" ref={wrapRef} dir="rtl">
      <button
        type="button"
        onTouchStart={(e) => e.stopPropagation()}
        onMouseDown={(e) => e.stopPropagation()}
        onClick={() => {
          const next = !open
          setOpen(next)
          if (next) {
            if (typeof window !== 'undefined') {
              window.dispatchEvent(new CustomEvent('tyuta:close-mobile-menu'))
              window.dispatchEvent(new CustomEvent('tyuta:close-header-dropdowns'))
            }
            void load()
          }
        }}
        className="relative p-2 rounded-lg hover:bg-neutral-300 dark:hover:bg-muted transition-all duration-200"
        title="התראות"
        aria-label="התראות"
      >
        <Bell size={20} strokeWidth={2.5} className="text-neutral-700 dark:text-foreground" />
        {unread > 0 ? (
          <span className="absolute top-0 right-0 min-w-[16px] h-4 px-1 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center">
            {unread > 99 ? "99+" : unread}
          </span>
        ) : null}
      </button>

      {/* Desktop dropdown */}
      {open ? (
        <div className="hidden lg:block absolute top-full left-0 mt-2 w-96 max-h-[500px] z-50 animate-in fade-in slide-in-from-top-2 duration-200">
          {renderPanel('desktop')}
        </div>
      ) : null}

      {/* Mobile fullscreen (rendered in a portal to avoid being clipped by parents) */}
      {open && typeof document !== 'undefined'
        ? createPortal(
            <>
              <div className="lg:hidden fixed top-14 left-0 right-0 bottom-0 z-[9998] bg-black/30 backdrop-blur-sm animate-in fade-in duration-200" />
              <div className="lg:hidden fixed top-14 left-0 right-0 bottom-0 z-[9999] p-0 overflow-hidden animate-in slide-in-from-top duration-300">
                {renderPanel('mobile')}
              </div>
            </>,
            document.body
          )
        : null}
    </div>
  )
}

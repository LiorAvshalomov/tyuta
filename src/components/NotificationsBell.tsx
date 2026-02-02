"use client"

import Link from "next/link"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { Bell } from "lucide-react"
import { supabase } from "@/lib/supabaseClient"

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
  payload: Record<string, unknown>
  is_read: boolean
  read_at: string | null
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

function postSlugFromPayload(payload: Record<string, unknown>): string | null {
  return str(payload.post_slug) || str(payload.slug) || null
}

function commentTextFromPayload(payload: Record<string, unknown>): string | null {
  return (
    str(payload.comment_text) ||
    str(payload.comment_body) ||
    str(payload.comment) ||
    str(payload.body) ||
    str(payload.text) ||
    null
  )
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

function normalizeRow(r: NotifRowDb): NotifNormalized {
  const payload = isRecord(r.payload) ? r.payload : {}
  const actor = r.actor ?? null

  const actor_display_name =
    (actor?.display_name ?? "").trim() ||
    (actor?.username ?? "").trim() ||
    (actorNameFromPayload(payload) ?? "")

  return {
    id: r.id,
    created_at: r.created_at,
    type: r.type,
    payload,
    is_read: r.is_read,
    read_at: r.read_at,
    actor_display_name: actor_display_name ? actor_display_name : null,
    actor_username: (actor?.username ?? "").trim() || null,
    actor_avatar_url: actor?.avatar_url ?? null,
  }
}

function groupKey(n: NotifNormalized): string {
  if (n.type === "system_message" || n.type === "post_deleted") return `${n.type}|${n.id}`

  const p = n.payload
  const entityType = str(p.entity_type) || ""
  const entityId = str(p.entity_id) || str(p.post_id) || ""
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

function clipText(s: string, max = 60): string {
  const t = s.trim()
  if (t.length <= max) return t
  return `${t.slice(0, max).trimEnd()}...`
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
          id, user_id, actor_id, type, payload, is_read, read_at, created_at,
          actor:profiles!notifications_actor_id_fkey (id, username, display_name, avatar_url)
        `
        )
        .eq("user_id", uid)
        .order("created_at", { ascending: false })
        .limit(200)

      if (error) throw error

      const rows = (data ?? []) as unknown as NotifRowDb[]
      const norm = rows.map(normalizeRow)
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

  // close on click outside (desktop & mobile)
  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      const el = wrapRef.current
      if (!el) return
      if (e.target instanceof Node && !el.contains(e.target)) setOpen(false)
    }
    document.addEventListener("mousedown", onDown)
    return () => document.removeEventListener("mousedown", onDown)
  }, [open])

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

  const navHrefForGroup = useCallback((g: NotifGroup): string | null => {
    if (g.type === "system_message" || g.type === "post_deleted") return null
    const first = g.rows[0]
    const payload = first?.payload ?? {}

    if (g.type === "follow") {
      const u = first?.actor_username || str(payload.username) || str(payload.actor_username)
      return u ? `/u/${u}` : null
    }

    const slug = postSlugFromPayload(payload)
    return slug ? `/post/${slug}` : null
  }, [])

  const renderContent = useCallback((g: NotifGroup) => {
    const first = g.rows[0]
    const payload = first?.payload ?? {}

    if (g.type === "system_message") {
      const t = titleFromPayload(payload) ?? ""
      const m = messageFromPayload(payload)
      return (
        <div className="text-right leading-snug">
          <div className="font-semibold">מערכת האתר "{t || "הודעה"}"</div>
          {m ? <div className="text-neutral-600 mt-0.5">{m}</div> : null}
        </div>
      )
    }

    if (g.type === "post_deleted") {
      const t = titleFromPayload(payload) ?? "פוסט"
      const reason = reasonFromPayload(payload)
      return (
        <div className="text-right leading-snug">
          <div className="font-semibold">הפוסט "{t}" נמחק ע"י מערכת האתר</div>
          {reason ? <div className="text-neutral-600 mt-0.5">סיבה: {reason}</div> : null}
        </div>
      )
    }

    const uniqActors = uniqueActorNames(g.actor_display_names)
    const who = formatActorsHeb(uniqActors)
    const count = uniqActors.length
    const title = titleFromPayload(payload)
    const commentText = commentTextFromPayload(payload)

    if (g.type === "follow") {
      return (
        <span>
          <span className="font-semibold">{who}</span> {verbByCount(count, 'התחיל/ה', 'התחילו')} לעקוב אחריך
        </span>
      )
    }

    if (g.type === "comment_like") {
      const verb = verbByCount(count, "עשה/תה", "עשו")
      const postTitle = title ?? "ללא כותרת"
      const snippet = commentText ? clipText(commentText, 35) : null
      return (
        <div className="text-right leading-snug">
          <div>
            <span className="font-semibold">{who}</span> {verb} לייק לתגובה שלך בפוסט: "{postTitle}"
          </div>
          {snippet ? <div className="text-neutral-600 mt-0.5">"{snippet}"</div> : null}
        </div>
      )
    }

    if (g.type === "comment") {
      const isReply = isReplyToComment(payload)
      const verb = verbByCount(count, "הגיב/ה", "הגיבו")
      const postTitle = title ?? "ללא כותרת"
      return (
        <span>
          <span className="font-semibold">{who}</span> {isReply ? `${verb} על התגובה שלך בפוסט` : `${verb} בפוסט שלך`}: "{postTitle}"
        </span>
      )
    }

    if (g.type === "new_post") {
      return (
        <span>
          <span className="font-semibold">{who}</span> {verbByCount(count, 'העלה/תה', 'העלו')} פוסט חדש{title ? `: "${title}"` : ""}
        </span>
      )
    }

    if (g.type === "reaction") {
      return (
        <span>
          <span className="font-semibold">{who}</span> {verbByCount(count, 'דירג/ה', 'דירגו')} את הפוסט שלך{title ? `: "${title}"` : ""}
        </span>
      )
    }

    return (
      <span>
        <span className="font-semibold">{who}</span> שלח/ה עדכון{title ? `: "${title}"` : ""}
      </span>
    )
  }, [])

  const emptyState = <div className="py-10 text-center text-sm text-neutral-600">אין התראות</div>

  const renderPanel = (mode: 'desktop' | 'mobile') => {
    const isMobile = mode === 'mobile'

    return (
      <div
        className={
          "bg-white shadow-xl border border-neutral-200 overflow-hidden " +
          (isMobile ? "rounded-none h-[calc(100vh-56px)] flex flex-col" : "rounded-xl")
        }
      >
        <div className="sticky top-0 z-10 bg-gradient-to-b from-neutral-100 to-neutral-50 border-b border-neutral-200 px-4 py-3 flex items-center justify-between">
          <h3 className="text-sm font-bold text-neutral-900">התראות</h3>
          <button
            onClick={() => void clearAll()}
            className="text-xs font-semibold text-neutral-600 hover:text-neutral-900 hover:bg-neutral-200 px-2 py-1 rounded-lg transition-colors"
          >
            נקה הכל
          </button>
        </div>

        <div className={isMobile ? "flex-1 overflow-auto" : "max-h-[440px] overflow-auto"}>
          {loading ? (
            <div className="py-10 text-center text-sm text-neutral-600">טוען...</div>
          ) : items.length === 0 ? (
            emptyState
          ) : (
            <div className="p-2 space-y-2">
              {items.map((g) => {
                const href = navHrefForGroup(g)
                const ids = g.rows.map((r) => r.id)
                const avatar = g.actor_avatars.find(Boolean) ?? null
                const isSystem = g.type === "system_message" || g.type === "post_deleted"

                const blockClass =
                  "block w-full rounded-xl border border-neutral-200 bg-white transition px-3 py-2 " +
                  (isSystem ? "cursor-default" : "group cursor-pointer hover:bg-neutral-50")

                const inner = (
                  <div className="flex items-start gap-3">
                    <div className="mt-1 w-9 h-9 rounded-full bg-neutral-200 flex items-center justify-center overflow-hidden">
                      {avatar ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={avatar} alt="" className="w-full h-full object-cover" />
                      ) : (
                        <span className="text-sm font-bold text-neutral-700">מ</span>
                      )}
                    </div>

                    <div className="flex-1">
                      <div className="text-sm text-neutral-900 text-right">{renderContent(g)}</div>
                      <div className="mt-1 text-xs text-neutral-500 text-right">{formatDateTime(g.created_at)}</div>
                    </div>
                  </div>
                )

                if (href) {
                  return (
                    <Link
                      key={g.key}
                      href={href}
                      onClick={() => {
                        void markGroupRead(ids)
                        setOpen(false)
                      }}
                      className={blockClass}
                    >
                      {inner}
                    </Link>
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
        onClick={() => {
          const next = !open
          setOpen(next)
          if (next) void load()
        }}
        className="relative p-2 rounded-lg hover:bg-neutral-300 transition-all duration-200"
        title="התראות"
        aria-label="התראות"
      >
        <Bell size={20} strokeWidth={2.5} className="text-neutral-700" />
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

      {/* Mobile fullscreen */}
      {open ? (
        <>
          <div
            className="lg:hidden fixed top-14 left-0 right-0 bottom-0 z-[9998] bg-black/30 backdrop-blur-sm animate-in fade-in duration-200"
            onClick={() => setOpen(false)}
          />
          <div className="lg:hidden fixed top-14 left-0 right-0 bottom-0 z-[9999] p-0 overflow-hidden animate-in slide-in-from-top duration-300">
            {renderPanel('mobile')}
          </div>
        </>
      ) : null}
    </div>
  )
}

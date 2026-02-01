'use client'

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabaseClient'
import { Bell } from 'lucide-react'

type ProfileLite = {
  id: string
  username: string | null
  display_name: string | null
  avatar_url: string | null
}

type NotifPayload = Record<string, unknown>

type NotifRowDb = {
  id: string
  user_id: string
  actor_id: string | null
  type: string
  entity_type: string | null
  entity_id: string | null
  payload: NotifPayload | null
  created_at: string
  read_at: string | null
  actor?: ProfileLite | ProfileLite[] | null
}

type GroupedNotif = {
  key: string
  type: string
  rows: NotifRowDb[]
  created_at: string
  post_id?: string
  post_slug?: string
  post_title?: string
  comment_id?: string
}

function asString(v: unknown): string | undefined {
  return typeof v === 'string' && v.trim() ? v : undefined
}

function normalizeActor(a: NotifRowDb['actor']): ProfileLite | null {
  if (!a) return null
  return Array.isArray(a) ? (a[0] ?? null) : a
}

function shortDateTime(iso: string): string {
  try {
    const d = new Date(iso)
    const day = String(d.getDate()).padStart(2, '0')
    const month = String(d.getMonth() + 1).padStart(2, '0')
    const year = String(d.getFullYear())
    const hh = String(d.getHours()).padStart(2, '0')
    const mm = String(d.getMinutes()).padStart(2, '0')
    return `${day}.${month}.${year} · ${hh}:${mm}`
  } catch {
    return iso
  }
}

function initials(name?: string): string {
  if (!name) return 'מ'
  const t = name.trim()
  if (!t) return 'מ'
  return t[0]!.toUpperCase()
}

function truncate(s: string, max: number): string {
  const t = s.trim()
  if (t.length <= max) return t
  return t.slice(0, Math.max(0, max - 3)).trimEnd() + '...'
}

function actorNameFromRow(r: NotifRowDb): string {
  const a = normalizeActor(r.actor)
  if (a?.display_name) return a.display_name
  if (a?.username) return a.username

  const p = r.payload ?? {}
  return (
    asString(p['actor_display_name']) ||
    asString(p['from_user_name']) ||
    asString(p['actor_username']) ||
    asString(p['from_user_username']) ||
    'מישהו'
  )
}

function actorAvatarFromRow(r: NotifRowDb): string | null {
  const a = normalizeActor(r.actor)
  return a?.avatar_url ?? null
}

function groupKeyForRow(r: NotifRowDb): string {
  const p = r.payload ?? {}
  const action = asString(p['action'])
  const commentId = asString(p['comment_id'])
  const postId = asString(p['post_id']) || r.entity_id || undefined

  if (r.type === 'follow') return 'follow'
  if (r.type === 'system_message') return `system:${r.id}` // never group system messages
  if (r.type === 'post_deleted') return `post_deleted:${postId ?? r.id}`

  // comment likes should group per comment_id
  if (action === 'comment_like' && commentId) return `comment_like:${commentId}`

  // reactions to post group per post
  if (r.type === 'reaction' && postId) return `reaction:${postId}`

  // comments on post group per post
  if (r.type === 'comment' && postId) return `comment:${postId}`

  // fallback
  return `${r.type}:${postId ?? r.id}`
}

function titleFromPayload(p: NotifPayload | null | undefined): string | undefined {
  if (!p) return undefined
  return asString(p['post_title']) || asString(p['title']) || asString(p['postTitle'])
}

function messageFromPayload(p: NotifPayload | null | undefined): string | undefined {
  if (!p) return undefined
  return asString(p['message']) || asString(p['reason'])
}

export default function NotificationsBell() {
  const supabase = createClientComponentClient()
  const router = useRouter()

  const [open, setOpen] = useState(false)
  const [rows, setRows] = useState<NotifRowDb[]>([])
  const [loading, setLoading] = useState(false)

  const ref = useRef<HTMLDivElement | null>(null)

  const loadRows = useCallback(async () => {
    setLoading(true)
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser()

      if (!user?.id) {
        setRows([])
        return
      }

      const { data, error } = await supabase
        .from('notifications')
        .select(
          'id,user_id,actor_id,type,entity_type,entity_id,payload,created_at,read_at,actor:profiles!notifications_actor_id_fkey(id,username,display_name,avatar_url)'
        )
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(60)

      if (error) throw error
      setRows((data ?? []) as unknown as NotifRowDb[])
    } finally {
      setLoading(false)
    }
  }, [supabase])

  const unreadCount = useMemo(() => rows.filter(r => !r.read_at).length, [rows])

  const markAllRead = useCallback(async () => {
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user?.id) return

    const ids = rows.filter(r => !r.read_at).map(r => r.id)
    if (ids.length === 0) return

    const now = new Date().toISOString()
    await supabase.from('notifications').update({ read_at: now }).eq('user_id', user.id).in('id', ids)
    setRows(prev => prev.map(r => (ids.includes(r.id) ? { ...r, read_at: now } : r)))
  }, [rows, supabase])

  const clearAll = useCallback(async () => {
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user?.id) return

    await supabase.from('notifications').delete().eq('user_id', user.id)
    setRows([])
  }, [supabase])

  const grouped = useMemo<GroupedNotif[]>(() => {
    const map = new Map<string, GroupedNotif>()

    for (const r of rows) {
      const p = r.payload ?? {}
      const key = groupKeyForRow(r)

      const postId = asString(p['post_id']) || r.entity_id || undefined
      const postSlug = asString(p['post_slug'])
      const postTitle = asString(p['post_title']) || asString(p['postTitle'])
      const commentId = asString(p['comment_id'])

      const existing = map.get(key)
      if (!existing) {
        map.set(key, {
          key,
          type: r.type,
          rows: [r],
          created_at: r.created_at,
          post_id: postId,
          post_slug: postSlug,
          post_title: postTitle,
          comment_id: commentId,
        })
      } else {
        existing.rows.push(r)
        // keep latest created_at
        if (new Date(r.created_at).getTime() > new Date(existing.created_at).getTime()) {
          existing.created_at = r.created_at
        }
        existing.post_id = existing.post_id ?? postId
        existing.post_slug = existing.post_slug ?? postSlug
        existing.post_title = existing.post_title ?? postTitle
        existing.comment_id = existing.comment_id ?? commentId
      }
    }

    return Array.from(map.values()).sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    )
  }, [rows])

  const labelForGroup = useCallback((g: GroupedNotif): React.ReactNode => {
    const latest = g.rows[0]
    const p = latest?.payload ?? {}
    const action = asString(p['action'])

    // actor names aggregation
    const names = Array.from(new Set(g.rows.map(actorNameFromRow)))
    const n = names.length

    const namesText =
      n === 1
        ? names[0]
        : n === 2
          ? `${names[0]}, ${names[1]}`
          : n === 3
            ? `${names[0]}, ${names[1]} ו-${names[2]}`
            : `${names[n - 1]} ועוד ${n - 1}`

    if (g.type === 'follow') {
      return (
        <span>
          <span className="font-semibold">{namesText}</span> התחיל/ה לעקוב אחריך
        </span>
      )
    }

    if (g.type === 'reaction') {
      const title = g.post_title || titleFromPayload(p) || ''
      return (
        <span>
          <span className="font-semibold">{namesText}</span> הגיב/ה לפוסט שלך:{' '}
          {title ? <span>&quot;{title}&quot;</span> : null}
        </span>
      )
    }

    if (g.type === 'comment') {
      if (action === 'comment_like') {
        const text = asString(p['comment_text'])
        const short = text ? truncate(text, 60) : ''
        return (
          <span>
            <span className="font-semibold">{namesText}</span> עשה/תה לייק לתגובה שלך
            {short ? (
              <>
                : <span>&quot;{short}&quot;</span>
              </>
            ) : null}
          </span>
        )
      }

      const title = g.post_title || titleFromPayload(p) || ''
      return (
        <span>
          <span className="font-semibold">{namesText}</span> הגיב/ה לפוסט שלך: {title ? <span>&quot;{title}&quot;</span> : null}
        </span>
      )
    }

    if (g.type === 'post_deleted') {
      const title = asString((p as Record<string, unknown>)['post_title']) || g.post_title || ''
      const reason = asString((p as Record<string, unknown>)['reason'])
      return (
        <div className="text-right">
          <div>
            הפוסט {title ? <span>&quot;{title}&quot;</span> : null} נמחק ע&quot;י מערכת האתר
          </div>
          {reason ? <div className="text-xs text-gray-500 mt-1">סיבה: {reason}</div> : null}
        </div>
      )
    }

    if (g.type === 'system_message') {
      const title = titleFromPayload(p) || 'הודעה ממערכת האתר'
      const msg = messageFromPayload(p)
      return (
        <div className="text-right">
          <div className="font-semibold">{title}</div>
          {msg ? <div className="text-sm text-gray-700 mt-1">{msg}</div> : null}
        </div>
      )
    }

    // fallback
    return (
      <span>
        <span className="font-semibold">{namesText}</span> שלח/ה עדכון
      </span>
    )
  }, [])

  const avatarForGroup = useCallback((g: GroupedNotif) => {
    const latest = g.rows[0]
    const url = latest ? actorAvatarFromRow(latest) : null
    const name = latest ? actorNameFromRow(latest) : undefined

    if (g.type === 'system_message' || g.type === 'post_deleted') {
      return (
        <div className="w-9 h-9 rounded-full bg-gray-200 flex items-center justify-center text-sm text-gray-700">
          מ
        </div>
      )
    }

    if (url) {
      // eslint-disable-next-line @next/next/no-img-element
      return <img src={url} alt="" className="w-9 h-9 rounded-full object-cover" />
    }

    return (
      <div className="w-9 h-9 rounded-full bg-gray-200 flex items-center justify-center text-sm text-gray-700">
        {initials(name)}
      </div>
    )
  }, [])

  const goToGroup = useCallback(
    async (g: GroupedNotif) => {
      const {
        data: { user },
      } = await supabase.auth.getUser()
      const userId = user?.id
      if (!userId) return

      // mark group read (also clears badge immediately)
      const ids = g.rows.filter(r => !r.read_at).map(r => r.id)
      if (ids.length) {
        const now = new Date().toISOString()
        void supabase
          .from('notifications')
          .update({ read_at: now })
          .eq('user_id', userId)
          .in('id', ids)
          .then(() => setRows(prev => prev.map(r => (ids.includes(r.id) ? { ...r, read_at: now } : r))))
      }

      // system-style don't navigate
      if (g.type === 'system_message' || g.type === 'post_deleted') return

      if (g.post_slug) {
        router.push(`/post/${g.post_slug}`)
        return
      }

      if (g.post_id) {
        const { data } = await supabase
          .from('posts')
          .select('slug')
          .eq('id', g.post_id)
          .is('deleted_at', null)
          .single()
        if (data?.slug) {
          router.push(`/post/${data.slug}`)
          return
        }
      }

      const first = g.rows[0]
      const p = first?.payload ?? {}
      const actorUsername = asString(p['actor_username'])
      if (actorUsername) {
        router.push(`/u/${actorUsername}`)
        return
      }
    },
    [router, supabase]
  )

  // close on outside click
  useEffect(() => {
    function onDown(e: MouseEvent) {
      if (!open) return
      const el = ref.current
      if (!el) return
      if (e.target instanceof Node && !el.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open])

  // initial load + realtime
  useEffect(() => {
    void loadRows()
    const ch = supabase
      .channel('notif-bell')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'notifications' }, () => void loadRows())
      .subscribe()

    return () => void supabase.removeChannel(ch)
  }, [loadRows, supabase])

  // when opening: mark all as read (badge drops)
  useEffect(() => {
    if (!open) return
    void markAllRead()
  }, [open, markAllRead])

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        className="relative p-2 rounded-full hover:bg-gray-100 active:bg-gray-200 transition"
        aria-label="התראות"
      >
        <Bell className="w-6 h-6" />
        {unreadCount > 0 ? (
          <span className="absolute -top-1 -left-1 min-w-[18px] h-[18px] px-1 rounded-full bg-red-500 text-white text-[11px] flex items-center justify-center">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        ) : null}
      </button>

      {open ? (
        <div className="absolute left-0 mt-2 w-[340px] max-w-[85vw] bg-white border border-gray-200 rounded-xl shadow-lg overflow-hidden z-50">
          <div className="flex items-center justify-between px-3 py-2 border-b border-gray-100">
            <div className="font-semibold">התראות</div>
            <button
              type="button"
              onClick={clearAll}
              className="text-sm text-gray-600 hover:text-gray-900 cursor-pointer"
            >
              נקה הכל
            </button>
          </div>

          <div className="max-h-[420px] overflow-auto">
            {loading ? (
              <div className="p-4 text-sm text-gray-600 text-center">טוען...</div>
            ) : grouped.length === 0 ? (
              <div className="p-6 text-sm text-gray-600 text-center">אין התראות</div>
            ) : (
              <div className="p-2 space-y-2">
                {grouped.map(g => (
                  <div
                    key={g.key}
                    onClick={() => void goToGroup(g)}
                    className="flex items-center justify-between gap-3 bg-white border border-gray-200 rounded-xl px-3 py-3 hover:bg-gray-50 cursor-pointer"
                    role="button"
                    tabIndex={0}
                  >
                    <div className="flex-1 text-right text-sm leading-snug">{labelForGroup(g)}</div>
                    <div className="flex items-center gap-2">
                      <div className="text-xs text-gray-500">{shortDateTime(g.created_at)}</div>
                      {avatarForGroup(g)}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      ) : null}
    </div>
  )
}

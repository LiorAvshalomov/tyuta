'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabaseClient'

type NotificationPayload = Record<string, unknown>

type NotificationRow = {
  id: string
  user_id: string
  actor_id: string | null
  type: string
  entity_type: string | null
  entity_id: string | null
  payload: NotificationPayload | null
  is_read: boolean
  created_at: string
  read_at: string | null
}

function asString(v: unknown): string | null {
  return typeof v === 'string' && v.trim() ? v : null
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

type GroupedNotif = {
  key: string
  type: string
  entity_type: string | null
  entity_id: string | null
  post_slug: string | null
  post_id: string | null
  post_title: string | null
  actor_display_names: string[] // שמות יפים להצגה (unique)
  actor_usernames: string[] // אם בא לך בעתיד
  count: number
  newest_created_at: string
  rows: NotificationRow[]
  is_read: boolean // אם כולם נקראו
}

function verbFor(type: string, count: number): string {
  const plural = count > 1
  if (type === 'follow') return plural ? 'התחילו' : 'התחיל/ה'
  if (type === 'comment') return plural ? 'הגיבו' : 'הגיב/ה'
  if (type === 'reaction') return plural ? 'עשו ריאקשן' : 'עשה/תה ריאקשן'
  return plural ? 'שלחו' : 'שלח/ה'
}

function actionPhraseFor(type: string): string {
  if (type === 'follow') return 'לעקוב אחריך'
  if (type === 'comment') return 'לפוסט שלך'
  if (type === 'reaction') return 'לפוסט שלך'
  return 'התראה'
}

function formatActors(names: string[]): string {
  const clean = names.filter(Boolean)
  if (clean.length === 0) return 'מישהו'
  if (clean.length === 1) return clean[0]
  if (clean.length === 2) return `${clean[0]} ו${clean[1]}`
  if (clean.length === 3) return `${clean[0]}, ${clean[1]} ו${clean[2]}`
  // 4+
  return `${clean[0]} ועוד ${clean.length - 1} אנשים`
}


export default function NotificationsBell() {
  const router = useRouter()
  const boxRef = useRef<HTMLDivElement | null>(null)

  const [open, setOpen] = useState(false)
  const [rows, setRows] = useState<NotificationRow[]>([])
  const [loading, setLoading] = useState(false)

  useClickOutside(boxRef, () => setOpen(false), open)

  const unreadCount = useMemo(() => rows.filter(r => !r.is_read).length, [rows])

  const load = useCallback(async () => {
    setLoading(true)

    const { data: sessionData } = await supabase.auth.getSession()
    const uid = sessionData.session?.user?.id

    if (!uid) {
      setRows([])
      setLoading(false)
      return
    }

    const { data, error } = await supabase
      .from('notifications')
      .select('*')
      .eq('user_id', uid)
      .order('created_at', { ascending: false })
      .limit(80)

    if (!error) setRows((data ?? []) as NotificationRow[])
    setLoading(false)
  }, [])

  const markAllRead = useCallback(async () => {
    const { data: sessionData } = await supabase.auth.getSession()
    const uid = sessionData.session?.user?.id
    if (!uid) return

    await supabase
      .from('notifications')
      .update({ is_read: true, read_at: new Date().toISOString() })
      .eq('user_id', uid)
      .eq('is_read', false)

    setRows(prev =>
      prev.map(r => (r.is_read ? r : { ...r, is_read: true, read_at: new Date().toISOString() }))
    )
  }, [])

  const clearAll = useCallback(async () => {
    const { data: sessionData } = await supabase.auth.getSession()
    const uid = sessionData.session?.user?.id
    if (!uid) return

    const ok = confirm('לנקות את כל ההתראות?')
    if (!ok) return

    const { error } = await supabase.from('notifications').delete().eq('user_id', uid)
    if (!error) setRows([])
  }, [])

  const goToNotification = useCallback(
    async (g: GroupedNotif) => {
      // post -> slug -> post
      if (g.post_slug) {
        router.push(`/post/${g.post_slug}`)
        return
      }

      // fallback by post_id
      if (g.post_id) {
        const { data } = await supabase.from('posts').select('slug').eq('id', g.post_id).single()
        if (data?.slug) {
          router.push(`/post/${data.slug}`)
          return
        }
      }

      // follow -> go to first actor profile (if we have username in payload)
      const firstRow = g.rows[0]
      const payload = firstRow?.payload ?? {}
      const actorUsername = asString(payload['actor_username'])

      if (actorUsername) {
        router.push(`/u/${actorUsername}`)
        return
      }

      if (firstRow?.actor_id) {
        const { data } = await supabase
          .from('profiles')
          .select('username')
          .eq('id', firstRow.actor_id)
          .single()
        if (data?.username) {
          router.push(`/u/${data.username}`)
          return
        }
      }
    },
    [router]
  )

  // ✅ GROUPING (הכי בסיסי ונקי):
  // - follow: קבוצה לפי type בלבד (כל העוקבים יחד)
  // - comment/reaction: קבוצה לפי post_id (entity_id)
  const grouped = useMemo<GroupedNotif[]>(() => {
    const map = new Map<string, GroupedNotif>()

    for (const n of rows) {
      const payload = n.payload ?? {}
      const postId = asString(payload['post_id']) ?? n.entity_id
      const postSlug = asString(payload['post_slug'])
      const postTitle = asString(payload['post_title'])
      const actorDisplay =
        asString(payload['actor_display_name']) ??
        asString(payload['actor_username']) ??
        'מישהו'
      const actorUsername = asString(payload['actor_username']) ?? ''

      const key =
        n.type === 'follow'
          ? `follow`
          : `${n.type}:${postId ?? 'unknown'}`

      const existing = map.get(key)
      if (!existing) {
        map.set(key, {
          key,
          type: n.type,
          entity_type: n.entity_type,
          entity_id: n.entity_id,
          post_id: postId,
          post_slug: postSlug,
          post_title: postTitle,
          actor_display_names: actorDisplay ? [actorDisplay] : [],
          actor_usernames: actorUsername ? [actorUsername] : [],
          count: 1,
          newest_created_at: n.created_at,
          rows: [n],
          is_read: n.is_read,
        })
      } else {
        existing.count += 1
        existing.rows.push(n)
        existing.is_read = existing.is_read && n.is_read

        // newest time
        if (new Date(n.created_at).getTime() > new Date(existing.newest_created_at).getTime()) {
          existing.newest_created_at = n.created_at
        }

        // keep latest post info if missing
        existing.post_id = existing.post_id ?? postId
        existing.post_slug = existing.post_slug ?? postSlug
        existing.post_title = existing.post_title ?? postTitle

        // unique actors (preserve order)
        if (actorDisplay && !existing.actor_display_names.includes(actorDisplay)) {
          existing.actor_display_names.push(actorDisplay)
        }
        if (actorUsername && !existing.actor_usernames.includes(actorUsername)) {
          existing.actor_usernames.push(actorUsername)
        }
      }
    }

    // sort by newest
    return Array.from(map.values()).sort(
      (a, b) => new Date(b.newest_created_at).getTime() - new Date(a.newest_created_at).getTime()
    )
  }, [rows])

  const renderText = useCallback((g: GroupedNotif) => {
    const actorsText = formatActors(g.actor_display_names)
    const verb = verbFor(g.type, g.actor_display_names.length || g.count)
    const phrase = actionPhraseFor(g.type)

    // שם פוסט בסוף (רק לתגובות/ריאקשנים)
    const postSuffix =
      (g.type === 'comment' || g.type === 'reaction') && g.post_title
        ? `: "${g.post_title}"`
        : ''

    if (g.type === 'follow') return `${actorsText} ${verb} ${phrase}`
    if (g.type === 'comment') return `${actorsText} ${verb} ${phrase}${postSuffix}`
    if (g.type === 'reaction') return `${actorsText} ${verb} ${phrase}${postSuffix}`
    return `${actorsText} ${verb} ${phrase}`
  }, [])

  useEffect(() => {
    void (async () => {
      await load()
    })()

    const ch = supabase
      .channel('notifications-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'notifications' }, () => {
        void (async () => {
          await load()
        })()
      })
      .subscribe()

    return () => {
      supabase.removeChannel(ch)
    }
  }, [load])

  useEffect(() => {
    if (!open) return
    void (async () => {
      await markAllRead()
    })()
  }, [open, markAllRead])

  return (
    <div className="relative" ref={boxRef}>
      <button
        onClick={() => setOpen(v => !v)}
        className="relative rounded-full border bg-white px-3 py-2 text-xs font-semibold hover:bg-neutral-50"
        aria-label="התראות"
      >
        🔔
        {unreadCount > 0 && (
          <span className="absolute -left-1 -top-1 flex h-5 min-w-[20px] items-center justify-center rounded-full bg-black px-1 text-[11px] font-bold text-white">
            {unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute left-0 z-50 mt-2 w-[360px] rounded-2xl border bg-white shadow-lg">
          <div className="flex items-center justify-between border-b px-3 py-2">
            <div className="text-sm font-bold">התראות</div>
            <button
              onClick={clearAll}
              className="rounded-full border bg-white px-3 py-1 text-xs font-semibold hover:bg-neutral-50"
            >
              נקה הכל
            </button>
          </div>

          <div className="max-h-[420px] overflow-y-auto p-2" dir="rtl">
            {loading ? (
              <div className="p-3 text-sm text-muted-foreground">טוען…</div>
            ) : grouped.length === 0 ? (
              <div className="p-3 text-sm text-muted-foreground">אין התראות.</div>
            ) : (
              <div className="space-y-1">
                {grouped.map(g => (
                  <button
                    key={g.key}
                    onClick={() => {
                      setOpen(false)
                      void goToNotification(g)
                    }}
                    className={[
                      'w-full rounded-xl px-3 py-2 text-right text-sm',
                      'hover:bg-neutral-50',
                      g.is_read ? 'text-neutral-700' : 'font-bold',
                    ].join(' ')}
                  >
                    {renderText(g)}
                    <div className="mt-1 text-xs text-muted-foreground">
                      {new Date(g.newest_created_at).toLocaleString('he-IL')}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

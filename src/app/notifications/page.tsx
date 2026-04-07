"use client"

import Avatar from '@/components/Avatar'
import { supabase } from '@/lib/supabaseClient'
import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useMemo, useState } from 'react'

type ProfileLite = {
  id: string
  username: string | null
  display_name: string | null
  avatar_url: string | null
}

type NotificationType =
  | 'follow'
  | 'reaction'
  | 'comment'
  | 'comment_like'
  | 'system_message'
  | 'post_deleted'
  | 'new_post'

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

function isRecord(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === 'object' && !Array.isArray(v)
}

function str(v: unknown): string | null {
  return typeof v === 'string' ? v : null
}

function titleFromPayload(payload: Record<string, unknown>): string | null {
  const direct = str(payload.post_title) || str(payload.title)
  if (direct) return direct
  const post = payload.post
  if (isRecord(post)) return str(post.title) || null
  return null
}

function postSlugFromPayload(payload: Record<string, unknown>): string | null {
  return str(payload.post_slug) || str(payload.slug) || null
}

function formatDateTime(iso: string): string {
  const d = new Date(iso)
  const pad = (x: number) => String(x).padStart(2, '0')
  return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()} · ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function labelForType(t: string): string {
  switch (t) {
    case 'follow':
      return 'התחיל לעקוב אחריך'
    case 'reaction':
      return 'הגיב לפוסט שלך'
    case 'comment':
      return 'השאיר תגובה'
    case 'comment_like':
      return 'אהב תגובה'
    case 'new_post':
      return 'פרסם פוסט'
    case 'post_deleted':
      return 'פוסט נמחק'
    case 'system_message':
      return 'הודעת מערכת'
    default:
      return 'התראה'
  }
}

export default function NotificationsPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [rows, setRows] = useState<NotifRowDb[]>([])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const { data: u } = await supabase.auth.getSession()
      const uid = u.session?.user?.id
      if (!uid) {
        setRows([])
        return
      }

      const { data, error } = await supabase
        .from('notifications')
        .select(
          `
          id, user_id, actor_id, type, entity_type, entity_id, payload, is_read, read_at, created_at,
          actor:profiles!notifications_actor_id_fkey (id, username, display_name, avatar_url)
        `
        )
        .eq('user_id', uid)
        .order('created_at', { ascending: false })
        .limit(200)

      if (error) throw error

      setRows((data ?? []) as unknown as NotifRowDb[])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const unreadCount = useMemo(() => rows.filter((r) => !r.is_read).length, [rows])

  const openNotif = async (r: NotifRowDb) => {
    // Best-effort mark read
    if (!r.is_read) {
      void supabase.from('notifications').update({ is_read: true, read_at: new Date().toISOString() }).eq('id', r.id)
    }

    const payload = isRecord(r.payload) ? r.payload : {}
    const slug = postSlugFromPayload(payload)
    if (slug) {
      router.push(`/post/${encodeURIComponent(slug)}`)
      return
    }
  }

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-6">
      <div className="mb-4 flex items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-extrabold text-neutral-900">התראות</h1>
          <div className="mt-1 text-sm text-neutral-600">
            {loading ? 'טוען…' : unreadCount > 0 ? `${unreadCount} לא נקראו` : 'הכל נקרא'}
          </div>
        </div>
        <button
          onClick={() => void load()}
          className="rounded-full border border-neutral-200 bg-white px-4 py-2 text-sm font-semibold hover:bg-neutral-50"
        >
          רענן
        </button>
      </div>

      <div className="rounded-3xl border border-black/5 bg-white shadow-sm overflow-hidden">
        {loading ? (
          <div className="p-6 text-sm text-neutral-600">טוען התראות…</div>
        ) : rows.length === 0 ? (
          <div className="p-6 text-sm text-neutral-600">אין התראות עדיין.</div>
        ) : (
          <ul className="divide-y divide-neutral-100">
            {rows.map((r) => {
              const payload = isRecord(r.payload) ? r.payload : {}
              const name =
                (r.actor?.display_name ?? '').trim() ||
                (r.actor?.username ?? '').trim() ||
                (str(payload.actor_display_name) ?? '').trim() ||
                (str(payload.actor_username) ?? '').trim() ||
                'מישהו'
              const title = titleFromPayload(payload)
              const type = String(r.type ?? '')

              return (
                <li key={r.id}>
                  <button
                    type="button"
                    onClick={() => void openNotif(r)}
                    className={`w-full text-right px-4 py-3 hover:bg-neutral-50 transition-colors ${r.is_read ? '' : 'bg-neutral-50/60'}`}
                  >
                    <div className="flex items-start gap-3">
                      <Avatar src={r.actor?.avatar_url ?? null} name={name} size={36} />
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                          <span className="font-bold text-neutral-900 truncate">{name}</span>
                          <span className="text-sm text-neutral-600">{labelForType(type)}</span>
                          {!r.is_read ? (
                            <span className="inline-flex items-center rounded-full bg-red-500 px-2 py-0.5 text-[11px] font-bold text-white">
                              חדש
                            </span>
                          ) : null}
                        </div>
                        {title ? <div className="mt-1 text-sm text-neutral-800 line-clamp-2">{title}</div> : null}
                        <div className="mt-1 text-[11px] text-neutral-500">{formatDateTime(r.created_at)}</div>
                      </div>
                    </div>
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </div>
  )
}

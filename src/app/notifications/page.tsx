"use client"

import Avatar from '@/components/Avatar'
import { supabase } from '@/lib/supabaseClient'
import { useToast } from '@/components/Toast'
import { mapSupabaseError } from '@/lib/mapSupabaseError'
import { waitForClientSession } from '@/lib/auth/clientSession'
import {
  POST_REFRESH_CHANNEL,
  POST_REFRESH_EVENT,
  POST_REFRESH_STORAGE_KEY,
} from '@/lib/postFreshness'
import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

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

async function hydrateRowsWithCurrentPostData(rows: NotifRowDb[]) {
  const postIds = new Set<string>()
  const commentIds = new Set<string>()

  for (const row of rows) {
    const payload = isRecord(row.payload) ? row.payload : null
    if (payload) {
      const postId = str(payload.post_id)
      if (postId) postIds.add(postId)

      const nested = payload.payload
      const nestedComment = payload.comment
      const commentId =
        str(payload.comment_id) ||
        (isRecord(nested) ? str(nested.comment_id) : null) ||
        (isRecord(nestedComment) ? str(nestedComment.id) : null)
      if (commentId) commentIds.add(commentId)
    }

    if (row.entity_type === 'post' && row.entity_id) postIds.add(String(row.entity_id))
    if ((row.entity_type === 'comment' || row.type === 'comment') && row.entity_id) {
      commentIds.add(String(row.entity_id))
    }
  }

  type CommentLite = { id: string; post_id: string }
  const commentsById = new Map<string, CommentLite>()
  if (commentIds.size > 0) {
    const { data } = await supabase
      .from('comments')
      .select('id, post_id')
      .in('id', Array.from(commentIds))
      .limit(500)
    const list = (data ?? []) as unknown as CommentLite[]
    for (const comment of list) {
      commentsById.set(comment.id, comment)
      if (comment.post_id) postIds.add(comment.post_id)
    }
  }

  type PostLite = { id: string; slug: string; title: string | null }
  const postsById = new Map<string, PostLite>()
  if (postIds.size > 0) {
    const { data } = await supabase
      .from('posts')
      .select('id, slug, title')
      .in('id', Array.from(postIds))
      .limit(500)
    const list = (data ?? []) as unknown as PostLite[]
    for (const post of list) postsById.set(post.id, post)
  }

  return rows.map((row) => {
    const payload = isRecord(row.payload) ? { ...row.payload } : {}
    const commentId =
      (row.entity_type === 'comment' || row.type === 'comment')
        ? (row.entity_id ? String(row.entity_id) : str(payload.comment_id))
        : str(payload.comment_id)

    if (commentId && commentsById.has(commentId)) {
      const comment = commentsById.get(commentId)!
      payload.comment_id = commentId
      payload.post_id = comment.post_id
    }

    const postId =
      str(payload.post_id) ||
      (row.entity_type === 'post' && row.entity_id ? String(row.entity_id) : null)

    if (postId && postsById.has(postId)) {
      const post = postsById.get(postId)!
      payload.post_id = postId
      payload.post_slug = post.slug
      payload.post_title = post.title
    }

    return {
      ...row,
      payload,
    }
  })
}

export default function NotificationsPage() {
  const router = useRouter()
  const { toast } = useToast()
  const [loading, setLoading] = useState(true)
  const [rows, setRows] = useState<NotifRowDb[]>([])
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const loadSeqRef = useRef(0)

  const load = useCallback(async () => {
    const loadSeq = ++loadSeqRef.current
    setLoading(true)
    setErrorMsg(null)
    try {
      const resolution = await waitForClientSession(5000)
      if (loadSeq !== loadSeqRef.current) return
      const uid = resolution.status === 'authenticated' ? resolution.user.id : null
      if (!uid) {
        setRows([])
        setErrorMsg(null)
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

      const hydratedRows = await hydrateRowsWithCurrentPostData((data ?? []) as unknown as NotifRowDb[])
      if (loadSeq !== loadSeqRef.current) return
      setRows(hydratedRows)
    } catch (error) {
      if (loadSeq !== loadSeqRef.current) return
      setErrorMsg(mapSupabaseError(error as { message?: string | null; details?: string | null; hint?: string | null; code?: string | null }) ?? 'לא הצלחנו לטעון את ההתראות כרגע.')
    } finally {
      if (loadSeq === loadSeqRef.current) {
        setLoading(false)
      }
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    const reload = () => {
      void load()
    }

    const onWindowEvent = () => {
      reload()
    }

    const onStorage = (event: StorageEvent) => {
      if (event.key !== POST_REFRESH_STORAGE_KEY || !event.newValue) return
      reload()
    }

    window.addEventListener(POST_REFRESH_EVENT, onWindowEvent as EventListener)
    window.addEventListener('storage', onStorage)

    let channel: BroadcastChannel | null = null
    if ('BroadcastChannel' in window) {
      try {
        channel = new BroadcastChannel(POST_REFRESH_CHANNEL)
        channel.onmessage = () => {
          reload()
        }
      } catch {
        channel = null
      }
    }

    return () => {
      window.removeEventListener(POST_REFRESH_EVENT, onWindowEvent as EventListener)
      window.removeEventListener('storage', onStorage)
      channel?.close()
    }
  }, [load])

  const unreadCount = useMemo(() => rows.filter((r) => !r.is_read).length, [rows])

  const openNotif = async (r: NotifRowDb) => {
    if (!r.is_read) {
      const readAt = new Date().toISOString()
      setRows((prev) => prev.map((row) => (
        row.id === r.id ? { ...row, is_read: true, read_at: readAt } : row
      )))
      void supabase
        .from('notifications')
        .update({ is_read: true, read_at: readAt })
        .eq('id', r.id)
        .then(({ error }) => {
          if (!error) return
          setRows((prev) => prev.map((row) => (
            row.id === r.id ? { ...row, is_read: r.is_read, read_at: r.read_at } : row
          )))
          const friendly = mapSupabaseError(error) ?? 'לא הצלחנו לעדכן את מצב ההתראה.'
          setErrorMsg(friendly)
          toast(friendly, 'error')
        })
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

      {errorMsg ? (
        <div className="mb-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {errorMsg}
        </div>
      ) : null}

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

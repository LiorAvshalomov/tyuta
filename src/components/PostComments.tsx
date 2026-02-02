'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabaseClient'
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

export default function PostComments({ postId, postSlug, postTitle }: Props) {
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)

  const [userId, setUserId] = useState<string | null>(null)
  const [me, setMe] = useState<AuthorMini | null>(null)

  const [text, setText] = useState('')
  const [items, setItems] = useState<CommentRow[]>([])
  const [err, setErr] = useState<string | null>(null)

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
const [reportOpen, setReportOpen] = useState(false)
const [reportCategory, setReportCategory] = useState<'abuse' | 'spam' | 'hate' | 'privacy' | 'other'>('abuse')
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
    const details = [
      reportDetails.trim() || null,
      `post: ${postSlug}`,
      `title: ${String(postTitle || '').slice(0, 120)}`,
    ]
      .filter(Boolean)
      .join('\n')

    const { error } = await supabase.from('user_reports').insert({
      reporter_id: userId,
      reported_user_id: reportedComment.author_id,
      conversation_id: null,
      category: reportCategory,
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
  } catch (e: any) {
    setReportErr(e?.message ?? 'לא הצלחנו לשלוח דיווח')
  } finally {
    setReportSending(false)
  }
}


  // likes
  const [myLiked, setMyLiked] = useState<Set<string>>(new Set())
  const [likeCounts, setLikeCounts] = useState<Record<string, number>>({})

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
      counts[r.comment_id] = Number((r as any).likes_count ?? 0)
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
    ;(myData as any[] | null | undefined)?.forEach((r) => {
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
        parent_comment_id: (rr as any).parent_comment_id ?? null,
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
                id, post_id, author_id, content, created_at, updated_at,
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

    if (inserted?.id) {
      setItems(prev => prev.map(x => (x.id === tempId ? { ...x, id: inserted.id } : x)))
    }
  }

  const startReply = (c: CommentRow) => {
    setErrFor(null)
    setReplyToId(c.id)
    setReplyToName(c.author?.display_name ?? 'אנונימי')
    setText('')
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

  return (

<>
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
                value={reportCategory}
                onChange={(e) => setReportCategory(e.target.value as typeof reportCategory)}
                className="w-full rounded-2xl border bg-white px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-black/10"
              >
                <option value="abuse">שפה פוגענית / הקנטה</option>
                <option value="spam">ספאם / פרסום</option>
                <option value="hate">שנאה / הסתה</option>
                <option value="privacy">חשיפת מידע אישי</option>
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
      <div className="mt-3 rounded-2xl border bg-neutral-50 p-3">
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
            <Link className="font-semibold hover:underline" href="/login">
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
      <div className="mt-4 space-y-3">
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
                className="rounded-2xl border p-3 scroll-mt-24"
              >
                {headerRow}

                {body}

                {/* פעולות (כמו פייסבוק – עדין, לא מוגזם) */}
                {!isEditing ? (
                  <div className="mt-3 flex items-center gap-4 text-xs">
                    <button
                      type="button"
                      onClick={() => toggleLike(c.id)}
                      className={`font-semibold hover:underline ${liked ? 'text-red-600' : 'text-neutral-600'}`}
                      disabled={isTemp || sending}
                    >
                      ❤ לייק{likes ? ` (${likes})` : ''}
                    </button>
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
                  <div className="mt-4 space-y-2 border-r border-neutral-200 pr-4 mr-6">
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
                          className="rounded-2xl border bg-white p-3 scroll-mt-24"
                        >
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
                              <button
                                type="button"
                                onClick={() => toggleLike(r.id)}
                                className={`font-semibold hover:underline ${rLiked ? 'text-red-600' : 'text-neutral-600'}`}
                                disabled={rTemp || sending}
                              >
                                ❤ לייק{rLikes ? ` (${rLikes})` : ''}
                              </button>
                            </div>
                          ) : null}
                        </div>
                      )
                    })}
                  </div>
                ) : null}
              </div>
            )
          })
        )}
      </div>
    </section>
    </>
  )
}

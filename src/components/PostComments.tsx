'use client'

import { useEffect, useMemo, useState } from 'react'
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
  content: string
  created_at: string
  updated_at: string | null
  author: AuthorMini | null
}

type Props = { postId: string }

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

export default function PostComments({ postId }: Props) {
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)

  const [userId, setUserId] = useState<string | null>(null)
  const [me, setMe] = useState<AuthorMini | null>(null)

  const [text, setText] = useState('')
  const [items, setItems] = useState<CommentRow[]>([])
  const [err, setErr] = useState<string | null>(null)

  // edit state
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editText, setEditText] = useState('')

  const canSend = useMemo(() => text.trim().length >= 2 && !sending, [text, sending])
  const canSaveEdit = useMemo(() => editText.trim().length >= 2 && !sending, [editText, sending])

  const load = async () => {
    setErr(null)
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
      .order('created_at', { ascending: false })
      .limit(50)

    if (error) {
      setErr(error.message)
      setLoading(false)
      return
    }

    const normalized: CommentRow[] = (data ?? []).map(r => {
      const rr = r as unknown as Omit<CommentRow, 'author'> & { author: unknown }
      return {
        id: rr.id,
        post_id: rr.post_id,
        author_id: rr.author_id,
        content: rr.content,
        created_at: rr.created_at,
        updated_at: rr.updated_at ?? null,
        author: normalizeAuthor(rr.author),
      }
    })

    setItems(normalized)
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
    setErr(null)

    const value = text.trim()
    if (value.length < 2) {
      setErr('התגובה קצרה מדי')
      return
    }

    const { data: auth } = await supabase.auth.getUser()
    const u = auth.user
    if (!u) {
      setErr('צריך להתחבר כדי להגיב')
      return
    }

    setSending(true)

    const tempId = makeTempId()
    const optimistic: CommentRow = {
      id: tempId,
      post_id: postId,
      author_id: u.id,
      content: value,
      created_at: new Date().toISOString(),
      updated_at: null,
      author: me ?? { username: null, display_name: 'אנונימי', avatar_url: null },
    }

    setItems(prev => [optimistic, ...prev])
    setText('')

    const { data: inserted, error } = await supabase
      .from('comments')
      .insert({
        post_id: postId,
        author_id: u.id,
        content: value,
      })
      .select('id')
      .single()

    setSending(false)

    if (error) {
      setItems(prev => prev.filter(x => x.id !== tempId))
      setErr(error.message)
      return
    }

    if (inserted?.id) {
      setItems(prev => prev.map(x => (x.id === tempId ? { ...x, id: inserted.id } : x)))
    }
  }

  const startEdit = (c: CommentRow) => {
    setErr(null)
    setEditingId(c.id)
    setEditText(c.content)
  }

  const cancelEdit = () => {
    setEditingId(null)
    setEditText('')
  }

  const saveEdit = async (commentId: string) => {
    setErr(null)
    const value = editText.trim()
    if (value.length < 2) {
      setErr('התגובה קצרה מדי')
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
      setErr(error.message)
      await load()
      return
    }

    cancelEdit()
  }

  const remove = async (commentId: string) => {
    setErr(null)
    if (!confirm('למחוק את התגובה?')) return

    // optimistic remove
    const snapshot = items
    setItems(prev => prev.filter(x => x.id !== commentId))

    const { error } = await supabase.from('comments').delete().eq('id', commentId)

    if (error) {
      setErr(error.message)
      setItems(snapshot) // rollback
    }
  }

  return (
    <section className="mt-6 rounded-2xl border bg-white p-4" dir="rtl">
      <div className="flex items-center justify-between gap-3">
        <h3 className="m-0 text-sm font-bold">תגובות</h3>
        <div className="text-xs text-muted-foreground">{items.length} תגובות</div>
      </div>

      {/* Composer */}
      <div className="mt-3 rounded-2xl border bg-neutral-50 p-3">
        <textarea
          className="w-full resize-none rounded-xl border bg-white px-3 py-2 text-sm leading-6 outline-none focus:ring-2 focus:ring-black/10"
          rows={3}
          maxLength={700}
          placeholder={userId ? 'כתוב תגובה…' : 'התחבר כדי להגיב…'}
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
          items.map(c => {
            const a = c.author
            const name = a?.display_name ?? 'אנונימי'
            const username = a?.username ?? null
            const avatar = a?.avatar_url ?? null
            const isMine = !!userId && c.author_id === userId
            const isTemp = String(c.id).startsWith('temp-')
            const isEditing = editingId === c.id

            return (
              <div key={c.id} className="rounded-2xl border p-3">
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
                    {isTemp ? (
                      <div className="text-xs text-muted-foreground">שולח…</div>
                    ) : null}

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
                  </div>
                </div>

                {isEditing ? (
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
                )}
              </div>
            )
          })
        )}
      </div>
    </section>
  )
}

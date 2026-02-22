'use client'

import { supabase } from '@/lib/supabaseClient'
import Avatar from '@/components/Avatar'
import { timeAgoHeShort } from '@/lib/time'
import { useEffect, useMemo, useRef, useState } from 'react'
import type { RealtimePostgresChangesPayload } from '@supabase/supabase-js'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

type NoteRow = {
  id: string
  user_id: string
  body: string
  created_at: string
  updated_at: string
  username: string
  display_name: string
  avatar_url: string | null
}

const NOTE_MAX = 220
const COOLDOWN_SECONDS = 10 * 60
const NOTE_TTL_SECONDS = 12 * 60 * 60

function getColumnsCount() {
  if (typeof window === 'undefined') return 1
  const w = window.innerWidth
  if (w >= 1024) return 3
  if (w >= 640) return 2
  return 1
}

function sortNotesByUpdatedAtDesc(arr: NoteRow[]) {
  return arr
    .slice()
    .sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime())
}

function secondsToClock(sec: number) {
  const s = Math.max(0, Math.floor(sec))
  const m = Math.floor(s / 60)
  const r = s % 60
  return `${m}:${String(r).padStart(2, '0')}`
}

function secondsToHumanHe(sec: number) {
  const s = Math.max(0, Math.floor(sec))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  if (h <= 0) return `${m} דק׳`
  if (m <= 0) return `${h} ש׳`
  return `${h} ש׳ ${m} דק׳`
}

function clipOneLineNote(s: string, maxChars: number) {
  const oneLine = s.replace(/\s+/g, ' ').trim()
  if (oneLine.length <= maxChars) return oneLine
  return oneLine.slice(0, Math.max(0, maxChars - 1)).trimEnd() + '…'
}

export default function CommunityNotesWall() {
  const router = useRouter()
  const [meId, setMeId] = useState<string | null>(null)
  const [isAdmin, setIsAdmin] = useState(false)
  const [authChecked, setAuthChecked] = useState(false)
  const [notes, setNotes] = useState<NoteRow[]>([])
  const [loading, setLoading] = useState(true)

  // responsive masonry columns (keeps newest-first within each column)
  const [colsCount, setColsCount] = useState(1)

  // realtime status (fallback polling keeps everything consistent even if websocket isn't enabled)
  const [rtStatus, setRtStatus] = useState<'INIT' | 'SUBSCRIBED' | 'CLOSED' | 'ERROR'>('INIT')

  // subtle highlight for realtime updates
  const [highlightId, setHighlightId] = useState<string | null>(null)

  // admin moderation UI
  const [openMenuId, setOpenMenuId] = useState<string | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<NoteRow | null>(null)
  const [deleteReason, setDeleteReason] = useState('')
  const [deleting, setDeleting] = useState(false)

  const [body, setBody] = useState('')
  const [posting, setPosting] = useState(false)
  const [myLastUpdatedAt, setMyLastUpdatedAt] = useState<string | null>(null)

  // used to animate "new note" replace without jumping
  const lastPostedIdRef = useRef<string | null>(null)

  const [nowMs, setNowMs] = useState(() => Date.now())
  const remainingSeconds = useMemo(() => {
    if (!myLastUpdatedAt) return 0
    const last = new Date(myLastUpdatedAt).getTime()
    const elapsed = (nowMs - last) / 1000
    return Math.max(0, Math.ceil(COOLDOWN_SECONDS - elapsed))
  }, [myLastUpdatedAt, nowMs])

  const cooldown = remainingSeconds > 0

  // Tick for countdown (keeps it moving without refresh)
  useEffect(() => {
    const t = setInterval(() => setNowMs(Date.now()), 1000)
    return () => clearInterval(t)
  }, [])

  // columns count (client only)
  useEffect(() => {
    const apply = () => setColsCount(getColumnsCount())
    apply()
    window.addEventListener('resize', apply)
    return () => window.removeEventListener('resize', apply)
  }, [])

  async function loadMe() {
    const { data } = await supabase.auth.getUser()
    const uid = data.user?.id ?? null
    setMeId(uid)
    setAuthChecked(true)

    // Private page: if not logged in, redirect before loading any content.
    if (!uid) {
      router.replace('/auth/login')
      return null
    }

    return uid
  }

  async function loadAdminFlag(uid: string) {
    // Admin is DB-truth (cannot be spoofed from client)
    const { data, error } = await supabase.from('admins').select('user_id').eq('user_id', uid).maybeSingle()
    if (error) {
      setIsAdmin(false)
      return
    }
    setIsAdmin(!!data?.user_id)
  }

  useEffect(() => {
    if (!openMenuId) return
    const onDown = (e: MouseEvent | TouchEvent) => {
      // close menu on outside click
      const target = e.target as HTMLElement | null
      if (!target) return
      if (target.closest('[data-note-menu]')) return
      setOpenMenuId(null)
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('touchstart', onDown, { passive: true })
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('touchstart', onDown)
    }
  }, [openMenuId])

  // silent=true → background refresh; skip the loading skeleton so the wall never flickers.
  // Only the very first load (silent=false) shows the skeleton.
  async function loadNotes(silent = false) {
    if (!silent) setLoading(true)

    const { data, error } = await supabase
      .from('community_notes_feed')
      .select('id,user_id,body,created_at,updated_at,username,display_name,avatar_url')
      .order('updated_at', { ascending: false })
      .limit(200)

    if (!silent) setLoading(false)

    if (error) return

    setNotes(sortNotesByUpdatedAtDesc((data as NoteRow[]) ?? []))
  }

  async function loadMyNote() {
    const { data: me } = await supabase.auth.getUser()
    const uid = me.user?.id
    if (!uid) {
      setMyLastUpdatedAt(null)
      return
    }

    const { data, error } = await supabase
      .from('community_notes')
      .select('updated_at, body')
      .eq('user_id', uid)
      .maybeSingle()

    if (error) return
    if (data?.updated_at) setMyLastUpdatedAt(data.updated_at)
  }

  useEffect(() => {
    let ch: ReturnType<typeof supabase.channel> | null = null

    ;(async () => {
      const uid = await loadMe()
      if (!uid) return
      await Promise.all([loadNotes(), loadMyNote(), loadAdminFlag(uid)])

      // Realtime: update only the changed note (avoids full reload + keeps UI snappy)
      ch = supabase
        .channel('community_notes_changes')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'community_notes' }, async (payload) => {
          const p = payload as RealtimePostgresChangesPayload<{ id: string; user_id: string; updated_at: string }>
          const eventType = p.eventType

          // ✅ DELETE events often contain only the primary key in `old` (no user_id). Handle by id first.
          if (eventType === 'DELETE') {
            const deletedId = p.old?.id
            if (!deletedId) return
            setNotes((prevList) => prevList.filter((n) => n.id !== deletedId))
            return
          }

          const next = (p.new ?? null) as { user_id?: string; updated_at?: string } | null
          const prev = (p.old ?? null) as { user_id?: string; updated_at?: string } | null
          const userId = next?.user_id ?? prev?.user_id
          const updatedAt = next?.updated_at ?? prev?.updated_at
          if (!userId) return

          // keep my cooldown timer consistent if my note was updated elsewhere
          if (userId === uid && updatedAt) {
            setMyLastUpdatedAt(updatedAt)
          }

          // fetch the fully joined row (display_name/avatar) from the feed view
          const { data: row } = await supabase
            .from('community_notes_feed')
            .select('id,user_id,body,created_at,updated_at,username,display_name,avatar_url')
            .eq('user_id', userId)
            .maybeSingle()

          if (!row) return

          const noteRow = row as NoteRow

          setNotes((prev) => {
            const without = prev.filter((n) => n.user_id !== noteRow.user_id)
            return sortNotesByUpdatedAtDesc([noteRow, ...without])
          })

          setHighlightId(noteRow.id)
          window.setTimeout(() => setHighlightId(null), 1200)
        })
        .subscribe((status) => {
          // status can be: SUBSCRIBED, TIMED_OUT, CLOSED, CHANNEL_ERROR
          if (status === 'SUBSCRIBED') setRtStatus('SUBSCRIBED')
          else if (status === 'CLOSED') setRtStatus('CLOSED')
          else setRtStatus('ERROR')
        })
    })()

    return () => {
      if (ch) supabase.removeChannel(ch)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps -- mount-only init
  }, [])

  // Fallback polling (only if realtime isn't subscribed).
  // This keeps the wall and the cooldown timer consistent even if websocket is disabled.
  useEffect(() => {
    if (!meId) return
    if (rtStatus === 'SUBSCRIBED') return

    const pollMs = 8000
    const t = setInterval(() => loadNotes(true), pollMs)
    const onFocus = () => loadNotes()
    window.addEventListener('focus', onFocus)
    return () => {
      clearInterval(t)
      window.removeEventListener('focus', onFocus)
    }
  }, [meId, rtStatus])

  async function handlePost() {
    if (!meId) {
      router.push('/auth/login')
      return
    }

    const normalized = body.replace(/\r\n/g, '\n')
    const trimmed = normalized.trim()
    if (!trimmed) return

    if (trimmed.length > NOTE_MAX) {
      alert(`הפתק ארוך מדי (מקסימום ${NOTE_MAX} תווים).`)
      return
    }

    setPosting(true)
    // NOTE: Server enforces max length + cooldown. We send the trimmed body so users can't publish empty spaces.
    const { data, error } = await supabase.rpc('upsert_community_note', { body: trimmed })
    setPosting(false)

    if (error) {
      // cooldown: error message is 'cooldown', remaining seconds is in error.details
      const msg = (error.message || '').toLowerCase()
      const remaining = Number(error.details)
      if (msg.includes('cooldown') && Number.isFinite(remaining)) {
        alert(`אפשר לפרסם שוב בעוד ${secondsToClock(remaining)} דקות 🙂`)
        // force countdown to be based on server-truth
        const serverLast = new Date(Date.now() - (COOLDOWN_SECONDS - remaining) * 1000).toISOString()
        setMyLastUpdatedAt(serverLast)
        return
      }

      alert('שגיאה בפרסום פתק')
      return
    }

    if (!data) return

    const row = data as { id: string; user_id: string; body: string; created_at: string; updated_at: string }
    setMyLastUpdatedAt(row.updated_at)
    setBody('')
    lastPostedIdRef.current = row.id

    // Optimistic update in the wall:
    // 1) if my note exists in feed → replace it
    // 2) else add on top
    setNotes((prev) => {
      const idx = prev.findIndex((n) => n.user_id === row.user_id)
      if (idx >= 0) {
        const copy = prev.slice()
        copy[idx] = { ...copy[idx], body: row.body, updated_at: row.updated_at, created_at: row.created_at }
        // move to top
        const [picked] = copy.splice(idx, 1)
        return sortNotesByUpdatedAtDesc([picked, ...copy])
      }
      return prev
    })

    // Refresh from DB for display_name/avatar (in case they changed).
    // Silent so the wall never flickers on post — we already applied the optimistic update.
    void loadNotes(true)
  }

  async function handleOpenChat(note: NoteRow) {
    if (!meId) {
      router.push('/auth/login')
      return
    }
    if (note.user_id === meId) return

    const { data, error } = await supabase.rpc('start_conversation', {
      other_user_id: note.user_id,
    })
    if (error || !data) {
      alert('שגיאה בפתיחת שיחה')
      return
    }
    router.push(`/inbox/${data}`)
  }

  async function handleAdminDelete() {
    if (!isAdmin || !deleteTarget) return

    const reason = deleteReason.trim()
    if (reason.length < 3) {
      alert('חובה לציין סיבה (לפחות 3 תווים).')
      return
    }

    setDeleting(true)
    const { error } = await supabase.rpc('admin_delete_community_note', {
      p_note_id: deleteTarget.id,
      p_reason: reason,
    })
    setDeleting(false)

    if (error) {
      const msg = (error.message || '').toLowerCase()
      if (msg.includes('not_admin')) {
        alert('אין לך הרשאה למחוק פתקים.')
        setIsAdmin(false)
        setDeleteTarget(null)
        setDeleteReason('')
        return
      }
      if (msg.includes('reason_required')) {
        alert('חובה לציין סיבה למחיקה.')
        return
      }
      alert('שגיאה במחיקה')
      return
    }

    // optimistic UI: remove by id (realtime will also remove)
    setNotes((prev) => prev.filter((n) => n.id !== deleteTarget.id))
    setDeleteTarget(null)
    setDeleteReason('')
  }

  return (
    <section className="space-y-4">
      {/* If we haven't checked auth yet, keep UI minimal to avoid flashing private content */}
      {!authChecked ? (
        <div className="rounded-3xl border border-black/5 bg-[#FAF9F6]/80 p-6 text-sm text-muted-foreground shadow-sm backdrop-blur dark:border-white/10 dark:bg-card/80">
          טוען…
        </div>
      ) : null}

      <div className="rounded-3xl border border-black/5 bg-[#FAF9F6]/90 shadow-sm backdrop-blur dark:border-white/10 dark:bg-card/90">
        <div className="px-4 py-3" dir="rtl">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-lg font-black">פתקים מהקהילה</div>
              <div className="mt-0.5 text-sm text-muted-foreground">
                משפט או שניים — משהו קטן להשאיר לאחרים.
              </div>
            </div>

            <div className="hidden sm:flex items-center gap-2 text-xs text-muted-foreground">
              <span className="rounded-full border border-black/10 bg-white/60 px-2 py-1 dark:border-white/10 dark:bg-muted/60">מקס׳ {NOTE_MAX} תווים</span>
              <span className="rounded-full border border-black/10 bg-white/60 px-2 py-1 dark:border-white/10 dark:bg-muted/60">קולדאון 10 דק׳</span>
            </div>
          </div>

          {/* Composer */}
          <div className="mt-3 rounded-2xl border border-black/10 bg-white/70 p-3 dark:border-white/10 dark:bg-muted/50">
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder={meId ? 'מה עובר עליך עכשיו?' : 'כדי לפרסם פתק צריך להתחבר 🙂'}
              maxLength={NOTE_MAX}
              rows={3}
              className="w-full resize-y bg-transparent text-sm outline-none placeholder:text-muted-foreground"
              dir="rtl"
              disabled={!meId || posting}
            />

            <div className="mt-2 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <span>{body.trim().length}/{NOTE_MAX}</span>
                {cooldown && (
                  <span className="rounded-full border border-black/10 bg-white/60 px-2 py-1 dark:border-white/10 dark:bg-muted/60">
                    אפשר שוב בעוד {secondsToClock(remainingSeconds)}
                  </span>
                )}
              </div>

              <button
                onClick={handlePost}
                disabled={!meId || posting || cooldown || !body.trim()}
                className="rounded-full bg-black px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
              >
                {posting ? 'מפרסם…' : cooldown ? 'המתן…' : 'פרסם פתק'}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Wall */}
      <div className="rounded-3xl border border-black/5 bg-[#FAF9F6]/80 p-3 shadow-sm backdrop-blur dark:border-white/10 dark:bg-card/80">
        {loading ? (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 9 }).map((_, i) => (
              <div key={i} className="h-28 rounded-2xl border border-black/10 bg-white/60 animate-pulse dark:border-white/10 dark:bg-muted/40" />
            ))}
          </div>
        ) : notes.length === 0 ? (
          <div className="p-8 text-center text-sm text-muted-foreground">
            עדיין אין פתקים. תהיה הראשון להשאיר משהו 🙂 
          </div>
        ) : (
          <div className="flex gap-3" dir="rtl">
            {Array.from({ length: colsCount }).map((_, colIndex) => {
              const colNotes = notes.filter((_, i) => i % colsCount === colIndex)
              return (
                <div key={colIndex} className="flex-1 space-y-3 min-w-0">
                  {colNotes.map((n) => {
                    const mine = meId && n.user_id === meId

                    // TTL visible ONLY to the owner
                    const ttlUpdatedAt = mine && myLastUpdatedAt ? myLastUpdatedAt : n.updated_at
                    const expiresInSeconds = mine
                      ? Math.max(0, NOTE_TTL_SECONDS - Math.floor((Date.now() - new Date(ttlUpdatedAt).getTime()) / 1000))
                      : 0
                    const expiresText = mine && expiresInSeconds > 0 ? secondsToHumanHe(expiresInSeconds) : null

                    return (
                      <div
                        key={n.id}
                        className={[
                          'group relative text-right w-full rounded-2xl border border-black/10 bg-white/70 p-3 shadow-sm transition dark:border-border dark:bg-card',
                          'will-change-transform hover:-translate-y-0.5 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-black/20 dark:focus:ring-white/20',
                          mine ? 'opacity-95' : 'cursor-pointer',
                          (lastPostedIdRef.current === n.id || highlightId === n.id)
                            ? 'ring-2 ring-black/20 shadow-md scale-[1.01] bg-white/80 dark:ring-white/20'
                            : '',
                        ].join(' ')}
                        dir="rtl"
                        title={mine ? 'זה הפתק שלך' : 'לחץ על התוכן כדי לפתוח שיחה'}
                      >
                        {isAdmin ? (
                          <div className="absolute left-2 top-2" data-note-menu>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation()
                                setOpenMenuId((cur) => (cur === n.id ? null : n.id))
                              }}
                              className="flex h-8 w-8 items-center justify-center rounded-full text-base text-black hover:bg-black/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black/20 dark:text-foreground dark:hover:bg-white/10"
                              aria-label="פעולות אדמין"
                            >
                              ⋯
                            </button>

                            {openMenuId === n.id ? (
                              <div className="mt-1 w-40 overflow-hidden rounded-xl border border-black/10 bg-white shadow-lg dark:border-white/10 dark:bg-card">
                                <button
                                  type="button"
                                  className="w-full px-3 py-2 text-right text-sm hover:bg-red-50 hover:text-red-700 dark:hover:bg-red-950/30 dark:hover:text-red-400"
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    setOpenMenuId(null)
                                    setDeleteTarget(n)
                                    setDeleteReason('')
                                  }}
                                >
                                  מחק
                                </button>
                              </div>
                            ) : null}
                          </div>
                        ) : null}

                        <div className="flex items-start gap-3">
                          <div className="shrink-0">
                            <Avatar src={n.avatar_url} name={n.display_name || n.username} size={34} />
                          </div>

                          <div className="min-w-0 flex-1">
                            <div className="flex items-center justify-between gap-2">
                              <Link
                                href={`/u/${n.username}`}
                                className="truncate text-sm font-bold hover:underline"
                                onClick={(e) => e.stopPropagation()}
                                title="לפרופיל"
                              >
                                {n.display_name || n.username}
                              </Link>

                              <div className="shrink-0 text-left">
                                <div className="text-xs text-muted-foreground">{timeAgoHeShort(n.updated_at)}</div>
                                {expiresText ? (
                                  <div className="mt-0.5 text-[11px] text-muted-foreground">
                                    יימחק בעוד {expiresText}
                                  </div>
                                ) : null}
                              </div>
                            </div>

                            <button
                              type="button"
                              onClick={() => handleOpenChat(n)}
                              disabled={!!mine}
                              className={[
                                'mt-1 w-full text-right text-sm leading-relaxed text-black/90 dark:text-foreground/90',
                                'whitespace-pre-wrap break-words',
                                mine ? 'cursor-default' : 'cursor-pointer',
                              ].join(' ')}
                              title={mine ? 'זה הפתק שלך' : 'פתח שיחה'}
                            >
                              {n.body}
                            </button>

                            {!mine ? (
                              <div className="mt-2 text-xs text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100">
                                פתח שיחה →
                              </div>
                            ) : null}
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Admin delete modal */}
      {deleteTarget ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/30 p-4 sm:items-center" dir="rtl">
          <div className="w-full max-w-md rounded-2xl bg-white p-4 shadow-xl dark:bg-card dark:border dark:border-border">
            <div className="text-base font-black">מחיקת פתק</div>
            <div className="mt-1 text-sm text-muted-foreground">
              הפתק: ״{clipOneLineNote(deleteTarget.body, 60)}״
            </div>

            <textarea
              className="mt-3 w-full rounded-xl border border-black/10 bg-white p-3 text-sm outline-none focus:ring-2 focus:ring-black/20 dark:border-white/10 dark:bg-muted dark:text-foreground placeholder:text-muted-foreground"
              rows={4}
              value={deleteReason}
              onChange={(e) => setDeleteReason(e.target.value)}
              placeholder="סיבה למחיקה…"
            />

            <div className="mt-4 flex gap-2">
              <button
                type="button"
                className="flex-1 rounded-xl border border-black/10 px-3 py-2 text-sm font-semibold dark:border-white/10 dark:bg-muted dark:hover:bg-muted/80"
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
                onClick={handleAdminDelete}
              >
                {deleting ? 'מוחק…' : 'מחק'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  )
}

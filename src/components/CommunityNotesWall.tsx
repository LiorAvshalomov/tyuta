'use client'

import { supabase } from '@/lib/supabaseClient'
import { adminFetch } from '@/lib/admin/adminFetch'
import Avatar from '@/components/Avatar'
import AuthorHover from '@/components/AuthorHover'
import {
  PROFILE_REFRESH_CHANNEL,
  PROFILE_REFRESH_EVENT,
  PROFILE_REFRESH_STORAGE_KEY,
  readProfileRefreshPayload,
  type ProfileRefreshPayload,
} from '@/lib/profileFreshness'
import { heRelativeTime } from '@/lib/time/heRelativeTime'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { RealtimePostgresChangesPayload } from '@supabase/supabase-js'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { waitForClientSession } from '@/lib/auth/clientSession'
import { buildLoginRedirect } from '@/lib/auth/protectedRoutes'

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

type NotesViewport = 'mobile' | 'tablet' | 'desktop'

const NOTE_MAX = 220
const COOLDOWN_SECONDS = 10 * 60
const NOTE_TTL_SECONDS = 12 * 60 * 60

function sortNotesByUpdatedAtDesc(arr: NoteRow[]) {
  return arr
    .slice()
    .sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime())
}

function sameNoteSnapshot(a: NoteRow[], b: NoteRow[]) {
  if (a === b) return true
  if (a.length !== b.length) return false

  for (let i = 0; i < a.length; i += 1) {
    const prev = a[i]
    const next = b[i]
    if (
      prev.id !== next.id ||
      prev.updated_at !== next.updated_at ||
      prev.body !== next.body ||
      prev.username !== next.username ||
      prev.display_name !== next.display_name ||
      prev.avatar_url !== next.avatar_url
    ) {
      return false
    }
  }

  return true
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

function hasRepeatedChars(text: string): boolean {
  return /(.)\1{4,}/u.test(text)
}

function getNotesViewport(): NotesViewport {
  if (typeof window === 'undefined') return 'mobile'
  if (window.matchMedia('(min-width: 1024px)').matches) return 'desktop'
  if (window.matchMedia('(min-width: 640px)').matches) return 'tablet'
  return 'mobile'
}

export default function CommunityNotesWall() {
  const router = useRouter()
  const [meId, setMeId] = useState<string | null>(null)
  const [isAdmin, setIsAdmin] = useState(false)
  const [authChecked, setAuthChecked] = useState(false)
  const [notes, setNotes] = useState<NoteRow[]>([])
  const [loading, setLoading] = useState(true)

  const [rtStatus, setRtStatus] = useState<'INIT' | 'SUBSCRIBED' | 'CLOSED' | 'ERROR'>('INIT')
  const [highlightId, setHighlightId] = useState<string | null>(null)

  const [openMenuId, setOpenMenuId] = useState<string | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<NoteRow | null>(null)
  const [deleteReason, setDeleteReason] = useState('')
  const [deleting, setDeleting] = useState(false)

  const [body, setBody] = useState('')
  const [posting, setPosting] = useState(false)
  const [myLastUpdatedAt, setMyLastUpdatedAt] = useState<string | null>(null)
  const [validationError, setValidationError] = useState<string | null>(null)
  const [viewport, setViewport] = useState<NotesViewport | null>(null)

  const lastPostedIdRef = useRef<string | null>(null)
  const desktopViewport = viewport === 'desktop'

  const [nowMs, setNowMs] = useState(() => Date.now())
  const remainingSeconds = useMemo(() => {
    if (!myLastUpdatedAt) return 0
    const last = new Date(myLastUpdatedAt).getTime()
    const elapsed = (nowMs - last) / 1000
    return Math.max(0, Math.ceil(COOLDOWN_SECONDS - elapsed))
  }, [myLastUpdatedAt, nowMs])

  const cooldown = remainingSeconds > 0

  useEffect(() => {
    if (!myLastUpdatedAt) return

    const intervalMs = cooldown ? 1000 : 60_000
    setNowMs(Date.now())
    const t = window.setInterval(() => setNowMs(Date.now()), intervalMs)
    return () => window.clearInterval(t)
  }, [cooldown, myLastUpdatedAt])

  const desktopColumns = useMemo(
    () => [
      notes.filter((_, i) => i % 3 === 0),
      notes.filter((_, i) => i % 3 === 1),
      notes.filter((_, i) => i % 3 === 2),
    ],
    [notes],
  )

  const tabletColumns = useMemo(
    () => [
      notes.filter((_, i) => i % 2 === 0),
      notes.filter((_, i) => i % 2 === 1),
    ],
    [notes],
  )

  useEffect(() => {
    const mqDesktop = window.matchMedia('(min-width: 1024px)')
    const mqTablet = window.matchMedia('(min-width: 640px)')
    const applyViewport = () => {
      const next = getNotesViewport()
      setViewport((prev) => (prev === next ? prev : next))
    }

    applyViewport()

    if (typeof mqDesktop.addEventListener === 'function') {
      mqDesktop.addEventListener('change', applyViewport)
      mqTablet.addEventListener('change', applyViewport)
      return () => {
        mqDesktop.removeEventListener('change', applyViewport)
        mqTablet.removeEventListener('change', applyViewport)
      }
    }

    mqDesktop.addListener(applyViewport)
    mqTablet.addListener(applyViewport)
    return () => {
      mqDesktop.removeListener(applyViewport)
      mqTablet.removeListener(applyViewport)
    }
  }, [])

  async function loadMe() {
    const resolved = await waitForClientSession()
    if (resolved.status !== 'authenticated') {
      setMeId(null)
      setAuthChecked(true)
      router.replace(buildLoginRedirect('/notes'))
      return null
    }

    setMeId(resolved.user.id)
    setAuthChecked(true)
    return resolved.user.id
  }

  async function loadAdminFlag() {
    try {
      const res = await adminFetch('/api/me/roles')
      const roles = await res.json() as { isAdmin?: boolean; isMod?: boolean }
      setIsAdmin(!!(roles.isAdmin || roles.isMod))
    } catch {
      setIsAdmin(false)
    }
  }

  useEffect(() => {
    if (!openMenuId) return
    const onDown = (e: MouseEvent | TouchEvent) => {
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

  const loadNotes = useCallback(async (silent = false) => {
    if (!silent) setLoading(true)

    const { data, error } = await supabase
      .from('community_notes_feed')
      .select('id,user_id,body,created_at,updated_at,username,display_name,avatar_url')
      .order('updated_at', { ascending: false })
      .limit(200)

    if (!silent) setLoading(false)

    if (error) return

    const nextNotes = sortNotesByUpdatedAtDesc((data as NoteRow[]) ?? [])
    setNotes((prev) => (sameNoteSnapshot(prev, nextNotes) ? prev : nextNotes))
  }, [])

  const loadMyNote = useCallback(async (uid: string | null = meId) => {
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
  }, [meId])

  useEffect(() => {
    const refreshNotesFromProfileUpdate = (payload: ProfileRefreshPayload | null) => {
      if (!payload?.userId) return
      void loadNotes(true)

      if (payload.userId === meId) {
        void loadMyNote(payload.userId)
      }
    }

    const onWindowEvent = (event: Event) => {
      const detail = (event as CustomEvent<ProfileRefreshPayload>).detail
      refreshNotesFromProfileUpdate(detail ?? null)
    }

    const onStorage = (event: StorageEvent) => {
      if (event.key !== PROFILE_REFRESH_STORAGE_KEY || !event.newValue) return
      refreshNotesFromProfileUpdate(readProfileRefreshPayload())
    }

    window.addEventListener(PROFILE_REFRESH_EVENT, onWindowEvent as EventListener)
    window.addEventListener('storage', onStorage)

    let channel: BroadcastChannel | null = null

    if ('BroadcastChannel' in window) {
      try {
        channel = new BroadcastChannel(PROFILE_REFRESH_CHANNEL)
        channel.onmessage = (event) => {
          refreshNotesFromProfileUpdate((event.data as ProfileRefreshPayload | null) ?? null)
        }
      } catch {
        channel = null
      }
    }

    return () => {
      window.removeEventListener(PROFILE_REFRESH_EVENT, onWindowEvent as EventListener)
      window.removeEventListener('storage', onStorage)
      channel?.close()
    }
  }, [loadMyNote, loadNotes, meId])

  useEffect(() => {
    let ch: ReturnType<typeof supabase.channel> | null = null

    ;(async () => {
      const uid = await loadMe()
      if (!uid) return
      await Promise.all([loadNotes(), loadMyNote(uid), loadAdminFlag()])

      ch = supabase
        .channel('community_notes_changes')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'community_notes' }, async (payload) => {
          const p = payload as RealtimePostgresChangesPayload<{ id: string; user_id: string; updated_at: string }>
          const eventType = p.eventType

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

          if (userId === uid && updatedAt) {
            setMyLastUpdatedAt(updatedAt)
          }

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
  }, [loadNotes, meId, rtStatus])

  async function handlePost() {
    if (!meId) {
      router.push(buildLoginRedirect('/notes'))
      return
    }

    const normalized = body.replace(/\r\n/g, '\n')
    const trimmed = normalized.trim()
    if (!trimmed) return

    if (trimmed.length > NOTE_MAX) {
      alert(`הפתק ארוך מדי (מקסימום ${NOTE_MAX} תווים).`)
      return
    }

    if (hasRepeatedChars(trimmed)) {
      setValidationError('אותיות חוזרות אינן מותרות (לדוגמה: חחחחח)')
      return
    }

    setValidationError(null)
    setPosting(true)
    const { data, error } = await supabase.rpc('upsert_community_note', { body: trimmed })
    setPosting(false)

    if (error) {
      const msg = (error.message || '').toLowerCase()
      const remaining = Number(error.details)
      if (msg.includes('cooldown') && Number.isFinite(remaining)) {
        alert(`אפשר לפרסם שוב בעוד ${secondsToClock(remaining)} דקות 🙂`)
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

    setNotes((prev) => {
      const idx = prev.findIndex((n) => n.user_id === row.user_id)
      if (idx >= 0) {
        const copy = prev.slice()
        copy[idx] = { ...copy[idx], body: row.body, updated_at: row.updated_at, created_at: row.created_at }
        const [picked] = copy.splice(idx, 1)
        return sortNotesByUpdatedAtDesc([picked, ...copy])
      }
      return prev
    })

    void loadNotes(true)
  }

  async function handleOpenChat(note: NoteRow) {
    if (!meId) {
      router.push(buildLoginRedirect('/notes'))
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
    let deleteOk = false
    try {
      const res = await adminFetch('/api/admin/notes/delete', {
        method: 'POST',
        body: JSON.stringify({ note_id: deleteTarget.id, reason }),
      })
      if (res.status === 403) {
        alert('אין לך הרשאה למחוק פתקים.')
        setIsAdmin(false)
        setDeleteTarget(null)
        setDeleteReason('')
        setDeleting(false)
        return
      }
      if (!res.ok) {
        const body = await res.json().catch(() => ({})) as Record<string, unknown>
        const err = body.error as Record<string, unknown> | undefined
        if (err?.code === 'reason_required') {
          alert('חובה לציין סיבה למחיקה.')
          setDeleting(false)
          return
        }
        alert('שגיאה במחיקה')
        setDeleting(false)
        return
      }
      deleteOk = true
    } catch {
      alert('שגיאה במחיקה')
      setDeleting(false)
      return
    }
    setDeleting(false)
    if (!deleteOk) return

    setNotes((prev) => prev.filter((n) => n.id !== deleteTarget.id))
    setDeleteTarget(null)
    setDeleteReason('')
  }

  return (
    <section className="space-y-5" dir="rtl">
      {!authChecked ? (
        <div className="rounded-3xl border border-black/5 bg-[#FAF9F6]/80 p-6 text-sm text-muted-foreground shadow-sm backdrop-blur dark:border-white/10 dark:bg-card/80">
          טוען…
        </div>
      ) : null}

      {/* Header + Composer */}
      <div
        className={[
          'isolate rounded-3xl border border-black/5 shadow-sm dark:border-white/10',
          desktopViewport
            ? 'bg-[#FAF9F6]/95 dark:bg-card/95'
            : 'bg-[#FAF9F6]/90 backdrop-blur dark:bg-card/90',
        ].join(' ')}
      >
        <div className="px-5 py-4">
          {/* Title row */}
          <div className="flex items-start justify-between gap-3">
            <div>
              <h1 className="text-xl font-black tracking-tight">פתקים מהקהילה</h1>
              <p className="mt-0.5 text-sm text-muted-foreground">
                משפט או שניים — משהו קטן להשאיר לאחרים.
              </p>
            </div>

            <div className="hidden sm:flex items-center gap-2 text-xs text-muted-foreground pt-0.5">
              <span className="rounded-full border border-black/10 bg-white/60 px-2.5 py-1 dark:border-white/10 dark:bg-muted/60">
                מקס׳ {NOTE_MAX} תווים
              </span>
              <span className="rounded-full border border-black/10 bg-white/60 px-2.5 py-1 dark:border-white/10 dark:bg-muted/60">
                קולדאון 10 דק׳
              </span>
            </div>
          </div>

          {/* Premium composer */}
          <div className="isolate mt-4 overflow-hidden rounded-2xl border border-amber-300/40 bg-white/80 shadow-[inset_0_1px_3px_0_rgb(0,0,0,0.04)] dark:border-amber-700/20 dark:bg-muted/60">
            {/* Notepad accent strip */}
            <div className="h-1 w-full bg-gradient-to-l from-amber-400/70 via-amber-300/50 to-amber-400/70 dark:from-amber-600/40 dark:via-amber-500/30 dark:to-amber-600/40" />

            <div className="px-4 pt-3 pb-3">
              <textarea
                value={body}
                onChange={(e) => {
                  setBody(e.target.value)
                  if (validationError) setValidationError(null)
                }}
                placeholder={meId ? 'מה עובר עליך עכשיו?' : 'כדי לפרסם פתק צריך להתחבר 🙂'}
                maxLength={NOTE_MAX}
                rows={3}
                className="w-full resize-none bg-transparent text-sm leading-relaxed outline-none placeholder:text-muted-foreground/70"
                dir="rtl"
                disabled={!meId || posting}
              />

              {/* Validation error */}
              {validationError ? (
                <p className="mb-2 text-xs text-red-500 dark:text-red-400">{validationError}</p>
              ) : null}

              {/* Composer footer */}
              <div className="flex items-center justify-between gap-3 border-t border-black/5 pt-2.5 dark:border-white/5">
                {/* Char count + cooldown — bottom-right in RTL */}
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  {cooldown ? (
                    <span className="rounded-full border border-black/10 bg-white/60 px-2 py-0.5 dark:border-white/10 dark:bg-muted/60">
                      אפשר שוב בעוד {secondsToClock(remainingSeconds)}
                    </span>
                  ) : null}
                  <span
                    className={
                      body.trim().length > NOTE_MAX * 0.9
                        ? 'text-amber-600 dark:text-amber-400 font-medium'
                        : ''
                    }
                  >
                    {body.trim().length}/{NOTE_MAX}
                  </span>
                </div>

                <button
                  onClick={handlePost}
                  disabled={!meId || posting || cooldown || !body.trim()}
                  className="rounded-full bg-black px-5 py-2 text-sm font-semibold text-white transition-opacity disabled:opacity-40 dark:bg-white dark:text-black"
                >
                  {posting ? 'מפרסם…' : cooldown ? 'המתן…' : 'פרסם פתק'}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Notes wall */}
      <div
        className={[
          'isolate rounded-3xl border border-black/5 p-4 shadow-sm dark:border-white/10',
          desktopViewport
            ? 'bg-[#FAF9F6]/94 dark:bg-card/94'
            : 'bg-[#FAF9F6]/80 backdrop-blur dark:bg-card/80',
        ].join(' ')}
        style={{ contain: 'paint' }}
      >
        {loading ? (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3" dir="rtl">
            {Array.from({ length: 9 }).map((_, i) => (
              <div
                key={i}
                className="h-28 animate-pulse rounded-2xl border border-black/10 bg-white/60 dark:border-white/10 dark:bg-muted/40"
              />
            ))}
          </div>
        ) : notes.length === 0 ? (
          <div className="p-8 text-center text-sm text-muted-foreground">
            עדיין אין פתקים. תהיה הראשון להשאיר משהו 🙂
          </div>
        ) : (() => {
            const renderCard = (n: NoteRow) => {
              const mine = meId && n.user_id === meId
              const ttlUpdatedAt = mine && myLastUpdatedAt ? myLastUpdatedAt : n.updated_at
              const expiresInSeconds = mine
                ? Math.max(0, NOTE_TTL_SECONDS - Math.floor((nowMs - new Date(ttlUpdatedAt).getTime()) / 1000))
                : 0
              const expiresText = mine && expiresInSeconds > 0 ? secondsToHumanHe(expiresInSeconds) : null
              const highlighted = lastPostedIdRef.current === n.id || highlightId === n.id

              return (
                <div
                  key={n.id}
                  style={{
                    contentVisibility: 'auto',
                    containIntrinsicSize: '180px',
                    contain: 'layout paint style',
                  }}
                  className={[
                    'group relative text-right w-full rounded-2xl border p-4',
                    'bg-gradient-to-b from-card to-amber-50/10 dark:from-card dark:to-amber-900/5',
                    'shadow-sm tyuta-card-hover',
                    'transition-[box-shadow,transform,border-color] duration-200',
                    mine ? 'opacity-95 cursor-default' : 'cursor-pointer',
                    highlighted
                      ? "border-amber-300/55 dark:border-amber-500/30 after:pointer-events-none after:absolute after:inset-0 after:rounded-[inherit] after:content-[''] after:shadow-[inset_0_0_0_1px_rgba(245,158,11,0.18)] dark:after:shadow-[inset_0_0_0_1px_rgba(245,158,11,0.14)]"
                      : 'border-border/60',
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
                      <AuthorHover username={n.username}>
                        <Link href={`/u/${n.username}`} prefetch={false} onClick={(e) => e.stopPropagation()}>
                          <Avatar src={n.avatar_url} name={n.display_name || n.username} size={34} />
                        </Link>
                      </AuthorHover>
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <AuthorHover username={n.username}>
                          <Link
                            href={`/u/${n.username}`}
                            prefetch={false}
                            className="truncate text-sm font-bold no-underline hover:no-underline tyuta-hover"
                            onClick={(e) => e.stopPropagation()}
                            title="לפרופיל"
                          >
                            {n.display_name || n.username}
                          </Link>
                        </AuthorHover>
                        <div className="shrink-0 text-left">
                          <div className="text-xs text-muted-foreground">{heRelativeTime(n.updated_at)}</div>
                          {expiresText ? (
                            <div className="mt-0.5 text-[11px] text-muted-foreground">יימחק בעוד {expiresText}</div>
                          ) : null}
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleOpenChat(n)}
                        disabled={!!mine}
                        className={[
                          'mt-2 w-full text-right text-sm leading-relaxed text-black/90 dark:text-foreground/90',
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
            }

            // lg: 3 flex columns, row-first reading order (newest → top-right, next → top-mid, next → top-left)
            // Each column gets every 3rd note: col0=[0,3,6…], col1=[1,4,7…], col2=[2,5,8…]
            const col0 = desktopColumns[0]
            const col1 = desktopColumns[1]
            const col2 = desktopColumns[2]

            // sm: 2 flex columns, same row-first logic
            const sm0 = tabletColumns[0]
            const sm1 = tabletColumns[1]

            return (
              <>
                {/* Desktop (lg+): 3 masonry columns, row-first */}
                <div className="hidden lg:flex flex-row gap-3" dir="rtl">
                  <div className="flex flex-col gap-3 flex-1" style={{ contain: 'layout paint' }}>{col0.map(renderCard)}</div>
                  <div className="flex flex-col gap-3 flex-1" style={{ contain: 'layout paint' }}>{col1.map(renderCard)}</div>
                  <div className="flex flex-col gap-3 flex-1" style={{ contain: 'layout paint' }}>{col2.map(renderCard)}</div>
                </div>

                {/* Tablet (sm–lg): 2 masonry columns, row-first */}
                <div className="hidden sm:flex lg:hidden flex-row gap-3" dir="rtl">
                  <div className="flex flex-col gap-3 flex-1" style={{ contain: 'layout paint' }}>{sm0.map(renderCard)}</div>
                  <div className="flex flex-col gap-3 flex-1" style={{ contain: 'layout paint' }}>{sm1.map(renderCard)}</div>
                </div>

                {/* Mobile: single column */}
                <div className="flex sm:hidden flex-col gap-3" dir="rtl" style={{ contain: 'layout paint' }}>
                  {notes.map(renderCard)}
                </div>
              </>
            )
          })()
        }
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

'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'

type Reaction = {
  key: string
  label_he: string
  channel_id: number | null
  sort_order: number
}

type SummaryRow = {
  post_id: string
  reaction_key: string
  votes: number
  bronze: number
  silver: number
  gold: number
}

type ReactionVoteRow = {
  post_id: string
  reaction_key: string
  voter_id: string
}

type Props = {
  postId: string
  channelId: number
  authorId: string
  onMedalsChange?: (totals: { gold: number; silver: number; bronze: number }) => void
}

const REACTION_EMOJI: Record<string, string> = {
  funny: '😄',
  moving: '🥹',
  creative: '🎨',
  relatable: '🫂',
  inspiring: '✨',
  gripping: '📖',
  well_written: '✍️',
  smart: '🧠',
  interesting: '👀',
}

export default function PostReactions({ postId, channelId, authorId, onMedalsChange }: Props) {
  const [loading, setLoading] = useState(true)
  const [userId, setUserId] = useState<string | null>(null)

  const [reactions, setReactions] = useState<Reaction[]>([])
  const [summary, setSummary] = useState<Record<string, SummaryRow>>({})
  const [myVotes, setMyVotes] = useState<Set<string>>(new Set())
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const errTimerRef = useRef<number | null>(null)

  const [animatingKey, setAnimatingKey] = useState<string | null>(null)

  const myVotesCount = myVotes.size

  const sortedReactions = useMemo(
    () => [...reactions].sort((a, b) => a.sort_order - b.sort_order),
    [reactions]
  )

  // IMPORTANT: medals must be computed from the TOTAL votes across all reaction keys,
  // using the project's base-4 reset rules.
  const calcMedalsReset4 = (votesTotal: number) => {
    // 4 votes => 1 bronze unit
    // 4 bronze units => 1 silver (bronze resets)
    // 4 silver units => 1 gold (silver resets)
    const bronzeUnits = Math.floor(votesTotal / 4)
    const bronze = bronzeUnits % 4
    const silverUnits = Math.floor(bronzeUnits / 4)
    const silver = silverUnits % 4
    const gold = Math.floor(silverUnits / 4)
    return { gold: Math.min(gold, 6), silver, bronze }
  }

  const totals = useMemo(() => {
    const votesTotal = Object.values(summary).reduce((acc, s) => acc + (s.votes ?? 0), 0)
    return calcMedalsReset4(votesTotal)
  }, [summary])

  const onMedalsRef = useRef(onMedalsChange)
  useEffect(() => { onMedalsRef.current = onMedalsChange })
  useEffect(() => { onMedalsRef.current?.(totals) }, [totals])

  useEffect(() => {
    if (!errorMsg) return

    if (errTimerRef.current) window.clearTimeout(errTimerRef.current)

    errTimerRef.current = window.setTimeout(() => {
      setErrorMsg(null)
    }, 2000)

    return () => {
      if (errTimerRef.current) window.clearTimeout(errTimerRef.current)
    }
  }, [errorMsg])

  // keep latest userId without re-subscribing
  const userIdRef = useRef<string | null>(null)
  useEffect(() => {
    userIdRef.current = userId
  }, [userId])

  // --------
  // Fetch summary only (truth from DB)
  // --------
  const fetchSummaryOnly = useCallback(async () => {
    if (!postId) return

    const { data: sum, error } = await supabase
      .from('post_reaction_summary')
      .select('post_id, reaction_key, votes, bronze, silver, gold')
      .eq('post_id', postId)

    if (error) return

    const map: Record<string, SummaryRow> = {}
    ;(sum ?? []).forEach(r => {
      const row = r as SummaryRow
      map[row.reaction_key] = row
    })
    setSummary(map)
  }, [postId])

  // debounce sync on realtime bursts
  const syncTimerRef = useRef<number | null>(null)

  const scheduleSync = useCallback(() => {
    if (syncTimerRef.current) {
      window.clearTimeout(syncTimerRef.current)
    }

    syncTimerRef.current = window.setTimeout(() => {
      fetchSummaryOnly()
    }, 120)
  }, [fetchSummaryOnly])

  // --------
  // Initial load (full)
  // --------
  useEffect(() => {
    if (!postId) return
    let cancelled = false

    const loadAll = async () => {
      setLoading(true)
      setErrorMsg(null)

      const { data: auth } = await supabase.auth.getUser()
      if (cancelled) return
      const u = auth.user
      setUserId(u?.id ?? null)

      const { data: rx, error: rxErr } = await supabase
        .from('reactions')
        .select('key, label_he, channel_id, sort_order')
        .eq('is_active', true)
        .or(`channel_id.is.null,channel_id.eq.${channelId}`)

      if (cancelled) return
      if (rxErr) {
        setErrorMsg(rxErr.message)
        setLoading(false)
        return
      }
      setReactions((rx ?? []) as Reaction[])

      await fetchSummaryOnly()
      if (cancelled) return

      if (u?.id) {
        const { data: mv, error: mvErr } = await supabase
          .from('post_reaction_votes')
          .select('reaction_key')
          .eq('post_id', postId)
          .eq('voter_id', u.id)

        if (cancelled) return
        if (mvErr) {
          setErrorMsg(mvErr.message)
          setLoading(false)
          return
        }

        setMyVotes(new Set((mv ?? []).map(x => (x as { reaction_key: string }).reaction_key)))
      } else {
        setMyVotes(new Set())
      }

      setLoading(false)
    }

    void loadAll()

    return () => {
      cancelled = true
      if (syncTimerRef.current) window.clearTimeout(syncTimerRef.current)
    }
  }, [postId, channelId, fetchSummaryOnly])

  // --------
  // Realtime: on ANY change -> schedule DB sync
  // --------
  useEffect(() => {
    if (!postId) return

    const ch = supabase
      .channel(`post-reactions-${postId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'post_reaction_votes',
          filter: `post_id=eq.${postId}`,
        },
        payload => {
          const row =
            (payload.eventType === 'DELETE' ? payload.old : payload.new) as ReactionVoteRow | null
          if (!row) return

          // ignore events from myself (I already do optimistic UI)
          if (userIdRef.current && row.voter_id === userIdRef.current) return

          scheduleSync()
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(ch)
    }
  }, [postId, scheduleSync])

  // --------
  // Optimistic helper (this client only)
  // --------
  const optimisticDelta = (reactionKey: string, delta: 1 | -1) => {
    setSummary(prev => {
      const curVotes = prev[reactionKey]?.votes ?? 0
      const votes = Math.max(0, curVotes + delta)

      // Do NOT compute medals client-side.
      // Keep the last known medals from the DB payload and let fetchSummaryOnly() resync.
      const prevRow = prev[reactionKey]
      const medals = {
        gold: prevRow?.gold ?? 0,
        silver: prevRow?.silver ?? 0,
        bronze: prevRow?.bronze ?? 0,
      }
      return {
        ...prev,
        [reactionKey]: { post_id: postId, reaction_key: reactionKey, votes, ...medals },
      }
    })
  }

  // --------
  // Toggle
  // --------
  const toggle = async (reactionKey: string) => {
    setErrorMsg(null)

    setAnimatingKey(reactionKey)
    window.setTimeout(() => setAnimatingKey(null), 220)

    if (!userId) {
      setErrorMsg('צריך להתחבר כדי לדרג')
      return
    }
    if (userId === authorId) {
      setErrorMsg('אי אפשר לדרג פוסט של עצמך')
      return
    }

    const has = myVotes.has(reactionKey)

    if (has) {
      setMyVotes(prev => {
        const n = new Set(prev)
        n.delete(reactionKey)
        return n
      })
      optimisticDelta(reactionKey, -1)

      const { error } = await supabase
        .from('post_reaction_votes')
        .delete()
        .eq('post_id', postId)
        .eq('voter_id', userId)
        .eq('reaction_key', reactionKey)

      if (error) {
        // rollback
        setMyVotes(prev => new Set(prev).add(reactionKey))
        optimisticDelta(reactionKey, 1)
        setErrorMsg(error.message)
        return
      }

      void fetchSummaryOnly()
      return
    }

    if (myVotesCount >= 3) {
      setErrorMsg('אפשר לבחור עד 3 דירוגים לפוסט')
      return
    }

    setMyVotes(prev => new Set([...prev, reactionKey]))
    optimisticDelta(reactionKey, 1)

    const { error } = await supabase.from('post_reaction_votes').insert({
      post_id: postId,
      voter_id: userId,
      reaction_key: reactionKey,
    })

    if (error) {
      // rollback
      setMyVotes(prev => {
        const n = new Set(prev)
        n.delete(reactionKey)
        return n
      })
      optimisticDelta(reactionKey, -1)

      const msg = String(error.message).toLowerCase()
      if (msg.includes('max 3 reactions')) setErrorMsg('אפשר לבחור עד 3 דירוגים לפוסט')
      else if (msg.includes('own post')) setErrorMsg('אי אפשר לדרג פוסט של עצמך')
      else setErrorMsg(error.message)
      return
    }

    void fetchSummaryOnly()
  }

  if (loading) {
    return (
      <div className="mt-4 text-right text-sm text-neutral-600 dark:text-muted-foreground" dir="rtl">
        טוען דירוגים…
      </div>
    )
  }

  return (
    <section className="text-right" dir="rtl">
      <div className="flex flex-col items-stretch">
        <div className="flex items-center justify-between gap-3">
          <div className="text-[15px] font-black text-neutral-950 dark:text-foreground">דירוגים:</div>
          <div className="whitespace-nowrap text-[12px] text-neutral-600 dark:text-muted-foreground">
            {myVotesCount}/3 נבחרו
          </div>
        </div>

        {errorMsg ? (
          <div className="mt-3 rounded-2xl border border-red-200 dark:border-red-800/40 bg-red-50 dark:bg-red-950/30 px-3 py-2 text-[13px] text-red-800 dark:text-red-300">
            {errorMsg}
          </div>
        ) : null}

        {/*
          מובייל: שורה אחת (scroll אופקי עדין אם אין מקום)
          דסקטופ: wrap רגיל במרכז
        */}
        <div className="mt-4 flex flex-nowrap justify-center gap-2 overflow-x-auto pb-1 md:flex-wrap md:overflow-visible">
          {sortedReactions.map(r => {
            const votes = summary[r.key]?.votes ?? 0
            const mine = myVotes.has(r.key)
            const isAnimating = animatingKey === r.key

            return (
              <button
                key={r.key}
                type="button"
                onClick={() => toggle(r.key)}
                className={[
                  'group inline-flex min-w-[58px] max-w-[120px] flex-col items-center justify-center rounded-2xl border px-2 py-1 text-center transition-all duration-150 ease-out md:min-w-[74px] md:px-3 md:py-2',
                  mine
                    ? 'border-neutral-900 bg-neutral-900 text-white'
                    : 'border-neutral-200 bg-white text-neutral-900 hover:bg-neutral-50 dark:border-border dark:bg-card dark:text-foreground dark:hover:bg-muted',
                ].join(' ')}
                style={{
                  transform: isAnimating ? 'scale(1.12)' : 'scale(1)',
                }}
              >
                <div className="flex items-center justify-center gap-1.5 text-[15px] leading-none md:text-[18px]">
                  <span className="drop-shadow-sm">{REACTION_EMOJI[r.key] ?? '⭐'}</span>
                  {votes > 0 ? (
                    <span className={mine ? 'text-[11px] text-white/80 md:text-[12px]' : 'text-[11px] text-neutral-600 dark:text-muted-foreground md:text-[12px]'}>
                      {votes}
                    </span>
                  ) : null}
                </div>
                <div
                  className={
                    mine
                      ? 'mt-1 text-[10px] font-semibold text-white md:text-[12px]'
                      : 'mt-1 text-[10px] font-semibold text-neutral-800 dark:text-foreground md:text-[12px]'
                  }
                >
                  {r.label_he}
                </div>
              </button>
            )
          })}
        </div>

        <div className="mt-3 text-center text-[12px] leading-5 text-neutral-600 dark:text-muted-foreground">
          בחר עד 3 דירוגים לפוסט, אפשר לבטל בלחיצה נוספת.
        </div>
      </div>
    </section>
  )
}

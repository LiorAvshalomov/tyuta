'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { LockKeyhole, MessageCircleMore, ShieldCheck } from 'lucide-react'
import ChatClient from '@/components/ChatClient'
import Avatar from '@/components/Avatar'
import { getSupportConversationId, setSupportConversationId } from '@/lib/moderation'
import { supabase } from '@/lib/supabaseClient'
import { mapModerationRpcError } from '@/lib/mapSupabaseError'
import { getResolvedSession } from '@/lib/auth/getResolvedSession'
import { SYSTEM_AVATAR, SYSTEM_DISPLAY_NAME } from '@/lib/systemIdentity'

const SYSTEM_USER_ID = (process.env.NEXT_PUBLIC_SYSTEM_USER_ID ?? '').trim()

export default function BannedContactPage() {
  const router = useRouter()
  const [ready, setReady] = useState(false)
  const [conversationId, setConversationId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    return () => {
      document.body.style.overflow = previousOverflow
    }
  }, [])

  useEffect(() => {
    let cancelled = false

    async function run() {
      const session = await getResolvedSession()
      if (!session?.user?.id) {
        router.replace('/')
        return
      }

      const { data: moderation, error: moderationError } = await supabase
        .from('user_moderation')
        .select('is_banned, is_suspended')
        .eq('user_id', session.user.id)
        .maybeSingle()

      if (cancelled) return

      if (moderationError) {
        router.replace('/')
        return
      }

      if (moderation?.is_banned !== true) {
        router.replace(moderation?.is_suspended ? '/restricted' : '/')
        return
      }

      if (!SYSTEM_USER_ID) {
        setError('חסר מזהה משתמש מערכת.')
        setReady(true)
        return
      }

      const existing = getSupportConversationId()
      if (existing) {
        setConversationId(existing)
        setReady(true)
        return
      }

      const { data, error: rpcError } = await supabase.rpc('start_conversation', {
        other_user_id: SYSTEM_USER_ID,
      })

      if (cancelled) return

      if (rpcError) {
        const friendly = mapModerationRpcError(rpcError.message ?? '')
        setError(friendly ?? 'שגיאה ביצירת שיחה עם מערכת האתר.')
        setReady(true)
        return
      }

      const cid = typeof data === 'string' && data.trim() ? data.trim() : null
      if (!cid) {
        setError('לא התקבל מזהה שיחה ממערכת האתר.')
        setReady(true)
        return
      }

      setSupportConversationId(cid)
      setConversationId(cid)
      setReady(true)
    }

    void run()

    return () => {
      cancelled = true
    }
  }, [router])

  if (!ready) {
    return (
      <div
        className="overflow-hidden bg-[radial-gradient(circle_at_top_right,rgba(239,68,68,0.16),transparent_24%),radial-gradient(circle_at_bottom_left,rgba(59,108,227,0.12),transparent_28%),#050505] px-3 py-3 text-white md:px-4 md:py-4"
        style={{ height: 'var(--vvh, 100dvh)' }}
        dir="rtl"
      >
        <div className="mx-auto flex h-full max-w-6xl flex-col gap-3 overflow-hidden">
          <div className="flex items-center justify-between gap-3">
            <div className="h-11 w-24 animate-pulse rounded-full border border-white/10 bg-white/5" />
            <div className="h-8 w-28 animate-pulse rounded-full border border-white/10 bg-white/5" />
          </div>
          <div className="min-h-0 flex-1 rounded-[32px] border border-white/10 bg-white/[0.04] p-3 shadow-[0_24px_80px_-32px_rgba(0,0,0,0.75)] backdrop-blur md:p-4">
            <div className="grid h-full min-h-0 gap-3 lg:grid-cols-[320px_minmax(0,1fr)]">
              <div className="hidden space-y-3 lg:block">
                <div className="h-36 animate-pulse rounded-[28px] bg-white/5" />
                <div className="h-56 animate-pulse rounded-[26px] bg-white/5" />
              </div>
              <div className="min-h-0 animate-pulse rounded-[28px] border border-white/8 bg-[#111112]" />
            </div>
          </div>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div
        className="flex items-center justify-center overflow-hidden bg-[radial-gradient(circle_at_top_right,rgba(239,68,68,0.14),transparent_24%),#050505] px-6"
        style={{ height: 'var(--vvh, 100dvh)' }}
        dir="rtl"
      >
        <div className="w-full max-w-md rounded-[28px] border border-white/10 bg-white/5 p-6 text-right shadow-[0_24px_80px_-32px_rgba(0,0,0,0.75)] backdrop-blur">
          <div className="text-lg font-extrabold">יש בעיה</div>
          <p className="mt-2 text-sm text-white/80">{error}</p>
          <button
            onClick={() => router.replace('/banned')}
            className="mt-5 w-full rounded-full bg-white px-4 py-2 text-sm font-bold text-black hover:opacity-90"
          >
            חזרה
          </button>
        </div>
      </div>
    )
  }

  if (!conversationId) return null

  return (
    <div
      className="overflow-hidden bg-[radial-gradient(circle_at_top_right,rgba(239,68,68,0.16),transparent_24%),radial-gradient(circle_at_bottom_left,rgba(59,108,227,0.12),transparent_28%),#050505] px-3 py-3 text-white md:px-4 md:py-4"
      style={{ height: 'var(--vvh, 100dvh)' }}
      dir="rtl"
    >
      <div className="mx-auto flex h-full max-w-6xl flex-col gap-3 overflow-hidden">
        <div className="flex shrink-0 items-center justify-between gap-3">
          <button
            type="button"
            onClick={() => router.replace('/banned')}
            className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-4 py-2 text-sm font-bold transition hover:bg-white/10"
          >
            חזרה
          </button>

          <div className="rounded-full border border-red-500/20 bg-red-500/10 px-3 py-1.5 text-xs font-bold text-red-100">
            ערוץ תמיכה חסום
          </div>
        </div>

        <div className="min-h-0 flex-1 rounded-[32px] border border-white/10 bg-white/[0.04] p-3 shadow-[0_24px_80px_-32px_rgba(0,0,0,0.75)] backdrop-blur md:p-4">
          <div className="grid h-full min-h-0 gap-3 lg:grid-cols-[320px_minmax(0,1fr)]">
            <aside className="hidden min-h-0 lg:flex lg:flex-col lg:gap-3">
              <div className="rounded-[28px] border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.08),rgba(255,255,255,0.04))] p-5">
                <div className="flex items-start gap-3">
                  <Avatar src={SYSTEM_AVATAR} name={SYSTEM_DISPLAY_NAME} size={52} shape="square" />
                  <div className="min-w-0 flex-1">
                    <div className="text-xs font-bold tracking-[0.22em] text-white/45">SUPPORT CHANNEL</div>
                    <h1 className="mt-1 text-xl font-black text-white">שיחה עם {SYSTEM_DISPLAY_NAME}</h1>
                    <p className="mt-2 text-sm leading-6 text-white/70">
                      כאן אפשר לכתוב ישירות לצוות האתר לגבי החסימה. השיחה פרטית,
                      מסודרת, ונשמרת רק מול משתמש המערכת.
                    </p>
                  </div>
                </div>
              </div>

              <div className="rounded-[26px] border border-white/10 bg-black/20 p-4">
                <div className="space-y-3">
                  <div className="flex items-start gap-3">
                    <div className="mt-0.5 rounded-2xl bg-white/8 p-2 text-white/80">
                      <LockKeyhole size={16} />
                    </div>
                    <div>
                      <div className="text-sm font-bold text-white">שיחה סגורה למערכת בלבד</div>
                      <div className="mt-1 text-xs leading-5 text-white/60">
                        אין כאן חשיפה למשתמשים אחרים, ורק חשבון המערכת מקבל את הפנייה.
                      </div>
                    </div>
                  </div>

                  <div className="flex items-start gap-3">
                    <div className="mt-0.5 rounded-2xl bg-white/8 p-2 text-white/80">
                      <MessageCircleMore size={16} />
                    </div>
                    <div>
                      <div className="text-sm font-bold text-white">כתיבה עניינית עוזרת לטפל מהר יותר</div>
                      <div className="mt-1 text-xs leading-5 text-white/60">
                        כדאי לציין בקצרה מה קרה, למה לדעתך החסימה שגויה, ואם יש הקשר שחשוב לצוות לראות.
                      </div>
                    </div>
                  </div>

                  <div className="flex items-start gap-3">
                    <div className="mt-0.5 rounded-2xl bg-white/8 p-2 text-white/80">
                      <ShieldCheck size={16} />
                    </div>
                    <div>
                      <div className="text-sm font-bold text-white">המערכת נשארת מקצועית ומתועדת</div>
                      <div className="mt-1 text-xs leading-5 text-white/60">
                        כל הפניות נשמרות לצורכי בדיקה ובקרה, כך שקל יותר לחזור למקרה בצורה מדויקת.
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </aside>

            <section className="flex min-h-0 flex-col gap-3">
              <div className="rounded-[26px] border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.08),rgba(255,255,255,0.04))] p-4 lg:hidden">
                <div className="flex items-start gap-3">
                  <Avatar src={SYSTEM_AVATAR} name={SYSTEM_DISPLAY_NAME} size={44} shape="square" />
                  <div className="min-w-0 flex-1">
                    <div className="text-[11px] font-bold tracking-[0.18em] text-white/45">SUPPORT CHANNEL</div>
                    <div className="mt-1 text-lg font-black text-white">שיחה עם {SYSTEM_DISPLAY_NAME}</div>
                    <p className="mt-1 text-sm leading-6 text-white/70">ערוץ פרטי ליצירת קשר עם צוות האתר בנוגע לחסימה.</p>
                  </div>
                </div>
              </div>

              <div className="min-h-0 flex-1 rounded-[28px] border border-white/8 bg-[#0f0f10] p-2 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)] md:p-3">
                <div className="h-full min-h-0 overflow-hidden rounded-[24px]">
                  <ChatClient conversationId={conversationId} />
                </div>
              </div>
            </section>
          </div>
        </div>
      </div>
    </div>
  )
}

'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { supabase } from '@/lib/supabaseClient'
import { setSupportConversationId } from '@/lib/moderation'
import { mapModerationRpcError } from '@/lib/mapSupabaseError'
import { getResolvedSession } from '@/lib/auth/getResolvedSession'

const SYSTEM_USER_ID = process.env.NEXT_PUBLIC_SYSTEM_USER_ID ?? ''

function safePath(value: string | null): string | null {
  if (!value) return null
  return value.startsWith('/') ? value : null
}

export default function RestrictedPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const from = useMemo(() => safePath(searchParams.get('from')), [searchParams])

  const [ready, setReady] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [reason, setReason] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    async function load() {
      const session = await getResolvedSession()
      const uid = session?.user?.id
      if (!uid) {
        router.replace('/')
        return
      }

      const { data: moderation, error: moderationError } = await supabase
        .from('user_moderation')
        .select('is_banned, is_suspended, reason, ban_reason')
        .eq('user_id', uid)
        .maybeSingle()

      if (cancelled) return

      if (moderationError) {
        router.replace('/')
        return
      }

      if (moderation?.is_banned === true) {
        router.replace('/banned')
        return
      }

      if (moderation?.is_suspended !== true) {
        router.replace('/')
        return
      }

      setReason(
        (moderation?.reason as string | null) ??
        (moderation?.ban_reason as string | null) ??
        null,
      )
      setReady(true)
    }

    void load()

    return () => {
      cancelled = true
    }
  }, [router])

  const openSupportChat = async () => {
    setError(null)

    if (!SYSTEM_USER_ID) {
      setError('חסר מזהה משתמש מערכת.')
      return
    }

    setBusy(true)

    try {
      const { data } = await supabase.auth.getSession()
      if (!data.session?.user?.id) {
        router.replace('/auth/login')
        return
      }

      const { data: conversationId, error: rpcError } = await supabase.rpc('start_conversation', {
        other_user_id: SYSTEM_USER_ID,
      })

      if (rpcError) throw rpcError
      if (!conversationId || typeof conversationId !== 'string') {
        throw new Error('השרת לא החזיר מזהה שיחה תקין.')
      }

      setSupportConversationId(conversationId)
      router.push(`/inbox/${encodeURIComponent(conversationId)}`)
    } catch (caught: unknown) {
      const message = caught instanceof Error ? caught.message : 'שגיאה לא ידועה'
      setError(mapModerationRpcError(message) ?? message)
    } finally {
      setBusy(false)
    }
  }

  if (!ready) {
    return <div className="min-h-screen bg-white dark:bg-background" />
  }

  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-10" dir="rtl">
      <div className="rounded-3xl border border-black/5 bg-white/80 p-6 shadow-sm">
        <div className="text-2xl font-black">החשבון הוגבל זמנית</div>

        <p className="mt-2 text-sm text-neutral-700 leading-6">
          החשבון שלך מוגבל כרגע על ידי מערכת האתר. עדיין אפשר להתחבר ולקרוא,
          אבל פעולות כמו כתיבה, שמירה, התראות והגדרות אינן זמינות עד להסרת
          ההגבלה.
        </p>

        {reason ? (
          <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 whitespace-pre-wrap">
            <div className="font-black">סיבת ההגבלה</div>
            <div className="mt-1 text-sm leading-6">{reason}</div>
          </div>
        ) : null}

        {from ? (
          <div className="mt-3 rounded-2xl border border-neutral-200 bg-neutral-50 px-4 py-3 text-xs text-neutral-700">
            ניסית לגשת אל: <span className="font-bold">{from}</span>
          </div>
        ) : null}

        {error ? (
          <div className="mt-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
            {error}
          </div>
        ) : null}

        <div className="mt-6 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={openSupportChat}
            disabled={busy}
            className="rounded-full bg-black px-5 py-2.5 text-sm font-bold text-white disabled:opacity-60"
          >
            {busy ? 'פותח שיחה...' : 'פנייה למערכת'}
          </button>

          <button
            type="button"
            onClick={() => router.replace('/')}
            className="rounded-full border border-black/10 bg-white px-5 py-2.5 text-sm font-bold"
          >
            חזרה לבית
          </button>
        </div>

        <div className="mt-5 text-xs text-neutral-500">
          אם זו טעות, אפשר לפנות למערכת ונבדוק את המקרה.
        </div>
      </div>
    </div>
  )
}

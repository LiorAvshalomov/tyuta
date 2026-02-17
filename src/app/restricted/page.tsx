"use client"

import { useEffect, useMemo, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { supabase } from '@/lib/supabaseClient'
import { getModerationReason, getModerationStatus, setSupportConversationId } from '@/lib/moderation'
import { mapModerationRpcError } from '@/lib/mapSupabaseError'

const SYSTEM_USER_ID = process.env.NEXT_PUBLIC_SYSTEM_USER_ID ?? ''

function safePath(v: string | null): string | null {
  if (!v) return null
  return v.startsWith('/') ? v : null
}

export default function RestrictedPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const from = useMemo(() => safePath(searchParams.get('from')), [searchParams])


  useEffect(() => {
    const status = getModerationStatus()
    if (status === 'banned') {
      router.replace('/banned')
      return
    }
    if (status !== 'suspended') {
      router.replace('/')
    }
  }, [router])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [reason, setReason] = useState<string | null>(null)

  useEffect(() => {
    // Read from localStorage after mount (avoid SSR/CSR mismatch)
    setReason(getModerationReason())
  }, [])

  const openSupportChat = async () => {
    setError(null)

    if (!SYSTEM_USER_ID) {
      setError('חסר SYSTEM_USER_ID במערכת (NEXT_PUBLIC_SYSTEM_USER_ID).')
      return
    }

    setBusy(true)
    try {
      const { data } = await supabase.auth.getSession()
      if (!data.session?.user?.id) {
        router.replace('/auth/login')
        return
      }

      const { data: conversationId, error: rpcErr } = await supabase.rpc('start_conversation', {
        other_user_id: SYSTEM_USER_ID,
      })

      if (rpcErr) throw rpcErr
      if (!conversationId || typeof conversationId !== 'string') {
        throw new Error('השרת לא החזיר conversationId תקין')
      }

      setSupportConversationId(conversationId)
      router.push(`/inbox/${encodeURIComponent(conversationId)}`)
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'שגיאה לא ידועה'
      const friendly = mapModerationRpcError(msg)
      if (friendly) {
        setError(friendly)
      } else if (msg.includes('404') || msg.toLowerCase().includes('not found')) {
        setError('פונקציית צ׳אט חסרה בשרת (start_conversation). צריך להריץ את המיגרציה.')
      } else {
        setError(msg)
      }
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-10" dir="rtl">
      <div className="rounded-3xl border border-black/5 bg-white/80 p-6 shadow-sm">
        <div className="text-2xl font-black">החשבון הוגבל זמנית</div>
        <p className="mt-2 text-sm text-neutral-700 leading-6">
          נראה שהחשבון שלך הוגבל ע&quot;י מערכת האתר. אפשר עדיין להתחבר ולקרוא תכנים, אבל פעולות כמו כתיבה, שמירה,
          התראות והגדרות אינן זמינות כרגע.
        </p>

        {reason ? (
          <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 whitespace-pre-wrap">
            <div className="font-black">סיבת ההגבלה</div>
            <div className="mt-1 text-sm leading-6">{reason}</div>
          </div>
        ) : null}

        {from ? (
          <div className="mt-3 rounded-2xl border border-neutral-200 bg-neutral-50 px-4 py-3 text-xs text-neutral-700">
            ניסית לגשת ל: <span className="font-bold">{from}</span>
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
            {busy ? 'פותח שיחה…' : 'פנייה למערכת'}
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
          אם זה טעות — כתוב/י למערכת ונחזור אליך בהקדם.
        </div>
      </div>
    </div>
  )
}

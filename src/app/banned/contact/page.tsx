'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import ChatClient from '@/components/ChatClient'
import { getModerationStatus, getSupportConversationId, setSupportConversationId } from '@/lib/moderation'
import { supabase } from '@/lib/supabaseClient'

const SYSTEM_USER_ID = (process.env.NEXT_PUBLIC_SYSTEM_USER_ID ?? '').trim()

export default function BannedContactPage() {
  const router = useRouter()
  const [conversationId, setConversationId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const status = getModerationStatus()
    if (status !== 'banned') {
      router.replace('/')
      return
    }
    if (!SYSTEM_USER_ID) {
      setError('חסר SYSTEM_USER_ID במערכת (NEXT_PUBLIC_SYSTEM_USER_ID).')
      return
    }

    const existing = getSupportConversationId()
    if (existing) {
      setConversationId(existing)
      return
    }

    const run = async () => {
      const { data: me } = await supabase.auth.getUser()
      if (!me.user?.id) {
        router.replace('/auth/login')
        return
      }

      const { data, error: rpcError } = await supabase.rpc('start_conversation', { other_user_id: SYSTEM_USER_ID })
      if (rpcError) {
        setError('שגיאה ביצירת שיחה עם מערכת האתר.')
        return
      }

      const cid = (data as unknown as { conversation_id?: string } | null)?.conversation_id ?? null
      if (!cid) {
        setError('לא התקבל מזהה שיחה ממערכת האתר.')
        return
      }

      setSupportConversationId(cid)
      setConversationId(cid)
    }

    void run()
  }, [router])

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center px-6" dir="rtl">
        <div className="w-full max-w-md rounded-3xl border border-white/10 bg-white/5 p-6 text-right">
          <div className="text-lg font-extrabold">בעיה</div>
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
    <div className="min-h-screen" dir="rtl">
      <div className="mx-auto max-w-3xl px-4 py-4">
        <button
          type="button"
          onClick={() => router.replace('/banned')}
          className="mb-3 inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-4 py-2 text-sm font-bold hover:bg-white/10"
        >
          ← חזרה
        </button>

        <div className="rounded-3xl border border-white/10 bg-white/5 p-3">
          <ChatClient conversationId={conversationId} />
        </div>
      </div>
    </div>
  )
}

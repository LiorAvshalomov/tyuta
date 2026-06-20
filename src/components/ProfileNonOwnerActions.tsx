'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { MessageCircle } from 'lucide-react'
import { supabase } from '@/lib/supabaseClient'
import { waitForClientSession } from '@/lib/auth/clientSession'
import { mapModerationRpcError, mapSupabaseError } from '@/lib/mapSupabaseError'
import { useToast } from '@/components/Toast'

export default function ProfileNonOwnerActions({ profileId }: { profileId: string }) {
  const router = useRouter()
  const { toast } = useToast()
  const [meId, setMeId] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    let mounted = true

    const syncMeId = (nextUserId: string | null) => {
      if (!mounted) return
      setMeId(nextUserId)
    }

    const loadMe = async () => {
      const resolution = await waitForClientSession(5000)
      syncMeId(resolution.status === 'authenticated' ? resolution.user.id : null)
    }

    void loadMe()

    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_OUT') {
        syncMeId(null)
        return
      }

      if (session?.user?.id) {
        syncMeId(session.user.id)
      }
    })

    return () => {
      mounted = false
      sub.subscription.unsubscribe()
    }
  }, [])

  if (meId && meId === profileId) return null
  if (!meId) return null

  async function handleMessage() {
    setLoading(true)
    const { data, error } = await supabase.rpc('start_conversation', {
      other_user_id: profileId,
    })
    setLoading(false)

    if (error || !data) {
      const friendly = error
        ? mapSupabaseError(error) ?? mapModerationRpcError(error.message ?? '')
        : null
      toast(friendly ?? 'לא הצלחנו לפתוח שיחה', 'error')
      return
    }

    router.push(`/inbox/${data}`)
  }

  return (
    <button
      onClick={handleMessage}
      disabled={loading}
      className="inline-flex min-h-11 w-[144px] items-center justify-center gap-2 rounded-[14px] border border-[#31576a]/25 bg-[#17384a] px-3 text-sm font-semibold text-white shadow-sm shadow-sky-950/15 transition hover:scale-[1.01] hover:border-[#31576a]/35 hover:bg-[#1f485e] active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60 dark:border-sky-200/10 dark:bg-[#1a3c4f] dark:text-sky-50 dark:shadow-none dark:hover:bg-[#224c63] min-[380px]:w-[152px] sm:w-[160px] cursor-pointer"
    >
      <MessageCircle className="h-4 w-4 shrink-0" strokeWidth={2.4} aria-hidden="true" />
      <span>{loading ? 'פותח…' : 'שליחת הודעה'}</span>
    </button>
  )
}

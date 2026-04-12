'use client'

import { supabase } from '@/lib/supabaseClient'
import { waitForClientSession } from '@/lib/auth/clientSession'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'

export default function ProfileNonOwnerActions({ profileId }: { profileId: string }) {
  const router = useRouter()
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

  // ✅ לא מציגים “שלח הודעה” על עצמי
  if (meId && meId === profileId) return null

  // ✅ לא מציגים בפרופיל אם לא מחובר (יש התחברות ב-SiteHeader)
  if (!meId) return null

  async function handleMessage() {
    setLoading(true)
    const { data, error } = await supabase.rpc('start_conversation', {
      other_user_id: profileId,
    })
    setLoading(false)

    if (error || !data) {
      alert('שגיאה בפתיחת שיחה')
      return
    }

    router.push(`/inbox/${data}`)
  }

  return (
    <button
      onClick={handleMessage}
      disabled={loading}
      className="h-10 min-w-[110px] rounded-full bg-black px-4 text-sm font-semibold text-white disabled:opacity-60 disabled:cursor-not-allowed cursor-pointer transition hover:scale-[1.02] active:scale-[0.98] hover:bg-black/90"
    >
      {loading ? 'פותח…' : 'שלח הודעה'}
    </button>
  )
}

'use client'

import { supabase } from '@/lib/supabaseClient'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'

export default function ProfileNonOwnerActions({ profileId }: { profileId: string }) {
  const router = useRouter()
  const [meId, setMeId] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    let mounted = true

    async function loadMe() {
      const { data } = await supabase.auth.getSession()
      if (!mounted) return
      if (!data.session?.user?.id) setMeId(null)
      else setMeId(data.session.user.id)
    }

    loadMe()

    const { data: sub } = supabase.auth.onAuthStateChange(() => {
      loadMe()
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

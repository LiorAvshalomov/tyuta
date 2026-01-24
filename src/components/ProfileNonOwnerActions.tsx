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
      const { data, error } = await supabase.auth.getUser()
      if (!mounted) return
      if (error || !data.user?.id) setMeId(null)
      else setMeId(data.user.id)
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

  async function handleMessage() {
    // ✅ לא מחובר → התחבר
    if (!meId) {
      alert('כדי לשלוח הודעה צריך להתחבר 🙂')
      router.push('/login')
      return
    }

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
      className="rounded-full bg-black px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
    >
      {loading ? 'פותח…' : 'שלח הודעה'}
    </button>
  )
}

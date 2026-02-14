'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '@/lib/supabaseClient'




type DraftRow = {
  id: string
  title: string
  updated_at: string
  created_at: string
  channel_id: number
  channels?: { name_he: string }[] | null
}

export default function NotebookPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [userId, setUserId] = useState<string | null>(null)
  const [drafts, setDrafts] = useState<DraftRow[]>([])
  const [busyId, setBusyId] = useState<string | null>(null)

  const empty = useMemo(() => !loading && drafts.length === 0, [loading, drafts])

  useEffect(() => {
    let mounted = true

    async function guardAndLoad() {
      const { data, error } = await supabase.auth.getSession()
      if (!mounted) return

      const session = data.session
      if (error || !session?.user?.id) {
        alert('כדי להשתמש במחברת צריך להתחבר 🙂')
        router.push('/auth/login')
        return
      }

      setUserId(session.user.id)
      await loadDrafts(session.user.id)
      if (!mounted) return
      setLoading(false)
    }

    async function loadDrafts(uid: string) {
      const { data, error } = await supabase
        .from('posts')
        .select('id, title, updated_at, created_at, channel_id, channels(name_he)')
        .is('deleted_at', null)
        .eq('author_id', uid)
        .eq('status', 'draft')
        .order('updated_at', { ascending: false })

      if (error) {
        console.error(error)
        setDrafts([])
        return
      }

      setDrafts((data ?? []) as unknown as DraftRow[])
    }

    guardAndLoad()

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!mounted) return
      if (!session?.user?.id) router.push('/auth/login')
    })

    return () => {
      mounted = false
      sub.subscription.unsubscribe()
    }
  }, [router])

  async function onDelete(draftId: string) {
    if (!userId) return
    if (!confirm('למחוק את הטיוטה? אי אפשר לשחזר.')) return

    setBusyId(draftId)

    // מוחקים קודם תגיות אם יש (ליתר ביטחון; אם יש FK עם cascade זה עדיין בסדר)
    await supabase.from('post_tags').delete().eq('post_id', draftId).select('..., channels(name_he)')


    const { error } = await supabase
      .from('posts')
      .delete()
      .eq('id', draftId)
      .eq('author_id', userId)
      .eq('status', 'draft')

    setBusyId(null)

    if (error) {
      alert(error.message)
      return
    }

    setDrafts(prev => prev.filter(d => d.id !== draftId))
  }

  return (
    <div className="mx-auto max-w-4xl px-4 py-8" dir="rtl">
      <div className="rounded-3xl border bg-white p-6 shadow-sm">
        <div className="flex items-center justify-between gap-3">
          <h1 className="text-2xl font-black">📓 המחברת שלי</h1>

          <Link
            href="/write"
            className="rounded-full bg-black px-4 py-2 text-xs font-semibold text-white hover:opacity-90"
          >
            התחל כתיבה חדשה
          </Link>
        </div>

        <div className="mt-2 text-sm text-muted-foreground">
          כאן נמצאות הטיוטות שלך. זה מרחב עבודה — בלי לייקים, בלי לחץ, בלי פרסום מיידי.
        </div>

        <div className="mt-6">
          {loading && (
            <div className="rounded-2xl border bg-[#FAF9F6] p-5">
              <div className="text-sm font-bold">טוען טיוטות…</div>
            </div>
          )}

          {empty && (
            <div className="rounded-2xl border bg-[#FAF9F6] p-5">
              <div className="text-sm font-bold">אין לך עדיין טיוטות.</div>
              <div className="mt-1 text-sm text-muted-foreground">
                התחל כתיבה חדשה, ואז “שמור טיוטה”.
              </div>
            </div>
          )}

          {!loading && drafts.length > 0 && (
            <div className="space-y-3">
              {drafts.map(d => (
                <div key={d.id} className="rounded-2xl border p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-black">
                        {d.title?.trim() || 'טיוטה ללא כותרת'}
                      </div>

                      <div className="mt-1 text-xs text-muted-foreground">
                        {d.channels?.[0]?.name_he ? `${d.channels[0].name_he} • ` : ''}
                        עודכן: {new Date(d.updated_at).toLocaleString('he-IL')}
                      </div>
                    </div>

                    <div className="flex shrink-0 items-center gap-2">
                      <button
                        onClick={() => router.push(`/write?draft=${d.id}`)}
                        className="rounded-full border bg-white px-3 py-1.5 text-xs font-semibold hover:bg-neutral-50"
                      >
                        המשך כתיבה
                      </button>

                      <button
                        disabled={busyId === d.id}
                        onClick={() => onDelete(d.id)}
                        className="rounded-full border bg-white px-3 py-1.5 text-xs font-semibold text-red-600 hover:bg-red-50 disabled:opacity-60"
                      >
                        {busyId === d.id ? 'מוחק…' : 'מחק'}
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

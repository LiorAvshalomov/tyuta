'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '@/lib/supabaseClient'
import { waitForClientSession } from '@/lib/auth/clientSession'
import { buildLoginRedirect } from '@/lib/auth/protectedRoutes'

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

    async function guardAndLoad() {
      const resolved = await waitForClientSession()
      if (!mounted) return

      if (resolved.status !== 'authenticated') {
        alert('כדי להשתמש במחברת צריך להתחבר.')
        router.replace(buildLoginRedirect('/notebook'))
        return
      }

      setUserId(resolved.user.id)
      await loadDrafts(resolved.user.id)
      if (!mounted) return
      setLoading(false)
    }

    void guardAndLoad()

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!mounted) return
      if (!session?.user?.id) router.replace(buildLoginRedirect('/notebook'))
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

    // Delete tags first if needed; harmless if FK cascade already handles it.
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

    setDrafts((prev) => prev.filter((draft) => draft.id !== draftId))
  }

  return (
    <div className="mx-auto max-w-4xl px-4 py-8" dir="rtl">
      <div className="rounded-3xl border bg-white p-6 shadow-sm dark:bg-card dark:border-border">
        <div className="flex items-center justify-between gap-3">
          <h1 className="text-2xl font-black">המחברת שלי</h1>

          <Link
            href="/write"
            className="rounded-full bg-black px-4 py-2 text-xs font-semibold text-white hover:opacity-90"
          >
            התחל כתיבה חדשה
          </Link>
        </div>

        <div className="mt-2 text-sm text-muted-foreground">
          כאן נמצאות הטיוטות שלך. זה מרחב עבודה - בלי לייקים, בלי לחץ, בלי פרסום מיידי.
        </div>

        <div className="mt-6">
          {loading && (
            <div className="rounded-2xl border bg-[#FAF9F6] p-5 dark:bg-muted dark:border-border">
              <div className="text-sm font-bold">טוען טיוטות...</div>
            </div>
          )}

          {empty && (
            <div className="rounded-2xl border bg-[#FAF9F6] p-5 dark:bg-muted dark:border-border">
              <div className="text-sm font-bold">אין לך עדיין טיוטות.</div>
              <div className="mt-1 text-sm text-muted-foreground">
                התחל כתיבה חדשה, ואז &quot;שמור טיוטה&quot;.
              </div>
            </div>
          )}

          {!loading && drafts.length > 0 && (
            <div className="space-y-3">
              {drafts.map((draft) => (
                <div key={draft.id} className="rounded-2xl border bg-white p-4 dark:bg-card dark:border-border">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-black">
                        {draft.title?.trim() || 'טיוטה ללא כותרת'}
                      </div>

                      <div className="mt-1 text-xs text-muted-foreground">
                        {draft.channels?.[0]?.name_he ? `${draft.channels[0].name_he} • ` : ''}
                        עודכן: {new Date(draft.updated_at).toLocaleString('he-IL')}
                      </div>
                    </div>

                    <div className="flex shrink-0 items-center gap-2">
                      <button
                        onClick={() => router.push(`/write?draft=${draft.id}`)}
                        className="rounded-full border bg-white px-3 py-1.5 text-xs font-semibold hover:bg-neutral-50 dark:bg-card dark:border-border dark:hover:bg-muted"
                      >
                        המשך כתיבה
                      </button>

                      <button
                        disabled={busyId === draft.id}
                        onClick={() => void onDelete(draft.id)}
                        className="rounded-full border bg-white px-3 py-1.5 text-xs font-semibold text-red-600 hover:bg-red-50 disabled:opacity-60 dark:bg-card dark:border-border dark:hover:bg-red-950/30"
                      >
                        {busyId === draft.id ? 'מוחק...' : 'מחק'}
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

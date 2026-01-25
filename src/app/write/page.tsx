'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import type { JSONContent } from '@tiptap/react'
import Editor from '@/components/Editor'
import Badge from '@/components/Badge'
import { supabase } from '@/lib/supabaseClient'

type Channel = { id: number; name_he: string }
type Tag = { id: number; type: 'emotion' | 'theme' | 'genre' | 'topic'; name_he: string; channel_id: number | null }
type SubcategoryOption = { id: number; name_he: string }

type DraftRow = {
  id: string
  slug: string
  title: string | null
  excerpt: string | null
  content_json: JSONContent | null
  channel_id: number | null
  // legacy field kept for compatibility; not used in UI
  format_id: number | null
  subcategory_tag_id: number | null
  status: 'draft' | 'published'
  cover_image_url: string | null
  cover_source: string | null
  updated_at: string | null
}

const EMPTY_DOC: JSONContent = { type: 'doc', content: [{ type: 'paragraph' }] }
const EXCERPT_MAX = 160

// Non-subcategory tag types per channel (subcategory itself is stored in posts.subcategory_tag_id and points to tags.type='genre')
const TAG_TYPES_BY_CHANNEL: Record<number, Array<Tag['type']>> = {
  1: ['emotion', 'theme'], // פריקה
  2: ['emotion', 'theme'], // סיפורים
  3: ['topic', 'theme'],   // מגזין
}

function uniqById<T extends { id: number }>(rows: T[]) {
  const seen = new Set<number>()
  const out: T[] = []
  for (const r of rows) {
    if (seen.has(r.id)) continue
    seen.add(r.id)
    out.push(r)
  }
  return out
}


function clampExcerpt(s: string) {
  const trimmed = s.replace(/\s+/g, ' ').trimStart()
  return trimmed.length > EXCERPT_MAX ? trimmed.slice(0, EXCERPT_MAX) : trimmed
}

export default function WritePage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const draftParam = searchParams.get('draft')

  const [userId, setUserId] = useState<string | null>(null)

  const [channels, setChannels] = useState<Channel[]>([])
  const [tags, setTags] = useState<Tag[]>([])

  const [channelId, setChannelId] = useState<number | null>(null)

  // Subcategory is a single "genre" tag (tags.type='genre')
  const [subcategoryTagId, setSubcategoryTagId] = useState<number | null>(null)
  const [subcategoryOptions, setSubcategoryOptions] = useState<SubcategoryOption[]>([])

  const [selectedTagIds, setSelectedTagIds] = useState<number[]>([])

  const [draftId, setDraftId] = useState<string | null>(draftParam)
  const [draftSlug, setDraftSlug] = useState<string | null>(null)

  const [title, setTitle] = useState('')
  const [excerpt, setExcerpt] = useState('')
  const [contentJson, setContentJson] = useState<JSONContent>(EMPTY_DOC)

  const [coverUrl, setCoverUrl] = useState<string | null>(null)
  const [coverSource, setCoverSource] = useState<string | null>(null)
  const [autoCoverUsed, setAutoCoverUsed] = useState(false)

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(null)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  const autosaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const hasLoadedDraftOnce = useRef(false)

  // --- Auth guard
  useEffect(() => {
    const run = async () => {
      const { data } = await supabase.auth.getUser()
      const user = data.user
      if (!user) {
        router.push('/login')
        return
      }
      setUserId(user.id)
    }
    void run()
  }, [router])

  // --- Load channels once
  useEffect(() => {
    const load = async () => {
      setLoading(true)

      const { data: ch, error: chErr } = await supabase
        .from('channels')
        .select('id, name_he')
        .order('sort_order')

      if (chErr) {
        setErrorMsg(chErr.message ?? 'שגיאה בטעינת נתונים')
        setLoading(false)
        return
      }

      setChannels((ch ?? []) as Channel[])

      // default selection
      const firstChannelId = (ch ?? [])[0]?.id ?? null
      setChannelId(prev => prev ?? firstChannelId)

      setLoading(false)
    }

    void load()
  }, [])

  // keep draftId in sync with URL changes
  useEffect(() => {
    setDraftId(draftParam)
  }, [draftParam])

  // --- Load "tags" (chips) when channel changes
  // IMPORTANT: these are NOT the subcategory. Subcategory is a single genre tag stored in posts.subcategory_tag_id.
  useEffect(() => {
    const loadTags = async () => {
      if (!channelId) return
      const allowedTypes = TAG_TYPES_BY_CHANNEL[channelId] ?? ['emotion', 'theme']

      const { data, error } = await supabase
        .from('tags')
        .select('id, type, name_he, channel_id')
        .eq('is_active', true)
        .in('type', allowedTypes as any) // PostgREST enum filter

      if (error) {
        console.error(error)
        setTags([])
        return
      }

      const filtered = (data ?? []).filter(t => t.channel_id === null || t.channel_id === channelId) as Tag[]
      // Ensure we never show the subcategory tags in the chips area
      const withoutGenre = filtered.filter(t => t.type !== 'genre')
      setTags(uniqById(withoutGenre))
    }

    void loadTags()
  }, [channelId])

  // --- Load subcategories for selected channel
  // We only show subcategories that are actually used by posts in that channel (stable + no "random tags" leakage).
  useEffect(() => {
    const loadSubcategories = async () => {
      if (!channelId) return

      const { data: postRows, error: postErr } = await supabase
        .from('posts')
        .select('subcategory_tag_id')
        .eq('channel_id', channelId)
        .not('subcategory_tag_id', 'is', null)

      if (postErr) {
        console.error(postErr)
        setSubcategoryOptions([])
        setSubcategoryTagId(null)
        return
      }

      const ids = Array.from(
        new Set((postRows ?? []).map(r => r.subcategory_tag_id).filter(Boolean) as number[])
      )

      if (ids.length === 0) {
        setSubcategoryOptions([])
        setSubcategoryTagId(null)
        return
      }

      const { data: tagRows, error: tagErr } = await supabase
        .from('tags')
        .select('id, name_he')
        .in('id', ids)

      if (tagErr) {
        console.error(tagErr)
        setSubcategoryOptions([])
        setSubcategoryTagId(null)
        return
      }

      const rows = uniqById((tagRows ?? []) as SubcategoryOption[])
      rows.sort((a, b) => a.name_he.localeCompare(b.name_he, 'he'))

      setSubcategoryOptions(rows)
      setSubcategoryTagId(prev => {
        if (prev && rows.some(r => r.id === prev)) return prev
        return rows[0]?.id ?? null
      })
    }

    void loadSubcategories()
  }, [channelId])

  const toggleTag = (id: number) => {
    setSelectedTagIds(prev => {
      if (prev.includes(id)) return prev.filter(x => x !== id)
      if (prev.length >= 3) return prev
      return [...prev, id]
    })
  }

  // --- Load draft (once) if ?draft=...
  useEffect(() => {
    const loadDraft = async () => {
      if (!draftId || !userId) return
      if (hasLoadedDraftOnce.current) return

      const { data: post, error } = await supabase
        .from('posts')
        .select(
          'id, slug, title, excerpt, content_json, channel_id, format_id, subcategory_tag_id, status, cover_image_url, cover_source, updated_at'
        )
        .eq('id', draftId)
        .eq('author_id', userId)
        .single()

      if (error || !post) {
        setErrorMsg(error?.message ?? 'לא הצלחתי לטעון טיוטה')
        return
      }

      const d = post as DraftRow
      if (d.status !== 'draft') {
        setErrorMsg('אפשר לערוך כאן רק טיוטות')
        return
      }

      setDraftSlug(d.slug)
      setTitle((d.title ?? '').toString())
      setExcerpt((d.excerpt ?? '').toString())
      setContentJson((d.content_json as JSONContent) ?? EMPTY_DOC)
      setChannelId(d.channel_id)
      setSubcategoryTagId(d.subcategory_tag_id)
      setCoverUrl(d.cover_image_url)
      setCoverSource(d.cover_source)
      setLastSavedAt(d.updated_at)
      setAutoCoverUsed(d.cover_source === 'pexels')

      // load tags (non-genre)
      const { data: tagRows } = await supabase.from('post_tags').select('tag_id').eq('post_id', d.id)
      setSelectedTagIds((tagRows ?? []).map(r => r.tag_id))

      hasLoadedDraftOnce.current = true
    }

    void loadDraft()
  }, [draftId, userId])

  const ensureDraft = useCallback(async (): Promise<{ id: string; slug: string } | null> => {
    if (!userId) return null
    if (draftId && draftSlug) return { id: draftId, slug: draftSlug }

    // Create a draft immediately
    const slug = crypto.randomUUID()
    const { data: created, error } = await supabase
      .from('posts')
      .insert({
        slug,
        title: title.trim() || null,
        excerpt: excerpt.trim() || null,
        content_json: contentJson,
        channel_id: channelId,
        subcategory_tag_id: subcategoryTagId,
        author_id: userId,
        status: 'draft',
        cover_image_url: coverUrl,
        cover_source: coverSource,
      })
      .select('id, slug')
      .single()

    if (error || !created) {
      setErrorMsg(error?.message ?? 'שגיאה ביצירת טיוטה')
      return null
    }

    setDraftId(created.id)
    setDraftSlug(created.slug)
    router.replace(`/write?draft=${created.id}`)
    return { id: created.id, slug: created.slug }
  }, [userId, draftId, draftSlug, title, excerpt, contentJson, channelId, subcategoryTagId, coverUrl, coverSource, router])

  const syncTags = useCallback(
    async (postId: string) => {
      // keep it simple: replace set
      await supabase.from('post_tags').delete().eq('post_id', postId)
      if (selectedTagIds.length === 0) return
      await supabase.from('post_tags').insert(selectedTagIds.map(tag_id => ({ post_id: postId, tag_id })))
    },
    [selectedTagIds]
  )

  const upsertDraftSilently = useCallback(
    async () => {
      if (!userId) return

      // don't create draft for completely empty state
      const isEmpty = !title.trim() && !excerpt.trim() && JSON.stringify(contentJson) === JSON.stringify(EMPTY_DOC)
      if (isEmpty && !draftId) return

      setSaving(true)
      setErrorMsg(null)

      const existing = await ensureDraft()
      if (!existing) {
        setSaving(false)
        return
      }

      const { id } = existing
      const { error } = await supabase
        .from('posts')
        .update({
          title: title.trim() || null,
          excerpt: excerpt.trim() || null,
          content_json: contentJson,
          channel_id: channelId,
          subcategory_tag_id: subcategoryTagId,
          cover_image_url: coverUrl,
          cover_source: coverSource,
          status: 'draft',
        })
        .eq('id', id)
        .eq('author_id', userId)

      if (error) {
        setErrorMsg(error.message)
        setSaving(false)
        return
      }

      await syncTags(id)

      const now = new Date().toISOString()
      setLastSavedAt(now)
      setSaving(false)
    },
    [userId, title, excerpt, contentJson, draftId, ensureDraft, channelId, subcategoryTagId, coverUrl, coverSource, syncTags]
  )

  // autosave debounce
  useEffect(() => {
    if (!userId) return
    if (autosaveTimer.current) clearTimeout(autosaveTimer.current)
    autosaveTimer.current = setTimeout(() => {
      void upsertDraftSilently()
    }, 900)
    return () => {
      if (autosaveTimer.current) clearTimeout(autosaveTimer.current)
    }
  }, [userId, title, excerpt, contentJson, channelId, subcategoryTagId, coverUrl, coverSource, selectedTagIds, upsertDraftSilently])

  const handlePickCoverFile = async (file: File) => {
    if (!userId) return
    const created = await ensureDraft()
    if (!created) return

    const ext = (file.name.split('.').pop() || 'jpg').toLowerCase()
    const path = `${userId}/${created.id}/cover-${crypto.randomUUID()}.${ext}`

    const { error: uploadErr } = await supabase.storage.from('post-assets').upload(path, file, {
      upsert: false,
      contentType: file.type || undefined,
    })

    if (uploadErr) {
      setErrorMsg(uploadErr.message)
      return
    }

    const { data } = supabase.storage.from('post-assets').getPublicUrl(path)
    const url = data.publicUrl
    setCoverUrl(url)
    setCoverSource('upload')
    setAutoCoverUsed(false)
  }

  const chooseAutoCover = async () => {
    if (!title.trim()) {
      alert('כדי לבחור קאבר אוטומטי צריך כותרת')
      return
    }
    const created = await ensureDraft()
    if (!created) return

    setErrorMsg(null)
    const seed = Date.now()
    const res = await fetch(`/api/cover/pexels?q=${encodeURIComponent(title.trim())}&seed=${seed}`)
    if (!res.ok) {
      setErrorMsg('לא הצלחתי להביא תמונה')
      return
    }
    const json = (await res.json()) as { url?: string }
    if (!json.url) {
      setErrorMsg('לא נמצאה תמונה מתאימה')
      return
    }

    setCoverUrl(json.url)
    setCoverSource('pexels')
    setAutoCoverUsed(true)
  }

  const removeCover = async () => {
    setCoverUrl(null)
    setCoverSource(null)
    setAutoCoverUsed(false)
  }

  const fetchAutoCoverUrl = async (q: string) => {
    const seed = Date.now()
    const res = await fetch(`/api/cover/pexels?q=${encodeURIComponent(q)}&seed=${seed}`)
    if (!res.ok) return null
    const json = (await res.json()) as { url?: string }
    return json.url ?? null
  }

  const publish = async () => {
    if (!userId) return

    // חובה כותרת
    if (!title.trim()) {
      alert('כותרת היא חובה')
      return
    }

    // חובה ערוץ
    if (!channelId) {
      alert('בחר ערוץ')
      return
    }

    // חובה תת־קטגוריה
    if (!subcategoryTagId) {
      alert('בחר תת־קטגוריה')
      return
    }

    // חובה לפחות תגית אחת (מתוך המקסימום 3 שכבר קיים)
    if (selectedTagIds.length < 1) {
      alert('חובה לבחור לפחות תגית אחת')
      return
    }

    setSaving(true)
    setErrorMsg(null)

    const created = await ensureDraft()
    if (!created) {
      setSaving(false)
      return
    }

    // שמירה שקטה של טיוטה + סנכרון תגיות
    await upsertDraftSilently()

    // אם אין קאבר — בוחרים אוטומטית בזמן פרסום
    let finalCoverUrl = coverUrl
    let finalCoverSource = coverSource

    if (!finalCoverUrl) {
      const autoUrl = await fetchAutoCoverUrl(title.trim())
      if (!autoUrl) {
        setErrorMsg('לא הצלחתי לבחור תמונה אוטומטית. נסה שוב או העלה תמונה ידנית.')
        setSaving(false)
        return
      }

      finalCoverUrl = autoUrl
      finalCoverSource = 'pexels'

      // מעדכן UI גם
      setCoverUrl(autoUrl)
      setCoverSource('pexels')
      setAutoCoverUsed(true)
    }

    const { error } = await supabase
      .from('posts')
      .update({
        title: title.trim(),
        excerpt: excerpt.trim() || null,
        content_json: contentJson,
        channel_id: channelId,
        subcategory_tag_id: subcategoryTagId,
        cover_image_url: finalCoverUrl,
        cover_source: finalCoverSource,
        status: 'published',
        published_at: new Date().toISOString(),
      })
      .eq('id', created.id)
      .eq('author_id', userId)

    if (error) {
      setErrorMsg(error.message)
      setSaving(false)
      return
    }

    setSaving(false)
    router.push(`/post/${created.slug}`)
  }

  const savingText = saving
    ? 'שומר טיוטה…'
    : lastSavedAt
      ? `נשמר • ${new Date(lastSavedAt as string).toLocaleString('he-IL')}`
      : 'לא נשמר עדיין'

  if (loading) {
    return (
      <main className="mx-auto max-w-4xl px-4 py-10" dir="rtl">
        <div className="text-sm text-muted-foreground">טוען…</div>
      </main>
    )
  }

  return (
    <main className="min-h-screen bg-neutral-50" dir="rtl">
      <div className="mx-auto max-w-4xl px-4 py-8">
        <header className="mb-6 flex items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">כתיבה</h1>
            <div className="mt-2 text-sm text-muted-foreground">מקום לעבוד. אין לחץ לפרסם.</div>
          </div>
          <div className="text-left">
            <div className="text-xs text-muted-foreground">{savingText}</div>
            {draftId ? <div className="mt-1 text-xs text-muted-foreground">טיוטה: {draftId.slice(0, 8)}…</div> : null}
          </div>
        </header>

        {errorMsg ? (
          <div className="mb-4 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">{errorMsg}</div>
        ) : null}

        {/* MyPen-like preview block */}
        <section className="rounded-3xl border bg-white p-4 shadow-sm">
          <div className="grid gap-4 md:grid-cols-3">
            {/* COVER */}
            <div className="md:col-span-1">
              <div className="overflow-hidden rounded-2xl border bg-neutral-50">
                {coverUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={coverUrl ?? undefined} alt="" className="h-44 w-full object-cover" />
                ) : (
                  <div className="flex h-44 items-center justify-center text-sm text-muted-foreground">אין קאבר</div>
                )}
              </div>

              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={chooseAutoCover}
                  className="rounded-full border bg-white px-3 py-1.5 text-sm hover:bg-neutral-50"
                >
                  {autoCoverUsed || coverSource === 'pexels' ? 'החלף תמונה אוטומטית' : 'בחר קאבר אוטומטית'}
                </button>

                <label className="cursor-pointer rounded-full border bg-white px-3 py-1.5 text-sm hover:bg-neutral-50">
                  העלה תמונה
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={e => {
                      const file = e.target.files?.[0]
                      if (file) void handlePickCoverFile(file)
                      e.currentTarget.value = ''
                    }}
                  />
                </label>

                {coverUrl ? (
                  <button
                    type="button"
                    onClick={() => void removeCover()}
                    className="rounded-full border bg-white px-3 py-1.5 text-sm hover:bg-neutral-50"
                  >
                    הסר
                  </button>
                ) : null}
              </div>

              {coverSource ? (
                <div className="mt-2 text-xs text-muted-foreground">
                  מקור: <Badge>{coverSource}</Badge>
                </div>
              ) : null}
            </div>

            {/* TITLE + EXCERPT */}
            <div className="md:col-span-2">
              <label className="block text-sm font-medium">כותרת</label>
              <input
                value={title}
                onChange={e => setTitle(e.target.value)}
                placeholder="תן שם לטקסט…"
                className="mt-2 w-full rounded-2xl border px-4 py-3 text-base outline-none focus:ring-2 focus:ring-black/10"
              />

              <div className="mt-4 flex items-center justify-between gap-3">
                <label className="block text-sm font-medium">תקציר קצר</label>
                <div className="text-xs text-muted-foreground">
                  {excerpt.length}/{EXCERPT_MAX}
                </div>
              </div>
              <textarea
                value={excerpt}
                onChange={e => setExcerpt(clampExcerpt(e.target.value))}
                placeholder="משפט או שניים שמושכים לקריאה…"
                rows={3}
                className="mt-2 w-full resize-none rounded-2xl border px-4 py-3 text-sm leading-6 outline-none focus:ring-2 focus:ring-black/10"
              />

              <details className="mt-4 rounded-2xl border bg-neutral-50 p-4">
                <summary className="cursor-pointer text-sm font-medium">הגדרות (ערוץ · תת־קטגוריה · תגיות)</summary>

                <div className="mt-4 grid gap-4 md:grid-cols-2">
                  <div>
                    <label className="block text-sm font-medium">ערוץ</label>
                    <select
                      value={channelId ?? ''}
                      onChange={e => {
                        const next = Number(e.target.value)
                        setChannelId(next)
                        setSubcategoryTagId(null)
                      }}
                      className="mt-2 w-full rounded-2xl border bg-white px-4 py-3 text-sm"
                    >
                      {channels.map(c => (
                        <option key={c.id} value={c.id}>
                          {c.name_he}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium">תת־קטגוריה</label>
                    <select
                      value={subcategoryTagId ?? ''}
                      onChange={e => {
                        const v = e.target.value
                        setSubcategoryTagId(v ? Number(v) : null)
                      }}
                      className="mt-2 w-full rounded-2xl border bg-white px-4 py-3 text-sm"
                    >
                      <option value="" disabled>
                        בחר תת־קטגוריה
                      </option>
                      {subcategoryOptions.map(sc => (
                        <option key={sc.id} value={sc.id}>
                          {sc.name_he}
                        </option>
                      ))}
                    </select>
                    <div className="mt-1 text-xs text-muted-foreground">
                      תת־קטגוריה אחת בלבד — זו מה שמחליטה איפה הפוסט יופיע בעמודי הקטגוריות.
                    </div>
                  </div>
                </div>

                <div className="mt-4">
                  <div className="flex items-center justify-between">
                    <div className="text-sm font-medium">תגיות</div>
                    <div className="text-xs text-muted-foreground">{selectedTagIds.length}/3</div>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {tags.map(t => {
                      const selected = selectedTagIds.includes(t.id)
                      return (
                        <button
                          key={t.id}
                          type="button"
                          onClick={() => toggleTag(t.id)}
                          className={
                            'rounded-full border px-3 py-1.5 text-sm transition ' +
                            (selected ? 'bg-neutral-900 text-white border-neutral-900' : 'bg-white hover:bg-neutral-50')
                          }
                        >
                          {t.name_he}
                        </button>
                      )
                    })}
                  </div>
                </div>
              </details>
            </div>
          </div>
        </section>

        {/* Editor */}
        <section className="mt-5 rounded-3xl border bg-white p-4 shadow-sm">
          <div className="mb-3 flex items-center justify-between gap-3">
            <h2 className="text-sm font-medium">הטקסט</h2>
            <div className="text-xs text-muted-foreground">הטקסט נשמר אוטומטית</div>
          </div>
          <Editor value={contentJson} onChange={setContentJson} />
        </section>

        {/* Actions */}
        <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
          <div className="text-xs text-muted-foreground">
            טיפ: אפשר לצאת מהעמוד ולחזור דרך <span className="font-bold">המחברת</span>.
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => router.push('/notebook')}
              className="rounded-full border bg-white px-4 py-2 text-sm hover:bg-neutral-50"
            >
              למחברת
            </button>

            <button
              type="button"
              onClick={() => void publish()}
              disabled={saving}
              className="rounded-full bg-neutral-900 px-4 py-2 text-sm text-white hover:bg-neutral-800 disabled:opacity-50"
            >
              {saving ? 'מפרסם…' : 'פרסם'}
            </button>
          </div>
        </div>
      </div>
    </main>
  )
}

'use client'

/* eslint-disable react-hooks/set-state-in-effect */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import type { JSONContent } from '@tiptap/react'
import Editor from '@/components/Editor'
import Badge from '@/components/Badge'
import { supabase } from '@/lib/supabaseClient'

type Channel = { id: number; name_he: string }
type Tag = { id: number; type: 'emotion' | 'theme' | 'genre' | 'topic'; name_he: string; channel_id: number | null }
type TagType = Tag['type']
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
  3: ['topic', 'theme'], // מגזין
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

function snapshotOf(opts: {
  title: string
  excerpt: string
  contentJson: JSONContent
  coverUrl: string | null
  coverSource: string | null
  channelId: number | null
  subcategoryTagId: number | null
  selectedTagIds: number[]
}) {
  return JSON.stringify({
    title: opts.title.trim(),
    excerpt: opts.excerpt.trim(),
    content: opts.contentJson,
    coverUrl: opts.coverUrl,
    coverSource: opts.coverSource,
    channelId: opts.channelId,
    subcategoryTagId: opts.subcategoryTagId,
    selectedTagIds: [...opts.selectedTagIds].sort((a, b) => a - b),
  })
}

declare global {
  interface Window {
    __PENDEMIC_UNSAVED__?: { enabled: boolean; message: string }
  }
}

export default function WritePage() {
  const router = useRouter()
  const searchParams = useSearchParams()

  // draft = create/edit draft flow
  // edit  = edit an existing post without forcing it into drafts
  const editParam = searchParams.get('edit')
  const draftParam = searchParams.get('draft')
  const returnParam = searchParams.get('return')
  const channelParam = searchParams.get('channel')

  const safeReturnParam = (() => {
    if (!returnParam || !returnParam.startsWith('/')) return null
    // guard common bad values
    if (returnParam.includes('undefined') || returnParam.includes('null')) return null
    if (returnParam === '/post/' || returnParam === '/post') return null
    return returnParam
  })()

  const isEditMode = Boolean(editParam)
  const activeIdFromUrl = editParam ?? draftParam

  const [userId, setUserId] = useState<string | null>(null)

  const [channels, setChannels] = useState<Channel[]>([])
  const [tags, setTags] = useState<Tag[]>([])

  const [channelId, setChannelId] = useState<number | null>(null)

  // Subcategory is a single "genre" tag (tags.type='genre')
  const [subcategoryTagId, setSubcategoryTagId] = useState<number | null>(null)
  const [subcategoryOptions, setSubcategoryOptions] = useState<SubcategoryOption[]>([])

  const [selectedTagIds, setSelectedTagIds] = useState<number[]>([])

  // URL-provided id is `activeIdFromUrl`. When we create a new draft locally,
  // we store it in `createdDraftId`.
  const [createdDraftId, setCreatedDraftId] = useState<string | null>(null)
  const effectivePostId = activeIdFromUrl ?? createdDraftId

  const [draftSlug, setDraftSlug] = useState<string | null>(null)
  const [loadedStatus, setLoadedStatus] = useState<'draft' | 'published' | null>(null)

  const [title, setTitle] = useState('')
  const [excerpt, setExcerpt] = useState('')
  const [contentJson, setContentJson] = useState<JSONContent>(EMPTY_DOC)

  const [coverUrl, setCoverUrl] = useState<string | null>(null)
  const [coverSource, setCoverSource] = useState<string | null>(null)
  const [autoCoverUsed, setAutoCoverUsed] = useState(false)

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [savePending, setSavePending] = useState(false) // debounce pending
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(null)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  // ✅ Lock settings (channel/subcategory/tags) when editing an already published post.
  const settingsLocked = useMemo(() => isEditMode && loadedStatus === 'published', [isEditMode, loadedStatus])
  const autosaveEnabled = useMemo(() => !settingsLocked, [settingsLocked])

  // Track "dirty" state for edit-mode (published) so Cancel can truly discard changes
  const [initialSnapshot, setInitialSnapshot] = useState<string | null>(null)
  const currentSnapshot = useMemo(() => {
    return snapshotOf({
      title,
      excerpt,
      contentJson,
      coverUrl,
      coverSource,
      channelId,
      subcategoryTagId,
      selectedTagIds,
    })
  }, [title, excerpt, contentJson, coverUrl, coverSource, channelId, subcategoryTagId, selectedTagIds])

  const isDirty = useMemo(() => {
    if (!isEditMode) return false
    if (initialSnapshot === null) return false
    return initialSnapshot !== currentSnapshot
  }, [isEditMode, initialSnapshot, currentSnapshot])

  // New post that hasn't created a draft yet: warn if user typed anything
  const hasUnsavedNewPost = useMemo(() => {
    if (isEditMode) return false
    if (effectivePostId) return false
    const hasText = Boolean(title.trim() || excerpt.trim())
    const hasContent = JSON.stringify(contentJson) !== JSON.stringify(EMPTY_DOC)
    const hasMedia = Boolean(coverUrl)
    return hasText || hasContent || hasMedia
  }, [isEditMode, effectivePostId, title, excerpt, contentJson, coverUrl])

  // Warn when:
  // - edit mode + dirty (even if autosave enabled, because user expects confirm)
  // - debounce save is pending
  // - unsaved new post before a draft exists
  const shouldWarnNavigation = useMemo(() => {
    if (savePending) return true
    if (isEditMode && isDirty) return true
    if (hasUnsavedNewPost) return true
    return false
  }, [savePending, isEditMode, isDirty, hasUnsavedNewPost])

  // Expose a global guard so navbar button-driven navigations can respect it.
  useEffect(() => {
    if (typeof window === 'undefined') return
    window.__PENDEMIC_UNSAVED__ = {
      enabled: shouldWarnNavigation,
      message: 'יש לך שינויים שלא נשמרו. לצאת בכל זאת?',
    }
    return () => {
      // don't force-disable; just mark disabled when unmount
      window.__PENDEMIC_UNSAVED__ = { enabled: false, message: '' }
    }
  }, [shouldWarnNavigation])

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

      const { data: ch, error: chErr } = await supabase.from('channels').select('id, name_he').order('sort_order')

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

  // reset load guard when URL changes
  useEffect(() => {
    hasLoadedDraftOnce.current = false
  }, [activeIdFromUrl])

  // ✅ Reset editor state when navigating to "new post" (no edit/draft in URL)
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => {
    const wantsNew = !activeIdFromUrl
    if (!wantsNew) return

    const nextChannel = channelParam ? Number(channelParam) : null

    if (autosaveTimer.current) clearTimeout(autosaveTimer.current)
    autosaveTimer.current = null
    setSavePending(false)

    setCreatedDraftId(null)
    setDraftSlug(null)
    setLoadedStatus(null)
    setTitle('')
    setExcerpt('')
    setContentJson(EMPTY_DOC)
    setCoverUrl(null)
    setCoverSource(null)
    setAutoCoverUsed(false)
    setSelectedTagIds([])
    setSubcategoryTagId(null)
    setLastSavedAt(null)
    setErrorMsg(null)
    setInitialSnapshot(null)

    if (Number.isFinite(nextChannel as number)) {
      setChannelId(nextChannel)
    }
  }, [activeIdFromUrl, channelParam])

  // --- Load "tags" (chips) when channel changes
  useEffect(() => {
    const loadTags = async () => {
      if (!channelId) return
      const allowedTypes = (TAG_TYPES_BY_CHANNEL[channelId] ?? ['emotion', 'theme']) as TagType[]

      const { data, error } = await supabase
        .from('tags')
        .select('id, type, name_he, channel_id')
        .eq('is_active', true)
        .in('type', allowedTypes as unknown as string[])

      if (error) {
        console.error(error)
        setTags([])
        return
      }

      const filtered = (data ?? []).filter(t => t.channel_id === null || t.channel_id === channelId) as Tag[]
      const withoutGenre = filtered.filter(t => t.type !== 'genre')
      setTags(uniqById(withoutGenre))
    }

    void loadTags()
  }, [channelId])

  // --- Load subcategories for selected channel
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

      const ids = Array.from(new Set((postRows ?? []).map(r => r.subcategory_tag_id).filter(Boolean) as number[]))

      if (ids.length === 0) {
        setSubcategoryOptions([])
        setSubcategoryTagId(null)
        return
      }

      const { data: tagRows, error: tagErr } = await supabase.from('tags').select('id, name_he').in('id', ids)

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
    if (settingsLocked) return
    setSelectedTagIds(prev => {
      if (prev.includes(id)) return prev.filter(x => x !== id)
      if (prev.length >= 3) return prev
      return [...prev, id]
    })
  }

  // --- Load draft/post (once) if ?draft=... or ?edit=...
  useEffect(() => {
    const loadDraft = async () => {
      if (!effectivePostId || !userId) return
      if (hasLoadedDraftOnce.current) return

      const { data: post, error } = await supabase
        .from('posts')
        .select(
          'id, slug, title, excerpt, content_json, channel_id, format_id, subcategory_tag_id, status, cover_image_url, cover_source, updated_at'
        )
        .eq('id', effectivePostId)
        .eq('author_id', userId)
        .single()

      if (error || !post) {
        setErrorMsg(error?.message ?? 'לא הצלחתי לטעון טיוטה')
        return
      }

      const d = post as DraftRow
      setLoadedStatus(d.status)

      setDraftSlug(d.slug)
      setTitle((d.title ?? '').toString())
      setExcerpt((d.excerpt ?? '').toString())
      setContentJson((d.content_json as JSONContent) ?? EMPTY_DOC)
      setChannelId(d.channel_id)
      setSubcategoryTagId(d.subcategory_tag_id)
      setCoverUrl(d.cover_image_url)
      setCoverSource(d.cover_source)
      setLastSavedAt(d.updated_at)
      setAutoCoverUsed(d.cover_source === 'pixabay')

      const { data: tagRows } = await supabase.from('post_tags').select('tag_id').eq('post_id', d.id)
      const loadedTagIds = (tagRows ?? []).map(r => r.tag_id)
      setSelectedTagIds(loadedTagIds)

      setInitialSnapshot(
        snapshotOf({
          title: (d.title ?? '').toString(),
          excerpt: (d.excerpt ?? '').toString(),
          contentJson: ((d.content_json as JSONContent) ?? EMPTY_DOC) as JSONContent,
          coverUrl: d.cover_image_url,
          coverSource: d.cover_source,
          channelId: d.channel_id,
          subcategoryTagId: d.subcategory_tag_id,
          selectedTagIds: loadedTagIds,
        })
      )

      hasLoadedDraftOnce.current = true
    }

    void loadDraft()
  }, [effectivePostId, userId])

  const ensureDraft = useCallback(async (): Promise<{ id: string; slug: string } | null> => {
    if (!userId) return null
    // In edit mode we never create a new draft silently.
    if (isEditMode) return null
    if (effectivePostId && draftSlug) return { id: effectivePostId, slug: draftSlug }

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

    setCreatedDraftId(created.id)
    setDraftSlug(created.slug)
    router.replace(`/write?draft=${created.id}`)
    return { id: created.id, slug: created.slug }
  }, [userId, isEditMode, effectivePostId, draftSlug, title, excerpt, contentJson, channelId, subcategoryTagId, coverUrl, coverSource, router])

  const syncTags = useCallback(
    async (postId: string) => {
      if (settingsLocked) return
      await supabase.from('post_tags').delete().eq('post_id', postId)
      if (selectedTagIds.length === 0) return
      await supabase.from('post_tags').insert(selectedTagIds.map(tag_id => ({ post_id: postId, tag_id })))
    },
    [selectedTagIds, settingsLocked]
  )

  const upsertDraftSilently = useCallback(async () => {
    if (!userId) return

    const isEmpty = !title.trim() && !excerpt.trim() && JSON.stringify(contentJson) === JSON.stringify(EMPTY_DOC)
    if (isEmpty && !effectivePostId && !isEditMode) return

    setSaving(true)
    setErrorMsg(null)

    try {
      // ✅ EDIT MODE:
      if (isEditMode) {
        if (!effectivePostId) return

        const payload: Record<string, unknown> = {
          title: title.trim() || null,
          excerpt: excerpt.trim() || null,
          content_json: contentJson,
          cover_image_url: coverUrl,
          cover_source: coverSource,
        }

        if (!settingsLocked) {
          payload.channel_id = channelId
          payload.subcategory_tag_id = subcategoryTagId
        }

        const { error } = await supabase.from('posts').update(payload).eq('id', effectivePostId).eq('author_id', userId)
        if (error) {
          setErrorMsg(error.message)
          return
        }

        if (!settingsLocked) await syncTags(effectivePostId)
        setLastSavedAt(new Date().toISOString())
        return
      }

      const existing = await ensureDraft()
      if (!existing) return

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
        return
      }

      await syncTags(id)
      setLastSavedAt(new Date().toISOString())
    } finally {
      setSaving(false)
      setSavePending(false)
    }
  }, [
    userId,
    title,
    excerpt,
    contentJson,
    effectivePostId,
    ensureDraft,
    channelId,
    subcategoryTagId,
    coverUrl,
    coverSource,
    syncTags,
    isEditMode,
    settingsLocked,
  ])

  // autosave debounce (drafts + edit-drafts)
  useEffect(() => {
    if (!userId) return
    if (!autosaveEnabled) return

    // Prevent one transient render from old state being saved into a new draft.
    const isTransientCarryover = !activeIdFromUrl && !createdDraftId && loadedStatus !== null
    if (isTransientCarryover) return

    if (autosaveTimer.current) clearTimeout(autosaveTimer.current)
    setSavePending(true)

    autosaveTimer.current = setTimeout(() => {
      void upsertDraftSilently()
    }, 900)

    return () => {
      if (autosaveTimer.current) clearTimeout(autosaveTimer.current)
    }
  }, [
    userId,
    autosaveEnabled,
    title,
    excerpt,
    contentJson,
    channelId,
    subcategoryTagId,
    coverUrl,
    coverSource,
    selectedTagIds,
    upsertDraftSilently,
    activeIdFromUrl,
    createdDraftId,
    loadedStatus,
  ])

  // Warn on closing tab / refreshing
  useEffect(() => {
    if (!shouldWarnNavigation) return

    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault()
      e.returnValue = ''
    }

    window.addEventListener('beforeunload', onBeforeUnload)
    return () => window.removeEventListener('beforeunload', onBeforeUnload)
  }, [shouldWarnNavigation])

  // Warn on in-app navigation for anchor links (Next <Link/> renders <a>)
  useEffect(() => {
    if (!shouldWarnNavigation) return

    const message = 'יש לך שינויים שלא נשמרו. לצאת בכל זאת?'

    const onDocumentClickCapture = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null
      const a = target?.closest?.('a') as HTMLAnchorElement | null
      if (!a) return
      const href = a.getAttribute('href')
      if (!href) return

      if (href.startsWith('#') || href.startsWith('mailto:') || href.startsWith('tel:')) return
      if (href.startsWith('http://') || href.startsWith('https://')) return
      if (href === window.location.pathname + window.location.search) return

      const ok = window.confirm(message)
      if (ok) return

      e.preventDefault()
      e.stopPropagation()
    }

    // Back/forward button: confirm on pop
    const onPopState = () => {
      const ok = window.confirm(message)
      if (!ok) {
        // Re-stay on the page
        history.pushState(null, '', window.location.href)
        return
      }
      // User confirmed leaving: remove handler and go back one more step
      window.removeEventListener('popstate', onPopState)
      document.removeEventListener('click', onDocumentClickCapture, true)
      history.back()
    }

    history.pushState(null, '', window.location.href)
    document.addEventListener('click', onDocumentClickCapture, true)
    window.addEventListener('popstate', onPopState)
    return () => {
      document.removeEventListener('click', onDocumentClickCapture, true)
      window.removeEventListener('popstate', onPopState)
    }
  }, [shouldWarnNavigation])

  const handlePickCoverFile = async (file: File) => {
    if (!userId) return
    const postId = isEditMode ? effectivePostId : (await ensureDraft())?.id
    if (!postId) return

    const ext = (file.name.split('.').pop() || 'jpg').toLowerCase()
    const path = `${userId}/${postId}/cover-${crypto.randomUUID()}.${ext}`

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
    if (!isEditMode) {
      const created = await ensureDraft()
      if (!created) return
    } else {
      if (!effectivePostId) return
    }

    setErrorMsg(null)
    const seed = Date.now()
    const res = await fetch(
  `/api/cover/auto?q=${encodeURIComponent(title.trim())}&seed=${seed}`
)
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
setCoverSource('pixabay')
setAutoCoverUsed(true)
  }

  const removeCover = async () => {
    setCoverUrl(null)
    setCoverSource(null)
    setAutoCoverUsed(false)
  }

  const fetchAutoCoverUrl = async (q: string) => {
    const seed = Date.now()
    const res = await fetch(
  `/api/cover/auto?q=${encodeURIComponent(q)}&seed=${seed}`
)
    if (!res.ok) return null
    const json = (await res.json()) as { url?: string }
    return json.url ?? null
  }

  const publish = async () => {
    if (!userId) return

    // ✅ In edit-mode for already published posts, "publish" is actually "save changes".
    if (settingsLocked && effectivePostId) {
      setSaving(true)
      setErrorMsg(null)

      const { error } = await supabase
        .from('posts')
        .update({
          title: title.trim() || null,
          excerpt: excerpt.trim() || null,
          content_json: contentJson,
          cover_image_url: coverUrl,
          cover_source: coverSource,
        })
        .eq('id', effectivePostId)
        .eq('author_id', userId)

      if (error) {
        setErrorMsg(error.message)
        setSaving(false)
        return
      }

      setInitialSnapshot(currentSnapshot)
      setLastSavedAt(new Date().toISOString())

      setSaving(false)
      if (safeReturnParam) return router.push(safeReturnParam)
      if (draftSlug && draftSlug !== 'undefined' && draftSlug !== 'null') return router.push(`/post/${draftSlug}`)
      router.push('/notebook')
      return
    }

    if (!title.trim()) return alert('כותרת היא חובה')
    if (!channelId) return alert('בחר ערוץ')
    if (!subcategoryTagId) return alert('בחר תת־קטגוריה')
    if (selectedTagIds.length < 1) return alert('חובה לבחור לפחות תגית אחת')

    setSaving(true)
    setErrorMsg(null)

    const created = await ensureDraft()
    if (!created) {
      setSaving(false)
      return
    }

    await upsertDraftSilently()

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
      finalCoverSource = 'pixabay'
      setCoverUrl(autoUrl)
      setCoverSource('pixabay')
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
    ? settingsLocked
      ? 'שומר שינויים…'
      : 'שומר טיוטה…'
    : savePending
      ? 'שומר…'
      : lastSavedAt
        ? `נשמר • ${new Date(lastSavedAt).toLocaleString('he-IL')}`
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
            <h1 className="text-2xl font-bold tracking-tight">
              {loadedStatus === 'published' && effectivePostId ? 'עריכת פוסט' : 'כתיבה'}
            </h1>
            <div className="mt-2 text-sm text-muted-foreground">
              {settingsLocked
                ? 'אתה עורך פוסט מפורסם. ההגדרות (קטגוריה/תת־קטגוריה/תגיות) נעולות.'
                : loadedStatus === 'published' && effectivePostId
                  ? 'אתה עורך פוסט קיים.'
                  : 'מקום לעבוד. אין לחץ לפרסם.'}
            </div>
          </div>
          <div className="text-left">
            <div className="text-xs text-muted-foreground">{savingText}</div>
            {effectivePostId ? (
              <div className="mt-1 text-xs text-muted-foreground">
                {loadedStatus === 'published' ? 'פוסט:' : 'טיוטה:'} {effectivePostId.slice(0, 8)}…
              </div>
            ) : null}
          </div>
        </header>

        {errorMsg ? (
          <div className="mb-4 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">{errorMsg}</div>
        ) : null}

        <section className="rounded-3xl border bg-white p-4 shadow-sm">
          <div className="grid gap-4 md:grid-cols-3">
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
                  {autoCoverUsed || coverSource === 'pixabay' ? 'החלף תמונה אוטומטית' : 'בחר קאבר אוטומטית'}
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

              <details className="mt-4 rounded-2xl border bg-neutral-50 p-4" open={settingsLocked ? false : undefined}>
                <summary className="cursor-pointer text-sm font-medium">
                  הגדרות (ערוץ · תת־קטגוריה · תגיות){settingsLocked ? ' — נעול' : ''}
                </summary>

                {settingsLocked ? (
                  <div className="mt-3 rounded-xl border bg-white p-3 text-xs text-muted-foreground">
                    כדי לשנות קטגוריה/תגיות צריך ליצור פוסט חדש. כאן ניתן לערוך רק תוכן/כותרת/תקציר/קאבר.
                  </div>
                ) : null}

                <div className="mt-4 grid gap-4 md:grid-cols-2">
                  <div>
                    <label className="block text-sm font-medium">ערוץ</label>
                    <select
                      disabled={settingsLocked}
                      value={channelId ?? ''}
                      onChange={e => {
                        const next = Number(e.target.value)
                        setChannelId(next)
                        setSubcategoryTagId(null)
                      }}
                      className="mt-2 w-full rounded-2xl border bg-white px-4 py-3 text-sm disabled:opacity-60"
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
                      disabled={settingsLocked}
                      value={subcategoryTagId ?? ''}
                      onChange={e => {
                        const v = e.target.value
                        setSubcategoryTagId(v ? Number(v) : null)
                      }}
                      className="mt-2 w-full rounded-2xl border bg-white px-4 py-3 text-sm disabled:opacity-60"
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
                          disabled={settingsLocked}
                          onClick={() => toggleTag(t.id)}
                          className={
                            'rounded-full border px-3 py-1.5 text-sm transition disabled:opacity-60 ' +
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

        <section className="mt-5 rounded-3xl border bg-white p-4 shadow-sm">
          <div className="mb-3 flex items-center justify-between gap-3">
            <h2 className="text-sm font-medium">הטקסט</h2>
            <div className="text-xs text-muted-foreground">
              {autosaveEnabled ? 'הטקסט נשמר אוטומטית' : 'השינויים לא נשמרים עד שלוחצים שמור'}
            </div>
          </div>
          <Editor value={contentJson} onChange={setContentJson} />
        </section>

        <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
          <div className="text-xs text-muted-foreground">
            {isEditMode ? (
              <>
                טיפ: אם לא בטוח—אפשר ללחוץ <span className="font-bold">ביטול שינויים</span>.
              </>
            ) : (
              <>
                טיפ: אפשר לצאת מהעמוד ולחזור דרך <span className="font-bold">המחברת</span>.
              </>
            )}
          </div>

          <div className="flex items-center gap-2">
            {isEditMode ? (
              <button
                type="button"
                onClick={() => {
                  if (shouldWarnNavigation) {
                    const ok = confirm('לבטל ולזרוק את השינויים שלא נשמרו?')
                    if (!ok) return
                  }
                  if (safeReturnParam) return router.push(safeReturnParam)
                  if (typeof window !== 'undefined' && window.history.length > 1) return router.back()
                  if (draftSlug && draftSlug !== 'undefined' && draftSlug !== 'null') return router.push(`/post/${draftSlug}`)
                  router.push('/notebook')
                }}
                className="rounded-full border bg-white px-4 py-2 text-sm hover:bg-neutral-50"
              >
                ביטול שינויים
              </button>
            ) : (
              <button
                type="button"
                onClick={() => {
                  if (shouldWarnNavigation) {
                    const ok = confirm('יש לך טקסט שלא נשמר עדיין. לצאת בכל זאת?')
                    if (!ok) return
                  }
                  router.push('/notebook')
                }}
                className="rounded-full border bg-white px-4 py-2 text-sm hover:bg-neutral-50"
              >
                למחברת
              </button>
            )}

            <button
              type="button"
              onClick={() => void publish()}
              disabled={saving}
              className="rounded-full bg-neutral-900 px-4 py-2 text-sm text-white hover:bg-neutral-800 disabled:opacity-50"
            >
              {saving ? (settingsLocked ? 'שומר…' : 'מפרסם…') : settingsLocked ? 'שמור שינויים' : 'פרסם'}
            </button>
          </div>
        </div>
      </div>
    </main>
  )
}
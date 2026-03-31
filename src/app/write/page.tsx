'use client'


import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import type { JSONContent } from '@tiptap/react'
import Editor from '@/components/Editor'
import Badge from '@/components/Badge'
import { supabase } from '@/lib/supabaseClient'
import { mapSupabaseError } from '@/lib/mapSupabaseError'
import { useToast } from '@/components/Toast'
import { event as gaEvent } from '@/lib/gtag'
import {
  CHANNEL_SLUG_TO_NAME_HE,
  TAG_TYPES_BY_CHANNEL,
  SUBCATEGORY_NAMES_BY_CHANNEL,
  sortHebrew,
} from '@/lib/taxonomy'
import { generatePostSlug, resolveUniquePostSlug } from '@/lib/postSlug'
import { notifyFeedContentUpdated } from '@/lib/feedFreshness'

type Channel = { id: number; name_he: string }
type Tag = { id: number; type: 'emotion' | 'theme' | 'genre' | 'topic'; name_he: string; channel_id: number | null }
type TagType = Tag['type']
type SubcategoryOption = { id: number; name_he: string }

type TagId = number

const MAX_TAGS = 3
const CONTENT_MAX = 15_000

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
const TITLE_MAX = 72
const EXCERPT_MAX = 160

function extractTextFromDoc(node: JSONContent): string {
  if (node.type === 'text') return node.text ?? ''
  if (!node.content) return ''
  return node.content.map(extractTextFromDoc).join('')
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
    __TYUTA_UNSAVED__?: { enabled: boolean; message: string }
  }
}

export default function WritePage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { toast } = useToast()

  // draft = create/edit draft flow
  // edit  = edit an existing post without forcing it into drafts
  const editParam = searchParams.get('edit')
  const draftParam = searchParams.get('draft')
  const returnParam = searchParams.get('return')
  const channelParam = searchParams.get('channel')
  const subcategoryParam = searchParams.get('subcategory')

  // URL presets
  const resolveChannelIdFromParam = (param: string | null, channelRows: Channel[]): number | null => {
    if (!param) return null
    if (/^\d+$/.test(param)) return Number(param)
    const nameHe = CHANNEL_SLUG_TO_NAME_HE[param] ?? param
    const byName = channelRows.find(c => c.name_he === nameHe)
    return byName?.id ?? null
  }

  const resolveSubcategoryIdFromParam = (param: string | null, subcats: SubcategoryOption[]): number | null => {
    if (!param) return null
    const match = subcats.find(s => s.name_he === param)
    return match?.id ?? null
  }


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
  // Draft cover uploads live in the private bucket `post-assets`.
  // In that case we persist the *storage path* in DB, and only generate Signed URLs for preview.
  const [coverStoragePath, setCoverStoragePath] = useState<string | null>(null)
  const [coverSource, setCoverSource] = useState<string | null>(null)
  const [autoCoverUsed, setAutoCoverUsed] = useState(false)
  const [isCoverLoading, setIsCoverLoading] = useState(false)

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [savePending, setSavePending] = useState(false) // debounce pending
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(null)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  // ג… Lock settings (channel/subcategory/tags) when editing an already published post.
  const settingsLocked = useMemo(() => isEditMode && loadedStatus === 'published', [isEditMode, loadedStatus])
  const autosaveEnabled = useMemo(() => !settingsLocked, [settingsLocked])

  // Chapters feature: enabled only for ׳¡׳™׳₪׳•׳¨׳™׳ > ׳¡׳™׳₪׳•׳¨ ׳‘׳”׳׳©׳›׳™׳
  const chaptersEnabled = useMemo(() => {
    const ch = channels.find(c => c.id === channelId)
    const sub = subcategoryOptions.find(s => s.id === subcategoryTagId)
    return ch?.name_he === '׳¡׳™׳₪׳•׳¨׳™׳' && sub?.name_he === '׳¡׳™׳₪׳•׳¨ ׳‘׳”׳׳©׳›׳™׳'
  }, [channels, channelId, subcategoryOptions, subcategoryTagId])

  const [chapterUserPosts, setChapterUserPosts] = useState<Array<{ id: string; slug: string; title: string }>>([])

  // ׳”׳₪׳¨׳§ ׳”׳ ׳•׳›׳—׳™ ׳©׳ ׳׳¦׳ ׳‘׳¢׳¨׳™׳›׳” (׳¨׳§ ׳›׳׳©׳¨ ׳›׳‘׳¨ ׳ ׳•׳¦׳¨׳” ׳˜׳™׳•׳˜׳” ׳¢׳ ID)
  const currentDraftForChapters = useMemo(() => {
    if (!effectivePostId || !draftSlug) return null
    return { id: effectivePostId, slug: draftSlug, title: title || '׳”׳₪׳¨׳§ ׳”׳ ׳•׳›׳—׳™' }
  }, [effectivePostId, draftSlug, title])

  // ׳›׳©׳”׳׳©׳×׳׳© ׳¢׳•׳–׳‘ ׳׳¦׳‘ "׳¡׳™׳₪׳•׳¨ ׳‘׳”׳׳©׳›׳™׳" ג€“ ׳ ׳§׳” relatedPosts ׳׳™׳“ (׳׳ ׳™׳¢׳× ׳©׳׳™׳¨׳× ׳ ׳×׳•׳ ׳™׳ ׳™׳©׳ ׳™׳)
  const prevChaptersEnabledRef = useRef<boolean | null>(null)
  useEffect(() => {
    const prev = prevChaptersEnabledRef.current
    prevChaptersEnabledRef.current = chaptersEnabled
    // ׳¨׳§ ׳›׳©׳™׳© ׳׳¢׳‘׳¨ ׳׳₪׳¢׳™׳ג†’׳›׳‘׳•׳™ (׳׳ ׳‘׳˜׳¢׳™׳ ׳” ׳¨׳׳©׳•׳ ׳™׳× ׳›׳©׳”׳¢׳¨׳ ׳›׳‘׳¨ false)
    if (prev !== true || chaptersEnabled) return
    setContentJson(c => ({
      ...c,
      content: (c?.content ?? []).filter((n: JSONContent) => n.type !== 'relatedPosts'),
    }))
  }, [chaptersEnabled])

  useEffect(() => {
    if (!chaptersEnabled || !userId) {
      setChapterUserPosts([])
      return
    }
    let cancelled = false
    supabase
      .from('posts')
      .select('id, slug, title')
      .eq('author_id', userId)
      .eq('status', 'published')
      .order('published_at', { ascending: false, nullsFirst: false })
      .limit(50)
      .then(({ data }) => {
        if (cancelled) return
        setChapterUserPosts((data ?? []) as Array<{ id: string; slug: string; title: string }>)
      })
    return () => { cancelled = true }
  }, [chaptersEnabled, userId])

  // Track "dirty" state for edit-mode (published) so Cancel can truly discard changes
  const [initialSnapshot, setInitialSnapshot] = useState<string | null>(null)
  const currentSnapshot = useMemo(() => {
    return snapshotOf({
      title,
      excerpt,
      contentJson,
      // Use the DB value, not a preview Signed URL.
      coverUrl: coverStoragePath ?? coverUrl,
      coverSource,
      channelId,
      subcategoryTagId,
      selectedTagIds,
    })
  }, [title, excerpt, contentJson, coverUrl, coverStoragePath, coverSource, channelId, subcategoryTagId, selectedTagIds])

  const isDirty = useMemo(() => {
    if (!isEditMode) return false
    if (initialSnapshot === null) return false
    return initialSnapshot !== currentSnapshot
  }, [isEditMode, initialSnapshot, currentSnapshot])

  const contentLength = useMemo(() => extractTextFromDoc(contentJson).length, [contentJson])

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
    window.__TYUTA_UNSAVED__ = {
      enabled: shouldWarnNavigation,
      message: '׳™׳© ׳׳ ׳©׳™׳ ׳•׳™׳™׳ ׳©׳׳ ׳ ׳©׳׳¨׳•. ׳׳¦׳׳× ׳‘׳›׳ ׳–׳׳×?',
    }
    return () => {
      // don't force-disable; just mark disabled when unmount
      window.__TYUTA_UNSAVED__ = { enabled: false, message: '' }
    }
  }, [shouldWarnNavigation])

  const autosaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const hasLoadedDraftOnce = useRef(false)
  /**
   * Monotonically-increasing save counter.
   * Every autosave request captures `mySeq = ++saveSeqRef.current` at start.
   * Response-side state updates (lastSavedAt, createdDraftId) are only applied
   * when `mySeq === saveSeqRef.current`, i.e. no newer save has started since.
   * This prevents stale responses from overwriting newer UI state.
   */
  const saveSeqRef = useRef(0)
  const subcatReqSeq = useRef(0)
  const tagsReqSeq = useRef(0)
  const publishingRef = useRef(false)
  const titleInputRef = useRef<HTMLInputElement>(null)
  const contentSectionRef = useRef<HTMLElement>(null)
  const settingsDetailsRef = useRef<HTMLDetailsElement>(null)
  const channelSelectRef = useRef<HTMLSelectElement>(null)
  const subcategorySelectRef = useRef<HTMLSelectElement>(null)
  const tagsAreaRef = useRef<HTMLDivElement>(null)
  const coverAreaRef = useRef<HTMLDivElement>(null)
  const [highlightTitle, setHighlightTitle] = useState(false)
  const [highlightContent, setHighlightContent] = useState(false)
  const [highlightChannel, setHighlightChannel] = useState(false)
  const [highlightSubcategory, setHighlightSubcategory] = useState(false)
  const [highlightTags, setHighlightTags] = useState(false)
  // --- Auth guard
  useEffect(() => {
    const run = async () => {
      const { data } = await supabase.auth.getUser()
      const user = data.user
      if (!user) {
        router.push('/auth/login')
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
        setErrorMsg(chErr.message ?? '׳©׳’׳™׳׳” ׳‘׳˜׳¢׳™׳ ׳× ׳ ׳×׳•׳ ׳™׳')
        setLoading(false)
        return
      }

      const chRows = (ch ?? []) as Channel[]
      setChannels(chRows)

      // default selection: prefer URL channel param, fall back to first channel
      const firstChannelId = chRows[0]?.id ?? null
      const urlChannelId = resolveChannelIdFromParam(channelParam, chRows)
      setChannelId(prev => prev ?? (urlChannelId ?? firstChannelId))

      setLoading(false)
    }

    void load()
  // eslint-disable-next-line react-hooks/exhaustive-deps -- load once on mount; channelParam is stable from initial URL
  }, [])

  // Apply URL presets (channel/subcategory) deterministically on navigation.
// We intentionally do NOT auto-select a subcategory unless it was explicitly provided in the URL.
const presetKey = `${channelParam ?? ''}|${subcategoryParam ?? ''}|${activeIdFromUrl ?? ''}`

useEffect(() => {
  if (!channels.length) return
  const nextChannel = resolveChannelIdFromParam(channelParam, channels)
  if (nextChannel != null) setChannelId(nextChannel)

  // If we have a channel preset but no explicit subcategory, keep it unselected ("׳‘׳—׳¨ ׳×׳×ײ¾׳§׳˜׳’׳•׳¨׳™׳”")
  if (channelParam && !subcategoryParam) {
    setSubcategoryTagId(null)
  }
// eslint-disable-next-line react-hooks/exhaustive-deps -- param-sync effect, stable function
}, [presetKey, channels, channelParam, subcategoryParam, activeIdFromUrl])



  // Apply URL subcategory preset after options are loaded
  useEffect(() => {
    if (!subcategoryParam) return
    if (!subcategoryOptions.length) return
    const next = resolveSubcategoryIdFromParam(subcategoryParam, subcategoryOptions)
    if (next != null) setSubcategoryTagId(next)
  }, [subcategoryOptions, subcategoryParam, presetKey])

  // --- Load subcategory (genre) options + tags for the selected channel
  useEffect(() => {
    const req = ++subcatReqSeq.current

    const run = async () => {
      if (!channelId) return
      if (!channels.length) return

      const currentChannelNameHe = channels.find(c => c.id === channelId)?.name_he ?? ''
      const allowedSubcats = SUBCATEGORY_NAMES_BY_CHANNEL[currentChannelNameHe] ?? []

      const { data, error } = await supabase
        .from('tags')
        .select('id, name_he, type, channel_id')
        .eq('type', 'genre')
        .eq('channel_id', channelId)
        .order('name_he')

      if (req !== subcatReqSeq.current) return

      if (error) {
        // Don't block the editor; just keep empty options
        console.error('Failed to load subcategories', error)
        setSubcategoryOptions([])
        return
      }

      const rowsRaw = ((data ?? []) as Array<{ id: number; name_he: string; type: 'genre'; channel_id: number | null }>).filter(r =>
        allowedSubcats.length ? allowedSubcats.includes(r.name_he) : true,
      )

      // Some environments may contain duplicate "genre" tags (same Hebrew name). Deduplicate by name.
      const byName = new Map<string, { id: number; name_he: string }>()
      for (const r of rowsRaw) {
        if (!byName.has(r.name_he)) byName.set(r.name_he, { id: r.id, name_he: r.name_he })
      }
      const rows = Array.from(byName.values())

      // Respect the display order defined in SUBCATEGORY_NAMES_BY_CHANNEL
      if (allowedSubcats.length) {
        rows.sort((a, b) => {
          const ai = allowedSubcats.indexOf(a.name_he)
          const bi = allowedSubcats.indexOf(b.name_he)
          return (ai === -1 ? Infinity : ai) - (bi === -1 ? Infinity : bi)
        })
      }

      setSubcategoryOptions(rows)

      // If current selected subcategory no longer exists, clear it
      setSubcategoryTagId(prev => (prev && rows.some(r => r.id === prev) ? prev : null))
    }

    void run()
  }, [channelId, channels])

  useEffect(() => {
    const req = ++tagsReqSeq.current

    const run = async () => {
      if (!channelId) return
      if (!channels.length) return

      const currentChannelNameHe = channels.find(c => c.id === channelId)?.name_he ?? ''
      const allowedTypes = TAG_TYPES_BY_CHANNEL[currentChannelNameHe] ?? (['emotion', 'theme', 'topic'] as TagType[])

      const { data, error } = await supabase
        .from('tags')
        .select('id, name_he, type, channel_id')
        .in('type', allowedTypes)
        .or(`channel_id.is.null,channel_id.eq.${channelId}`)

      if (req !== tagsReqSeq.current) return

      if (error) {
        console.error('Failed to load tags', error)
        setTags([])
        return
      }

      const rows = sortHebrew((data ?? []) as Tag[])
      setTags(rows)

      // Drop selected tags that are no longer available
      setSelectedTagIds(prev => prev.filter(id => rows.some(t => t.id === id)))
    }

    void run()
  }, [channelId, channels])

  // reset load guard when URL changes
  useEffect(() => {
    hasLoadedDraftOnce.current = false
  }, [activeIdFromUrl])

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
        setErrorMsg(error?.message ?? '׳׳ ׳”׳¦׳׳—׳×׳™ ׳׳˜׳¢׳•׳ ׳˜׳™׳•׳˜׳”')
        return
      }

      const d = post as DraftRow
      setLoadedStatus(d.status)

      setDraftSlug(d.slug)
      // Keep placeholder visible when DB stores a "safe" title like a single space.
      const loadedTitle = (d.title ?? '').toString()
      setTitle(loadedTitle.trim() ? loadedTitle : '')
      setExcerpt((d.excerpt ?? '').toString())
      setContentJson((d.content_json as JSONContent) ?? EMPTY_DOC)
      // Prefer URL preset over stored draft values (important for flows like /write?channel=magazine&...)
      const urlChannelId = resolveChannelIdFromParam(channelParam, channels)
      setChannelId(urlChannelId ?? d.channel_id)
      // If we came with a channel preset (dropdown/home) but no explicit subcategory, keep subcategory unselected.
      if (channelParam && !subcategoryParam) {
        setSubcategoryTagId(null)
      } else {
        setSubcategoryTagId(d.subcategory_tag_id)
      }
      // Draft covers might store a storage path (private bucket). For preview we must turn it into a signed URL.
      if (d.status === 'draft' && d.cover_image_url && !String(d.cover_image_url).startsWith('http')) {
        const path = String(d.cover_image_url)
        setCoverStoragePath(path)
        const { data: signed } = await supabase.storage.from('post-assets').createSignedUrl(path, 60 * 60)
        setCoverUrl(signed?.signedUrl ?? null)
      } else {
        setCoverStoragePath(null)
        setCoverUrl(d.cover_image_url)
      }
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
          // Snapshot compares what we store in DB; drafts store path, published stores public URL.
          coverUrl: d.status === 'draft' ? d.cover_image_url : d.cover_image_url,
          coverSource: d.cover_source,
          channelId: d.channel_id,
          subcategoryTagId: d.subcategory_tag_id,
          selectedTagIds: loadedTagIds,
        })
      )

      hasLoadedDraftOnce.current = true
    }

    void loadDraft()
  // eslint-disable-next-line react-hooks/exhaustive-deps -- draft load on mount/id change only
  }, [effectivePostId, userId, channels, channelParam])

  const ensureDraft = useCallback(async (): Promise<{ id: string; slug: string } | null> => {
    if (!userId) return null
    const { data: { session: _s } } = await supabase.auth.getSession()
    if (!_s) { setErrorMsg('׳”׳¡׳©׳ ׳₪׳’ ׳×׳•׳§׳£ ג€“ ׳¨׳¢׳ ׳ ׳׳× ׳”׳“׳£'); return null }
    // In edit mode we never create a new draft silently.
    if (isEditMode) return null
    if (effectivePostId && draftSlug) return { id: effectivePostId, slug: draftSlug }

    if (createdDraftId && draftSlug) return { id: createdDraftId, slug: draftSlug }
    if (createdDraftId) return { id: createdDraftId, slug: draftSlug ?? '' }


    // ג… channel_id is NOT NULL ג€” make sure we always have one before insert
let effectiveChannelId = channelId

// Prefer URL preset if provided
const urlPresetChannelId = resolveChannelIdFromParam(channelParam, channels)
if (urlPresetChannelId != null) effectiveChannelId = urlPresetChannelId

if (!effectiveChannelId) {
  // try from loaded channels state
  const first = channels?.[0]?.id ?? null
  effectiveChannelId = first

  // if still null, fetch once from DB (covers first load race)
  if (!effectiveChannelId) {
    const { data: ch } = await supabase
      .from('channels')
      .select('id')
      .order('sort_order')
      .limit(1)

    effectiveChannelId = ch?.[0]?.id ?? null
  }

  if (!effectiveChannelId) {
    setErrorMsg('׳׳ ׳ ׳׳¦׳׳• ׳¢׳¨׳•׳¦׳™׳ (channels). ׳—׳™׳™׳‘ ׳׳”׳™׳•׳× ׳׳₪׳—׳•׳× ׳¢׳¨׳•׳¥ ׳׳—׳“ ׳›׳“׳™ ׳׳™׳¦׳•׳¨ ׳˜׳™׳•׳˜׳”.')
    return null
  }

  // sync state so next saves use it
  setChannelId(effectiveChannelId)
}

    // crypto.randomUUID is not available in all environments (and can be missing on non-HTTPS origins).
    // Use a safe fallback.
    const slug =
      typeof globalThis !== 'undefined' &&
      'crypto' in globalThis &&
      (globalThis.crypto as Crypto | undefined)?.randomUUID
        ? (globalThis.crypto as Crypto).randomUUID()
        : `${Date.now()}-${Math.random().toString(16).slice(2)}`
    // posts.title is NOT NULL. We allow an "empty" UI title while keeping DB valid by storing a single space.
    // On publish we still enforce a real title.
    const dbTitle = title.trim() ? title.trim() : ' '

    const effectiveSubcategoryTagId: number | null = (() => {
      if (subcategoryTagId != null) return subcategoryTagId
      const urlSub = resolveSubcategoryIdFromParam(subcategoryParam, subcategoryOptions)
      return urlSub
    })()

    const { data: created, error } = await supabase
      .from('posts')
      .insert({

        slug,
        title: dbTitle,
        excerpt: excerpt.trim() || null,
        content_json: contentJson,
        channel_id: effectiveChannelId,
                subcategory_tag_id: effectiveSubcategoryTagId,

        author_id: userId,
        status: 'draft',
        cover_image_url: coverUrl,
        cover_source: coverSource,
      })
      .select('id, slug')
      .single()

    if (error || !created) {
      setErrorMsg(mapSupabaseError(error ?? null) ?? error?.message ?? '׳©׳’׳™׳׳” ׳‘׳™׳¦׳™׳¨׳× ׳˜׳™׳•׳˜׳”')
      return null
    }

    setCreatedDraftId(created.id)
    setDraftSlug(created.slug)
    const params = new URLSearchParams(searchParams.toString())
    params.set('draft', created.id)
    router.replace(`/write?${params.toString()}`)
        return { id: created.id, slug: created.slug }
  // eslint-disable-next-line react-hooks/exhaustive-deps -- resolveChannelIdFromParam is stable
  }, [
    userId,
    isEditMode,
    effectivePostId,
    draftSlug,
    createdDraftId,
    title,
    excerpt,
    contentJson,
    channelId,
    channels,
    subcategoryTagId,
    subcategoryOptions,
    channelParam,
    subcategoryParam,
    searchParams,
    coverUrl,
    coverSource,
    router,
  ])

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
    const { data: { session: _s } } = await supabase.auth.getSession()
    if (!_s) { setErrorMsg('׳”׳¡׳©׳ ׳₪׳’ ׳×׳•׳§׳£ ג€“ ׳¨׳¢׳ ׳ ׳׳× ׳”׳“׳£'); return }

    const isEmpty = !title.trim() && !excerpt.trim() && JSON.stringify(contentJson) === JSON.stringify(EMPTY_DOC)
    if (isEmpty && !effectivePostId && !isEditMode) return

    // Capture a seq token. Any response-side setState below is gated on this
    // token still being the latest, preventing stale saves from overwriting newer state.
    const mySeq = ++saveSeqRef.current

    setSaving(true)
    setErrorMsg(null)

    try {
      // ג… EDIT MODE:
      if (isEditMode) {
        if (!effectivePostId) return

        const coverDbValue = coverStoragePath ?? coverUrl

        const payload: Record<string, unknown> = {
          title: title.trim() ? title.trim() : ' ',
          excerpt: excerpt.trim() || null,
          content_json: contentJson,
          cover_image_url: coverDbValue,
          cover_source: coverSource,
        }

        if (!settingsLocked) {
          payload.channel_id = channelId
          payload.subcategory_tag_id = subcategoryTagId
        }

        const { error } = await supabase.from('posts').update(payload).eq('id', effectivePostId).eq('author_id', userId)
        if (error) {
          setErrorMsg(mapSupabaseError(error) ?? error.message)
          return
        }

        if (!settingsLocked) await syncTags(effectivePostId)
        // Only update lastSavedAt if no newer save has started since ours
        if (mySeq === saveSeqRef.current) setLastSavedAt(new Date().toISOString())
        return
      }

      const existing = await ensureDraft()
      if (!existing) return

      const { id } = existing
      const coverDbValue = coverStoragePath ?? coverUrl
      const { error } = await supabase
        .from('posts')
        .update({
          title: title.trim() ? title.trim() : ' ',
          excerpt: excerpt.trim() || null,
          content_json: contentJson,
          channel_id: channelId,
          subcategory_tag_id: subcategoryTagId,
          cover_image_url: coverDbValue,
          cover_source: coverSource,
        })
        .eq('id', id)
        .eq('author_id', userId)

      if (error) {
        setErrorMsg(mapSupabaseError(error) ?? error.message)
        return
      }

      await syncTags(id)
      // Only update meta if this is still the latest save response
      if (mySeq === saveSeqRef.current) setLastSavedAt(new Date().toISOString())
    } finally {
      // Only clear the saving/pending indicators when no newer save is in flight
      if (mySeq === saveSeqRef.current) {
        setSaving(false)
        setSavePending(false)
      }
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
    coverStoragePath,
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

    const message = '׳™׳© ׳׳ ׳©׳™׳ ׳•׳™׳™׳ ׳©׳׳ ׳ ׳©׳׳¨׳•. ׳׳¦׳׳× ׳‘׳›׳ ׳–׳׳×?'

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
    const { data: { session: _coverSession } } = await supabase.auth.getSession()
    if (!_coverSession) { setErrorMsg('׳”׳¡׳©׳ ׳₪׳’ ׳×׳•׳§׳£ ג€“ ׳¨׳¢׳ ׳ ׳׳× ׳”׳“׳£'); return }
    const postId = isEditMode ? effectivePostId : (await ensureDraft())?.id
    if (!postId) return

    setIsCoverLoading(true)
    const ext = (file.name.split('.').pop() || 'jpg').toLowerCase()
    const uuid =
      typeof globalThis !== 'undefined' &&
      'crypto' in globalThis &&
      (globalThis.crypto as Crypto | undefined)?.randomUUID
        ? (globalThis.crypto as Crypto).randomUUID()
        : `${Date.now()}-${Math.random().toString(16).slice(2)}`
    const path = `${userId}/${postId}/cover-${uuid}.${ext}`

    const { error: uploadErr } = await supabase.storage.from('post-assets').upload(path, file, {
      upsert: false,
      contentType: file.type || undefined,
    })

    if (uploadErr) {
      setIsCoverLoading(false)
      setErrorMsg(uploadErr.message)
      return
    }

    const { data: signed } = await supabase.storage
  .from('post-assets')
  .createSignedUrl(path, 60 * 60)
    setCoverStoragePath(path)
    setCoverUrl(signed?.signedUrl ?? null)
    setCoverSource('upload')
    setAutoCoverUsed(false)
  }

  const chooseAutoCover = async () => {
    if (!title.trim()) {
      toast('׳›׳“׳™ ׳׳‘׳—׳•׳¨ ׳§׳׳‘׳¨ ׳׳•׳˜׳•׳׳˜׳™ ׳¦׳¨׳™׳ ׳›׳•׳×׳¨׳× (׳׳׳ ׳¡׳™׳׳ ׳™׳)', 'error')
      return
    }
    const postId = isEditMode ? effectivePostId : (await ensureDraft())?.id
    if (!postId || !userId) return

    setIsCoverLoading(true)
    setErrorMsg(null)
    const seed = Date.now()
    const { data: { session } } = await supabase.auth.getSession()
    const headers: Record<string, string> = {}
    if (session?.access_token) {
      headers['Authorization'] = `Bearer ${session.access_token}`
    }
    const res = await fetch(
      `/api/cover/auto?q=${encodeURIComponent(title.trim())}&seed=${seed}&postId=${postId}`,
      { headers }
    )
    if (!res.ok) {
      setIsCoverLoading(false)
      setErrorMsg('׳׳ ׳”׳¦׳׳—׳×׳™ ׳׳”׳‘׳™׳ ׳×׳׳•׳ ׳” ׳×׳ ׳¡׳”/׳™ ׳׳›׳×׳•׳‘ ׳›׳•׳×׳¨׳× ׳‘׳¨׳•׳¨׳” ׳׳׳ ׳¡׳™׳׳ ׳™׳')
      return
    }
    const json = (await res.json()) as { storagePath?: string | null; signedUrl?: string | null; url?: string }
    if (json.storagePath && json.signedUrl) {
      setCoverStoragePath(json.storagePath)
      setCoverUrl(json.signedUrl)
      setCoverSource('upload')
    } else if (json.url) {
      setCoverStoragePath(null)
      setCoverUrl(json.url)
      setCoverSource('pixabay')
    } else {
      setIsCoverLoading(false)
      setErrorMsg('׳׳ ׳ ׳׳¦׳׳” ׳×׳׳•׳ ׳” ׳׳×׳׳™׳׳”')
      return
    }
    setAutoCoverUsed(true)
  }

  const removeCover = async () => {
    setIsCoverLoading(false)
    setCoverStoragePath(null)
    setCoverUrl(null)
    setCoverSource(null)
    setAutoCoverUsed(false)
  }

  const fetchAutoCoverUrl = async (q: string, postId: string): Promise<{ storagePath: string | null; displayUrl: string } | null> => {
    const seed = Date.now()
    const { data: { session } } = await supabase.auth.getSession()
    const headers: Record<string, string> = {}
    if (session?.access_token) {
      headers['Authorization'] = `Bearer ${session.access_token}`
    }
    const res = await fetch(
      `/api/cover/auto?q=${encodeURIComponent(q)}&seed=${seed}&postId=${postId}`,
      { headers }
    )
    if (!res.ok) return null
    const json = (await res.json()) as { storagePath?: string | null; signedUrl?: string | null; url?: string }
    if (json.storagePath && json.signedUrl) {
      return { storagePath: json.storagePath, displayUrl: json.signedUrl }
    }
    if (json.url) {
      return { storagePath: null, displayUrl: json.url }
    }
    return null
  }

  const publish = async () => {
    if (saving || publishingRef.current) return
    if (!userId) return
    const { data: { session: _pubSession } } = await supabase.auth.getSession()
    if (!_pubSession) { setErrorMsg('׳”׳¡׳©׳ ׳₪׳’ ׳×׳•׳§׳£ ג€“ ׳¨׳¢׳ ׳ ׳׳× ׳”׳“׳£'); return }
    publishingRef.current = true
    try {

    // === Common validations (both edit and publish modes) ===

    if (title.trim().length > TITLE_MAX) {
      toast(`׳”׳›׳•׳×׳¨׳× ׳™׳›׳•׳׳” ׳׳”׳›׳™׳ ׳¢׳“ ${TITLE_MAX} ׳×׳•׳•׳™׳`, 'error')
      titleInputRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      titleInputRef.current?.focus({ preventScroll: true })
      setHighlightTitle(true)
      setTimeout(() => setHighlightTitle(false), 2500)
      return
    }

    if (contentLength > CONTENT_MAX) {
      toast(`׳”׳˜׳§׳¡׳˜ ׳׳¨׳•׳ ׳׳“׳™ (${contentLength.toLocaleString('he-IL')} ׳×׳•׳•׳™׳). ׳”׳׳’׳‘׳׳” ׳”׳™׳ ${CONTENT_MAX.toLocaleString('he-IL')} ׳×׳•׳•׳™׳.`, 'error')
      contentSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      setHighlightContent(true)
      setTimeout(() => setHighlightContent(false), 2500)
      return
    }

    if (autosaveTimer.current) clearTimeout(autosaveTimer.current)
    setSavePending(false)

    let activeCoverStoragePath = coverStoragePath
    let activeCoverSource = coverSource

    const promoteCoverIfNeeded = async (opts: { postId: string; postSlug: string }) => {
      // Promote any cover stored in private post-assets (upload or pixabay).
      if (!activeCoverStoragePath) return { publicUrl: coverUrl, source: activeCoverSource }

      // Promote through the server route so oversized covers can be compressed safely.
      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.access_token) {
        throw new Error('פג תוקף ההתחברות. רענני את הדף ונסי שוב.')
      }



      const response = await fetch('/api/storage/promote-cover', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          postId: opts.postId,
          sourcePath: activeCoverStoragePath,
        }),
      })

      const json = (await response.json().catch(() => ({}))) as { error?: string; publicUrl?: string | null }
      if (!response.ok) {
        throw new Error(json.error ?? 'לא הצלחתי להעביר את הקאבר')
      }

      const publicUrl = json.publicUrl ?? coverUrl
      return { publicUrl, source: activeCoverSource }
    }

    // ג… In edit-mode for already published posts, "publish" is actually "save changes".
    if (settingsLocked && effectivePostId) {
      setSaving(true)
      setErrorMsg(null)

      try {
        const promoted = await promoteCoverIfNeeded({ postId: effectivePostId, postSlug: draftSlug ?? '' })
        if (promoted.publicUrl && promoted.publicUrl !== coverUrl) {
          setCoverUrl(promoted.publicUrl)
          setCoverStoragePath(null)
          setCoverSource(promoted.source)
        }

        const { error } = await supabase
          .from('posts')
          .update({
            title: title.trim() ? title.trim() : ' ',
            excerpt: excerpt.trim() || null,
            content_json: contentJson,
            cover_image_url: promoted.publicUrl,
            cover_source: promoted.source,
          })
          .eq('id', effectivePostId)
          .eq('author_id', userId)

        if (error) {
          const mapped = mapSupabaseError(error)
          if (mapped) {
            setErrorMsg(mapped)
          } else {
            const msg = error.message
            setErrorMsg(
              msg.includes('value too long') || msg.includes('check constraint')
                ? `׳”׳›׳•׳×׳¨׳× ׳™׳›׳•׳׳” ׳׳”׳›׳™׳ ׳¢׳“ ${TITLE_MAX} ׳×׳•׳•׳™׳`
                : msg
            )
          }
          setSaving(false)
          return
        }

        setInitialSnapshot(currentSnapshot)
        setLastSavedAt(new Date().toISOString())

        // Bust the ISR cache so readers see the updated post immediately.
        if (draftSlug && draftSlug !== 'undefined' && draftSlug !== 'null') {
          void supabase.auth.getSession().then(async ({ data: { session } }) => {
            if (!session?.access_token) return
            const response = await fetch('/api/posts/revalidate', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session.access_token}` },
              body: JSON.stringify({ slug: draftSlug }),
            })

            if (response.ok) {
              notifyFeedContentUpdated()
            }
          }).catch(() => undefined)
        }

        setSaving(false)
        if (safeReturnParam) return router.push(safeReturnParam)
        if (draftSlug && draftSlug !== 'undefined' && draftSlug !== 'null') return router.push(`/post/${draftSlug}`)
        router.push('/notebook')
        return
      } catch (e: unknown) {
                setErrorMsg(e instanceof Error ? e.message : '׳©׳’׳™׳׳” ׳‘׳©׳׳™׳¨׳× ׳©׳™׳ ׳•׳™׳™׳')
        setSaving(false)
        return
      }
    }

    // === Publish-mode validations ===

    // Title required
    if (!title.trim()) {
      toast('׳›׳•׳×׳¨׳× ׳”׳™׳ ׳—׳•׳‘׳”', 'error')
      titleInputRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      titleInputRef.current?.focus({ preventScroll: true })
      setHighlightTitle(true)
      setTimeout(() => setHighlightTitle(false), 2500)
      return
    }

    // Content minimum: at least 5 non-whitespace characters
    const visibleTextLen = extractTextFromDoc(contentJson).replace(/\s/g, '').length
    if (visibleTextLen < 5) {
      toast('׳”׳˜׳§׳¡׳˜ ׳§׳¦׳¨ ׳׳“׳™ ג€“ ׳›׳×׳•׳‘/׳™ ׳׳₪׳—׳•׳× ׳›׳׳” ׳׳™׳׳™׳ ׳׳₪׳ ׳™ ׳©׳׳₪׳¨׳¡׳׳™׳', 'error')
      contentSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      setHighlightContent(true)
      setTimeout(() => setHighlightContent(false), 2500)
      return
    }

    // Channel / subcategory / tags ג€” open settings and highlight missing fields
    {
      let hasSettingsError = false
      if (!channelId) {
        setHighlightChannel(true)
        setTimeout(() => setHighlightChannel(false), 2500)
        hasSettingsError = true
      }
      if (!subcategoryTagId) {
        setHighlightSubcategory(true)
        setTimeout(() => setHighlightSubcategory(false), 2500)
        hasSettingsError = true
      } else if (!subcategoryOptions.some(sc => sc.id === subcategoryTagId)) {
        // ׳×׳×-׳§׳˜׳’׳•׳¨׳™׳” ׳׳ ׳©׳™׳™׳›׳× ׳׳¢׳¨׳•׳¥ ׳”׳ ׳•׳›׳—׳™ (׳¢׳¨׳ ׳™׳©׳ ׳׳¢׳¨׳•׳¥ ׳§׳•׳“׳)
        setSubcategoryTagId(null)
        setHighlightSubcategory(true)
        setTimeout(() => setHighlightSubcategory(false), 2500)
        hasSettingsError = true
      }
      if (selectedTagIds.length < 1) {
        setHighlightTags(true)
        setTimeout(() => setHighlightTags(false), 2500)
        hasSettingsError = true
      }
      if (hasSettingsError) {
        if (settingsDetailsRef.current) settingsDetailsRef.current.open = true
        setTimeout(() => {
          settingsDetailsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
        }, 50)
        toast('׳™׳© ׳׳׳׳ ׳׳× ׳›׳ ׳”׳”׳’׳“׳¨׳•׳× ׳׳₪׳ ׳™ ׳₪׳¨׳¡׳•׳', 'error')
        return
      }
    }

    setSaving(true)
    setErrorMsg(null)

    const created = await ensureDraft()
    if (!created) {
      setSaving(false)
      return
    }

    await upsertDraftSilently()

    // Generate a human-readable slug from the final title at publish time.
    // Drafts keep their UUID slug; only published posts get a readable one.
    const baseSlug = generatePostSlug(title.trim())
    const finalSlug = await resolveUniquePostSlug(supabase, baseSlug, created.id)

    let finalCoverUrl = coverUrl
    let finalCoverSource = coverSource

    if (!finalCoverUrl) {
      // Scroll to cover area and show loading state while auto-importing
      coverAreaRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      setIsCoverLoading(true)
      const auto = await fetchAutoCoverUrl(title.trim(), created.id)
      setIsCoverLoading(false)
      if (!auto) {
        setErrorMsg('׳׳ ׳”׳¦׳׳—׳×׳™ ׳׳‘׳—׳•׳¨ ׳×׳׳•׳ ׳” ׳׳•׳˜׳•׳׳˜׳™׳×. ׳ ׳¡׳” ׳©׳•׳‘ ׳׳• ׳”׳¢׳׳” ׳×׳׳•׳ ׳” ׳™׳“׳ ׳™׳×.')
        setSaving(false)
        return
      }

      finalCoverUrl = auto.displayUrl
      finalCoverSource = auto.storagePath ? 'upload' : 'pixabay'
      activeCoverStoragePath = auto.storagePath
      activeCoverSource = auto.storagePath ? 'upload' : 'pixabay'
      setCoverUrl(auto.displayUrl)
      setCoverStoragePath(auto.storagePath)
      setCoverSource(auto.storagePath ? 'upload' : 'pixabay')
      setAutoCoverUsed(true)
    }

    // If the cover is an uploaded private asset, promote it to the public bucket before publishing.
    try {
      const promoted = await promoteCoverIfNeeded({ postId: created.id, postSlug: created.slug })
      finalCoverUrl = promoted.publicUrl
      finalCoverSource = promoted.source
      if (promoted.publicUrl && promoted.publicUrl !== coverUrl) {
        setCoverUrl(promoted.publicUrl)
        setCoverStoragePath(null)
        setCoverSource(promoted.source)
      }
    } catch (e: unknown) {
              setErrorMsg(e instanceof Error ? e.message : '׳©׳’׳™׳׳” ׳‘׳”׳¢׳‘׳¨׳× ׳§׳׳‘׳¨')
      setSaving(false)
      return
    }

    // Strip relatedPosts/serial attrs if we are NOT in serial-story mode (safety net for any stale state)
    const publishContentJson: JSONContent = chaptersEnabled
      ? contentJson
      : { ...contentJson, content: (contentJson.content ?? []).filter(n => n.type !== 'relatedPosts') }

    const { data: publishedRow, error } = await supabase
      .from('posts')
      .update({
        slug: finalSlug,
        title: title.trim(),
        excerpt: excerpt.trim() || null,
        content_json: publishContentJson,
        channel_id: channelId,
        subcategory_tag_id: subcategoryTagId,
        cover_image_url: finalCoverUrl,
        cover_source: finalCoverSource,
        status: 'published',
        published_at: new Date().toISOString(),
      })
      .eq('id', created.id)
      .eq('author_id', userId)
      .select('slug, status')
      .single()

    if (error) {
      const mapped = mapSupabaseError(error)
      if (mapped) {
        setErrorMsg(mapped)
      } else {
        const msg = error.message
        setErrorMsg(
          msg.includes('value too long') || msg.includes('check constraint')
            ? `׳”׳›׳•׳×׳¨׳× ׳™׳›׳•׳׳” ׳׳”׳›׳™׳ ׳¢׳“ ${TITLE_MAX} ׳×׳•׳•׳™׳`
            : msg
        )
      }
      setSaving(false)
      return
    }

    if (publishedRow?.status !== 'published') {
      setErrorMsg('׳”׳₪׳¨׳¡׳•׳ ׳ ׳›׳©׳ ג€“ ׳”׳¡׳˜׳˜׳•׳¡ ׳׳ ׳”׳×׳¢׳“׳›׳. ׳ ׳¡׳” ׳©׳•׳‘.')
      setSaving(false)
      return
    }

    gaEvent('post_published', { post_id: created.id })

    // Trigger on-demand ISR revalidation so the home feed shows the new post immediately.
    // Fire-and-forget ג€” don't block the redirect on the result.
    void supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!session?.access_token) return
      const response = await fetch('/api/posts/revalidate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session.access_token}` },
        body: JSON.stringify({ slug: publishedRow.slug }),
      })

      if (response.ok) {
        notifyFeedContentUpdated()
      }
    }).catch(() => undefined)

    setSaving(false)
    router.push(`/post/${publishedRow.slug}`)

    } finally {
      publishingRef.current = false
    }
  }

  const savingText = saving
    ? settingsLocked
      ? '׳©׳•׳׳¨ ׳©׳™׳ ׳•׳™׳™׳ג€¦'
      : '׳©׳•׳׳¨ ׳˜׳™׳•׳˜׳”ג€¦'
    : savePending
      ? '׳©׳•׳׳¨ג€¦'
      : lastSavedAt
        ? `׳ ׳©׳׳¨ ג€¢ ${new Date(lastSavedAt).toLocaleString('he-IL')}`
        : '׳׳ ׳ ׳©׳׳¨ ׳¢׳“׳™׳™׳'

  if (loading) {
    return (
      <main className="mx-auto max-w-4xl px-4 py-10" dir="rtl">
        <div className="text-sm text-muted-foreground">׳˜׳•׳¢׳ג€¦</div>
      </main>
    )
  }

  return (
    <main className="min-h-screen bg-neutral-50 dark:bg-background" dir="rtl">
      <div className="mx-auto max-w-4xl px-4 py-8">
        <header className="mb-6 flex items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">
              {loadedStatus === 'published' && effectivePostId ? '׳¢׳¨׳™׳›׳× ׳₪׳•׳¡׳˜' : '׳›׳×׳™׳‘׳”'}
            </h1>
            <div className="mt-2 text-sm text-muted-foreground">
              {settingsLocked
                ? '׳׳×׳” ׳¢׳•׳¨׳ ׳₪׳•׳¡׳˜ ׳׳₪׳•׳¨׳¡׳. ׳”׳”׳’׳“׳¨׳•׳× (׳§׳˜׳’׳•׳¨׳™׳”/׳×׳×ײ¾׳§׳˜׳’׳•׳¨׳™׳”/׳×׳’׳™׳•׳×) ׳ ׳¢׳•׳׳•׳×.'
                : loadedStatus === 'published' && effectivePostId
                  ? '׳׳×׳” ׳¢׳•׳¨׳ ׳₪׳•׳¡׳˜ ׳§׳™׳™׳.'
                  : '׳׳§׳•׳ ׳׳¢׳‘׳•׳“. ׳׳™׳ ׳׳—׳¥ ׳׳₪׳¨׳¡׳.'}
            </div>
          </div>
          <div className="text-left">
            <div className="text-xs text-muted-foreground">{savingText}</div>
            {effectivePostId ? (
              <div className="mt-1 text-xs text-muted-foreground">
                {loadedStatus === 'published' ? '׳₪׳•׳¡׳˜:' : '׳˜׳™׳•׳˜׳”:'} {effectivePostId.slice(0, 8)}ג€¦
              </div>
            ) : null}
          </div>
        </header>

        {errorMsg ? (
          <div className="mb-4 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-800 dark:bg-red-950/30 dark:border-red-900/50 dark:text-red-400">{errorMsg}</div>
        ) : null}

        <section className="rounded-3xl border bg-white p-4 shadow-sm dark:bg-card dark:border-border">
          <div className="grid gap-4 md:grid-cols-3">
            <div className="md:col-span-1">
              <div ref={coverAreaRef} className="relative overflow-hidden rounded-2xl border bg-neutral-50 dark:bg-muted/50 dark:border-border">
                {coverUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={coverUrl ?? undefined} alt="" className="h-44 w-full object-cover" onLoad={() => setIsCoverLoading(false)} onError={() => setIsCoverLoading(false)} />
                ) : (
                  <div className="flex h-44 items-center justify-center text-sm text-muted-foreground">
                    {isCoverLoading ? '׳׳™׳™׳‘׳ ׳×׳׳•׳ ׳”ג€¦' : '׳׳™׳ ׳§׳׳‘׳¨'}
                  </div>
                )}
                {isCoverLoading && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/30">
                    <div className="h-6 w-6 animate-spin rounded-full border-2 border-white border-t-transparent" />
                    <span className="mt-2 text-xs text-white">׳׳™׳™׳‘׳ ׳×׳׳•׳ ׳”ג€¦</span>
                  </div>
                )}
              </div>

              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={chooseAutoCover}
                  className="rounded-full border bg-white px-3 py-1.5 text-sm hover:bg-neutral-50 dark:bg-card dark:border-border dark:hover:bg-muted"
                >
                  {autoCoverUsed || coverSource === 'pixabay' ? '׳”׳—׳׳£ ׳×׳׳•׳ ׳” ׳׳•׳˜׳•׳׳˜׳™׳×' : '׳‘׳—׳¨ ׳§׳׳‘׳¨ ׳׳•׳˜׳•׳׳˜׳™׳×'}
                </button>

                <label className="cursor-pointer rounded-full border bg-white px-3 py-1.5 text-sm hover:bg-neutral-50 dark:bg-card dark:border-border dark:hover:bg-muted">
                  ׳”׳¢׳׳” ׳×׳׳•׳ ׳”
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
                    className="rounded-full border bg-white px-3 py-1.5 text-sm hover:bg-neutral-50 dark:bg-card dark:border-border dark:hover:bg-muted"
                  >
                    ׳”׳¡׳¨
                  </button>
                ) : null}
              </div>

              

              {coverSource ? (
                <div className="mt-2 text-xs text-muted-foreground">
                  ׳׳§׳•׳¨: <Badge>{coverSource}</Badge>
                </div>
              ) : null}
            </div>

            <div className="md:col-span-2">
              <div className="flex items-center justify-between gap-3">
                <label className="block text-sm font-medium">׳›׳•׳×׳¨׳×</label>
                <div className={`text-xs ${title.length >= TITLE_MAX ? 'text-red-600 font-semibold' : title.length >= 65 ? 'text-amber-600' : 'text-muted-foreground'}`}>
                  {title.length}/{TITLE_MAX}
                </div>
              </div>
              <input
                ref={titleInputRef}
                value={title}
                onChange={e => setTitle(e.target.value.slice(0, TITLE_MAX))}
                maxLength={TITLE_MAX}
                placeholder="׳×׳ ׳©׳ ׳׳›׳•׳×׳¨׳×..."
                className={`mt-2 w-full rounded-2xl border px-4 py-3 text-base outline-none transition-shadow duration-500 focus:ring-2 focus:ring-black/10 bg-background text-foreground dark:border-border dark:focus:ring-white/10 ${highlightTitle ? 'ring-2 ring-red-400 shadow-[0_0_0_4px_rgb(248_113_113_/_0.15)]' : ''}`}
              />

              <div className="mt-4 flex items-center justify-between gap-3">
                <label className="block text-sm font-medium">׳×׳§׳¦׳™׳¨ ׳§׳¦׳¨</label>
                <div className="text-xs text-muted-foreground">
                  {excerpt.length}/{EXCERPT_MAX}
                </div>
              </div>
              <textarea
                value={excerpt}
                onChange={e => setExcerpt(clampExcerpt(e.target.value))}
                placeholder="׳׳©׳₪׳˜ ׳׳• ׳©׳ ׳™׳™׳ ׳©׳׳•׳©׳›׳™׳ ׳׳§׳¨׳™׳׳”ג€¦"
                rows={3}
                className="mt-2 w-full resize-none rounded-2xl border px-4 py-3 text-sm leading-6 outline-none focus:ring-2 focus:ring-black/10 bg-background text-foreground dark:border-border dark:focus:ring-white/10"
              />

              <details ref={settingsDetailsRef} className="mt-4 rounded-2xl border bg-neutral-50 p-4 dark:bg-muted/50 dark:border-border" open={settingsLocked ? false : undefined}>
                <summary className="cursor-pointer text-sm font-medium">
                  ׳”׳’׳“׳¨׳•׳× (׳¢׳¨׳•׳¥ ֲ· ׳×׳×ײ¾׳§׳˜׳’׳•׳¨׳™׳” ֲ· ׳×׳’׳™׳•׳×){settingsLocked ? ' ג€” ׳ ׳¢׳•׳' : ''}
                </summary>

                {settingsLocked ? (
                  <div className="mt-3 rounded-xl border bg-white p-3 text-xs text-muted-foreground dark:bg-card dark:border-border">
                    ׳›׳“׳™ ׳׳©׳ ׳•׳× ׳§׳˜׳’׳•׳¨׳™׳”/׳×׳’׳™׳•׳× ׳¦׳¨׳™׳ ׳׳™׳¦׳•׳¨ ׳₪׳•׳¡׳˜ ׳—׳“׳©. ׳›׳׳ ׳ ׳™׳×׳ ׳׳¢׳¨׳•׳ ׳¨׳§ ׳×׳•׳›׳/׳›׳•׳×׳¨׳×/׳×׳§׳¦׳™׳¨/׳§׳׳‘׳¨.
                  </div>
                ) : null}

                <div className="mt-4 grid gap-4 md:grid-cols-2">
                  <div>
                    <label className="block text-sm font-medium">׳¢׳¨׳•׳¥</label>
                    <select
                      ref={channelSelectRef}
                      disabled={settingsLocked}
                      value={channelId ?? ''}
                      onChange={e => {
                        const next = Number(e.target.value)
                        setChannelId(next)
                        setSubcategoryTagId(null)
                        setSubcategoryOptions([]) // ׳׳ ׳§׳” ׳׳™׳“ ג€“ ׳׳ ׳™׳¢׳× ׳¢׳¨׳›׳™׳ ׳™׳©׳ ׳™׳ ׳¢׳“ ׳©׳”׳©׳׳™׳׳×׳ ׳”׳—׳“׳©׳” ׳×׳—׳–׳•׳¨
                      }}
                      className={`mt-2 w-full rounded-2xl border bg-white px-4 py-3 text-sm disabled:opacity-60 transition-shadow duration-500 dark:bg-card dark:border-border dark:text-foreground ${highlightChannel ? 'ring-2 ring-red-400 shadow-[0_0_0_4px_rgb(248_113_113_/_0.15)]' : ''}`}
                    >
                      {channels.map(c => (
                        <option key={c.id} value={c.id}>
                          {c.name_he}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium">׳×׳×ײ¾׳§׳˜׳’׳•׳¨׳™׳”</label>
                    <select
                      ref={subcategorySelectRef}
                      disabled={settingsLocked}
                      value={subcategoryTagId ?? ''}
                      onChange={e => {
                        const v = e.target.value
                        setSubcategoryTagId(v ? Number(v) : null)
                      }}
                      className={`mt-2 w-full rounded-2xl border bg-white px-4 py-3 text-sm disabled:opacity-60 transition-shadow duration-500 dark:bg-card dark:border-border dark:text-foreground ${highlightSubcategory ? 'ring-2 ring-red-400 shadow-[0_0_0_4px_rgb(248_113_113_/_0.15)]' : ''}`}
                    >
                      <option value="" disabled>
                        ׳‘׳—׳¨ ׳×׳×ײ¾׳§׳˜׳’׳•׳¨׳™׳”
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
                    <div className="text-sm font-medium">׳×׳’׳™׳•׳×</div>
                    <div className="text-xs text-muted-foreground">{selectedTagIds.length}/3</div>
                  </div>
                  <div ref={tagsAreaRef} className={`mt-3 flex flex-wrap gap-2 rounded-2xl transition-shadow duration-500 ${highlightTags ? 'ring-2 ring-red-400 shadow-[0_0_0_4px_rgb(248_113_113_/_0.15)] p-2' : 'p-0'}`}>
                    {tags.map(t => {
                      const selected = selectedTagIds.includes(t.id)
                      const toggleTag = (tagId: TagId): boolean => {
  let hitLimit = false

  setSelectedTagIds(prev => {
    if (prev.includes(tagId)) {
      return prev.filter(id => id !== tagId)
    }
    if (prev.length >= MAX_TAGS) {
      hitLimit = true
      return prev
    }
    return [...prev, tagId]
  })

  return hitLimit
}
                      return (
                        <button
                          key={t.id}
                          type="button"
                          disabled={settingsLocked}
                          onClick={() => toggleTag(t.id)}
                          className={
                            'rounded-full border px-3 py-1.5 text-sm transition disabled:opacity-60 ' +
                            (selected ? 'bg-neutral-900 text-white border-neutral-900' : 'bg-white hover:bg-neutral-50 dark:bg-card dark:hover:bg-muted')
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

        <section ref={contentSectionRef} className={`mt-5 rounded-3xl border bg-white p-4 shadow-sm transition-shadow duration-500 dark:bg-card dark:border-border ${highlightContent ? 'ring-2 ring-red-400 shadow-[0_0_0_4px_rgb(248_113_113_/_0.15)]' : ''}`}>
          <div className="mb-3 flex items-center justify-between gap-3">
            <h2 className="text-sm font-medium">׳”׳˜׳§׳¡׳˜</h2>
            <div className="flex items-center gap-3">
              <div className={`text-xs font-medium tabular-nums ${contentLength > CONTENT_MAX ? 'text-red-600 font-semibold' : contentLength >= CONTENT_MAX * 0.9 ? 'text-amber-600' : 'text-muted-foreground'}`}>
                {contentLength.toLocaleString('he-IL')}/{CONTENT_MAX.toLocaleString('he-IL')}
              </div>
              <div className="text-xs text-muted-foreground">
                {autosaveEnabled ? '׳”׳˜׳§׳¡׳˜ ׳ ׳©׳׳¨ ׳׳•׳˜׳•׳׳˜׳™׳×' : '׳”׳©׳™׳ ׳•׳™׳™׳ ׳׳ ׳ ׳©׳׳¨׳™׳ ׳¢׳“ ׳©׳׳•׳—׳¦׳™׳ ׳©׳׳•׳¨'}
              </div>
            </div>
          </div>
          <Editor value={contentJson} onChange={setContentJson} postId={effectivePostId} userId={userId} chaptersEnabled={chaptersEnabled} userPosts={chapterUserPosts} currentDraft={currentDraftForChapters} />
        </section>

        <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
          <div className="text-xs text-muted-foreground">
            {isEditMode ? (
              <>
                ׳˜׳™׳₪: ׳׳ ׳׳ ׳‘׳˜׳•׳—ג€”׳׳₪׳©׳¨ ׳׳׳—׳•׳¥ <span className="font-bold">׳‘׳™׳˜׳•׳ ׳©׳™׳ ׳•׳™׳™׳</span>.
              </>
            ) : (
              <>
                ׳˜׳™׳₪: ׳׳₪׳©׳¨ ׳׳¦׳׳× ׳׳”׳¢׳׳•׳“ ׳•׳׳—׳–׳•׳¨ ׳“׳¨׳ <span className="font-bold">׳”׳׳—׳‘׳¨׳×</span>.
              </>
            )}
          </div>

          <div className="flex items-center gap-2">
            {isEditMode ? (
              <button
                type="button"
                onClick={() => {
                  if (shouldWarnNavigation) {
                    const ok = confirm('׳׳‘׳˜׳ ׳•׳׳–׳¨׳•׳§ ׳׳× ׳”׳©׳™׳ ׳•׳™׳™׳ ׳©׳׳ ׳ ׳©׳׳¨׳•?')
                    if (!ok) return
                  }
                  if (safeReturnParam) return router.push(safeReturnParam)
                  if (typeof window !== 'undefined' && window.history.length > 1) return router.back()
                  if (draftSlug && draftSlug !== 'undefined' && draftSlug !== 'null') return router.push(`/post/${draftSlug}`)
                  router.push('/notebook')
                }}
                className="rounded-full border bg-white px-4 py-2 text-sm hover:bg-neutral-50 dark:bg-card dark:border-border dark:hover:bg-muted"
              >
                ׳‘׳™׳˜׳•׳ ׳©׳™׳ ׳•׳™׳™׳
              </button>
            ) : (
              <button
                type="button"
                onClick={() => {
                  if (shouldWarnNavigation) {
                    const ok = confirm('׳™׳© ׳׳ ׳˜׳§׳¡׳˜ ׳©׳׳ ׳ ׳©׳׳¨ ׳¢׳“׳™׳™׳. ׳׳¦׳׳× ׳‘׳›׳ ׳–׳׳×?')
                    if (!ok) return
                  }
                  router.push('/notebook')
                }}
                className="rounded-full border bg-white px-4 py-2 text-sm hover:bg-neutral-50 dark:bg-card dark:border-border dark:hover:bg-muted"
              >
                ׳׳׳—׳‘׳¨׳×
              </button>
            )}

            <button
              type="button"
              onClick={() => void publish()}
              disabled={saving}
              className="rounded-full bg-neutral-900 px-4 py-2 text-sm text-white hover:bg-neutral-800 disabled:opacity-50"
            >
              {saving ? (settingsLocked ? '׳©׳•׳׳¨ג€¦' : '׳׳₪׳¨׳¡׳ג€¦') : settingsLocked ? '׳©׳׳•׳¨ ׳©׳™׳ ׳•׳™׳™׳' : '׳₪׳¨׳¡׳'}
            </button>
          </div>
        </div>
      </div>
    </main>
  )
}

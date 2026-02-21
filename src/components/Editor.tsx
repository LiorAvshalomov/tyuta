'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { EditorContent, JSONContent, useEditor, NodeViewWrapper, ReactNodeViewRenderer } from '@tiptap/react'
import type { NodeViewProps } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'

import Underline from '@tiptap/extension-underline'
import Link from '@tiptap/extension-link'
import { TextStyle } from '@tiptap/extension-text-style'
import Color from '@tiptap/extension-color'
import Highlight from '@tiptap/extension-highlight'
import Image from '@tiptap/extension-image'
import Youtube from '@tiptap/extension-youtube'
import CharacterCount from '@tiptap/extension-character-count'

import { supabase } from '@/lib/supabaseClient'

type Props = {
  value: JSONContent
  onChange: (next: JSONContent) => void

  // חובה בשביל העלאת תמונות לטיוטה פרטית
  postId?: string | null

  // אופציונלי (אם יש לך userId בדף write, תעביר אותו כדי לחסוך getUser)
  userId?: string | null

  chaptersEnabled?: boolean
  userPosts?: ChapterItem[]
}

type ChapterItem = { id: string; slug: string; title: string }

const EMPTY_DOC: JSONContent = { type: 'doc', content: [{ type: 'paragraph' }] }

function Btn({
  label,
  onClick,
  active,
  disabled,
  subtle,
}: {
  label: string
  onClick: () => void
  active?: boolean
  disabled?: boolean
  subtle?: boolean
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      style={{
        padding: '6px 10px',
        borderRadius: 10,
        border: '1px solid #ddd',
        background: active ? '#111' : subtle ? '#fafafa' : '#fff',
        color: active ? '#fff' : '#111',
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.45 : 1,
        fontSize: 13,
        fontWeight: 700,
      }}
    >
      {label}
    </button>
  )
}

function Chip({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        padding: '6px 10px',
        borderRadius: 999,
        border: '1px solid #e5e5e5',
        background: '#fff',
        cursor: 'pointer',
        fontSize: 12,
        fontWeight: 800,
      }}
    >
      {label}
    </button>
  )
}

const COLOR_SWATCHES = [
  { name: 'שחור', value: '#111111' },
  { name: 'אדום', value: '#D92D20' },
  { name: 'כתום', value: '#F97316' },
  { name: 'ירוק', value: '#16A34A' },
  { name: 'כחול', value: '#2563EB' },
  { name: 'סגול', value: '#7C3AED' },
]

const HIGHLIGHTS = [
  { name: 'צהוב', value: '#FDE68A' },
  { name: 'ורוד', value: '#FBCFE8' },
  { name: 'ירוק', value: '#BBF7D0' },
  { name: 'כחול', value: '#BFDBFE' },
]

function findImagePaths(json: JSONContent): string[] {
  const out: string[] = []

  const walk = (node: unknown) => {
    if (!node || typeof node !== 'object') return
    const n = node as { type?: string; attrs?: Record<string, unknown>; content?: unknown[] }

    if (n.type === 'image' && n.attrs && typeof n.attrs.path === 'string') {
      out.push(n.attrs.path)
    }
    if (Array.isArray(n.content)) n.content.forEach(walk)
  }

  walk(json)
  return out
}

function replaceImageSrcByPath(json: JSONContent, pathToSrc: Record<string, string>): JSONContent {
  // structuredClone נתמך בדפדפנים מודרניים; אם תרצה fallback בהמשך — נגשר.
  const clone = structuredClone(json) as unknown as {
    type?: string
    attrs?: Record<string, unknown>
    content?: unknown[]
  }

  const walk = (node: unknown) => {
    if (!node || typeof node !== 'object') return
    const n = node as { type?: string; attrs?: Record<string, unknown>; content?: unknown[] }

    if (n.type === 'image' && n.attrs && typeof n.attrs.path === 'string') {
      const p = n.attrs.path
      const signed = pathToSrc[p]
      if (signed) n.attrs.src = signed
    }
    if (Array.isArray(n.content)) n.content.forEach(walk)
  }

  walk(clone)
  return clone as unknown as JSONContent
}

function extractYoutubeId(url: string): string | null {
  const patterns = [
    /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/shorts\/)([a-zA-Z0-9_-]{11})/,
  ]
  for (const p of patterns) {
    const m = url.match(p)
    if (m) return m[1]
  }
  return null
}

function chaptersEqual(a: ChapterItem[], b: ChapterItem[]): boolean {
  if (a.length !== b.length) return false
  for (let i = 0; i < a.length; i++) {
    if (a[i].id !== b[i].id || a[i].slug !== b[i].slug || a[i].title !== b[i].title) return false
  }
  return true
}

function stripRelatedPosts(json: JSONContent): JSONContent {
  const content = (json?.content ?? []).filter(n => n.type !== 'relatedPosts')
  return { ...json, content }
}

function extractRelatedPostsItems(json: JSONContent): ChapterItem[] {
  const rpNode = (json?.content ?? []).find(n => n.type === 'relatedPosts')
  return (rpNode?.attrs?.items ?? []) as ChapterItem[]
}

function appendRelatedPosts(json: JSONContent, items: ChapterItem[]): JSONContent {
  const content = (json?.content ?? []).filter(n => n.type !== 'relatedPosts')
  if (items.length > 0) {
    content.push({ type: 'relatedPosts', attrs: { items } })
  }
  return { ...json, content }
}

function ImageNodeView({ node, updateAttributes, deleteNode, editor, getPos }: NodeViewProps) {
  const raw = node.attrs.widthPercent as number | null | undefined
  const wp = raw === 33 || raw === 66 || raw === 100 ? raw : 100

  const nextWidth = () => {
    const cycle: Record<number, number> = { 100: 33, 33: 66, 66: 100 }
    updateAttributes({ widthPercent: cycle[wp] ?? 100 })
  }

  const moveByOne = (direction: -1 | 1) => {
    if (!editor || typeof getPos !== 'function') return
    const pos = getPos()
		if (typeof pos !== 'number') return
    const { state, dispatch } = editor.view
    const $pos = state.doc.resolve(pos)
    const index = $pos.index()
    const parent = $pos.parent
    const parentStart = $pos.start()

    if (direction === -1 && index === 0) return
    if (direction === 1 && index >= parent.childCount - 1) return

    const currentNode = parent.child(index)
    const currentSize = currentNode.nodeSize
    const slice = state.doc.slice(pos, pos + currentSize)

    // Helper: compute the absolute position of the child at `childIndex` inside this parent.
    const childPos = (childIndex: number) => {
      let offset = 0
      for (let i = 0; i < childIndex; i++) offset += parent.child(i).nodeSize
      return parentStart + offset
    }

    let tr = state.tr

    if (direction === -1) {
      // Insert before the previous sibling (positions before `pos` are stable after deleting later content).
      const insertPos = childPos(index - 1)
      tr = tr.delete(pos, pos + currentSize).insert(insertPos, slice.content)
    } else {
      // Move after the next sibling. After deletion, the next sibling shifts left to `pos`.
      const nextNode = parent.child(index + 1)
      const insertPos = pos + nextNode.nodeSize
      tr = tr.delete(pos, pos + currentSize).insert(insertPos, slice.content)
    }

    dispatch(tr.scrollIntoView())
    editor.commands.focus()
  }

  const label = wp === 33 ? 'S' : wp === 66 ? 'M' : 'L'

  return (
    <NodeViewWrapper className="relative block" draggable data-drag-handle style={{ width: `${wp}%`, cursor: 'grab' }}>
      <img
        src={(node.attrs.src as string) || ''}
        alt={(node.attrs.alt as string) ?? ''}
        style={{ width: '100%', borderRadius: 14, display: 'block' }}
        draggable={false}
      />

      {/* Remove */}
      <button
        type="button"
        onClick={deleteNode}
        contentEditable={false}
        style={{
          position: 'absolute',
          top: 6,
          left: 6,
          width: 24,
          height: 24,
          borderRadius: 12,
          background: 'rgba(0,0,0,0.6)',
          color: '#fff',
          border: 'none',
          cursor: 'pointer',
          fontSize: 14,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          lineHeight: 1,
          zIndex: 2,
        }}
        aria-label="Remove image"
      >
        ×
      </button>

      {/* Resize */}
      <button
        type="button"
        onClick={nextWidth}
        contentEditable={false}
        style={{
          position: 'absolute',
          bottom: 6,
          left: 6,
          padding: '2px 8px',
          borderRadius: 8,
          background: 'rgba(0,0,0,0.6)',
          color: '#fff',
          border: 'none',
          cursor: 'pointer',
          fontSize: 11,
          fontWeight: 700,
          zIndex: 2,
        }}
        aria-label="Change image size"
      >
        {label}
      </button>

      {/* Move up/down fallback (works on iOS) */}
      <div
        contentEditable={false}
        style={{
          position: 'absolute',
          bottom: 6,
          right: 6,
          display: 'flex',
          flexDirection: 'column',
          gap: 4,
          zIndex: 2,
        }}
        aria-label="Move image"
      >
        <button
          type="button"
          onClick={() => moveByOne(-1)}
          style={{
            width: 30,
            height: 28,
            borderRadius: 8,
            background: 'rgba(0,0,0,0.6)',
            color: '#fff',
            border: 'none',
            cursor: 'pointer',
            fontSize: 14,
            lineHeight: 1,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
          aria-label="Move image up"
          title="למעלה"
        >
          ▲
        </button>
        <button
          type="button"
          onClick={() => moveByOne(1)}
          style={{
            width: 30,
            height: 28,
            borderRadius: 8,
            background: 'rgba(0,0,0,0.6)',
            color: '#fff',
            border: 'none',
            cursor: 'pointer',
            fontSize: 14,
            lineHeight: 1,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
          aria-label="Move image down"
          title="למטה"
        >
          ▼
        </button>
      </div>
    </NodeViewWrapper>
  )
}

function YoutubeNodeView({ node, deleteNode, editor, getPos }: NodeViewProps) {
  const src = (node.attrs.src as string) || ''

  const moveByOne = (direction: -1 | 1) => {
    if (!editor || typeof getPos !== 'function') return
    const pos = getPos()
		if (typeof pos !== 'number') return
    const { state, dispatch } = editor.view
    const $pos = state.doc.resolve(pos)
    const index = $pos.index()
    const parent = $pos.parent
    const parentStart = $pos.start()

    if (direction === -1 && index === 0) return
    if (direction === 1 && index >= parent.childCount - 1) return

    const currentNode = parent.child(index)
    const currentSize = currentNode.nodeSize
    const slice = state.doc.slice(pos, pos + currentSize)

    const childPos = (childIndex: number) => {
      let offset = 0
      for (let i = 0; i < childIndex; i++) offset += parent.child(i).nodeSize
      return parentStart + offset
    }

    let tr = state.tr
    if (direction === -1) {
      const insertPos = childPos(index - 1)
      tr = tr.delete(pos, pos + currentSize).insert(insertPos, slice.content)
    } else {
      const nextNode = parent.child(index + 1)
      const insertPos = pos + nextNode.nodeSize
      tr = tr.delete(pos, pos + currentSize).insert(insertPos, slice.content)
    }

    dispatch(tr.scrollIntoView())
    editor.commands.focus()
  }

  return (
    <NodeViewWrapper className="relative" draggable data-drag-handle style={{ maxWidth: '100%', margin: '10px 0', cursor: 'grab' }}>
      <div style={{ position: 'relative', paddingBottom: '56.25%', height: 0, overflow: 'hidden', borderRadius: 14 }}>
        <iframe
          src={src}
          style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', border: 'none', pointerEvents: 'none' }}
          referrerPolicy="strict-origin-when-cross-origin"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
          allowFullScreen
        />
      </div>

      {/* Remove */}
      <button
        type="button"
        onClick={deleteNode}
        contentEditable={false}
        style={{
          position: 'absolute',
          top: 6,
          left: 6,
          width: 24,
          height: 24,
          borderRadius: 12,
          background: 'rgba(0,0,0,0.6)',
          color: '#fff',
          border: 'none',
          cursor: 'pointer',
          fontSize: 14,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          lineHeight: 1,
          zIndex: 2,
        }}
        aria-label="Remove video"
      >
        ×
      </button>

      {/* Move up/down fallback */}
      <div
        contentEditable={false}
        style={{
          position: 'absolute',
          bottom: 6,
          right: 6,
          display: 'flex',
          flexDirection: 'column',
          gap: 4,
          zIndex: 2,
        }}
        aria-label="Move video"
      >
        <button
          type="button"
          onClick={() => moveByOne(-1)}
          style={{
            width: 30,
            height: 28,
            borderRadius: 8,
            background: 'rgba(0,0,0,0.6)',
            color: '#fff',
            border: 'none',
            cursor: 'pointer',
            fontSize: 14,
            lineHeight: 1,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
          aria-label="Move video up"
          title="למעלה"
        >
          ▲
        </button>
        <button
          type="button"
          onClick={() => moveByOne(1)}
          style={{
            width: 30,
            height: 28,
            borderRadius: 8,
            background: 'rgba(0,0,0,0.6)',
            color: '#fff',
            border: 'none',
            cursor: 'pointer',
            fontSize: 14,
            lineHeight: 1,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
          aria-label="Move video down"
          title="למטה"
        >
          ▼
        </button>
      </div>
    </NodeViewWrapper>
  )
}

export default function Editor({ value, onChange, postId, userId, chaptersEnabled, userPosts: userPostsProp }: Props) {
  const [showMedia, setShowMedia] = useState(false)
  const [showStyle, setShowStyle] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [ytError, setYtError] = useState('')

  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const chaptersContainerRef = useRef<HTMLDivElement>(null)
  const chaptersRef = useRef<ChapterItem[]>([])
  const [showChapters, setShowChapters] = useState(false)
  const [chaptersItems, setChaptersItems] = useState<ChapterItem[]>([])
  const [pendingIds, setPendingIds] = useState<string[]>([])
  const [chapterSearch, setChapterSearch] = useState('')
  const userPosts = userPostsProp ?? []

  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit,
      Underline,
      Link.configure({
        openOnClick: false,
        autolink: true,
        linkOnPaste: true,
        HTMLAttributes: { rel: 'noopener noreferrer nofollow', target: '_blank' },
      }),
      TextStyle,
      Color,
      Highlight.configure({ multicolor: true }),
      Image.extend({
        draggable: true,
        addAttributes() {
          return {
            ...this.parent?.(),
            path: { default: null },
            widthPercent: { default: 100 },
          }
        },
        addNodeView() {
          return ReactNodeViewRenderer(ImageNodeView)
        },
      }).configure({
        inline: false,
        allowBase64: false,
      }),
      Youtube.extend({
        draggable: true,
        addNodeView() {
          return ReactNodeViewRenderer(YoutubeNodeView)
        },
      }).configure({
        width: 640,
        height: 360,
        nocookie: true,
        modestBranding: true,
      }),
      CharacterCount,
    ],
    content: EMPTY_DOC,
    editorProps: {
      attributes: {
        dir: 'rtl',
        style:
          'min-height: 320px; padding: 16px; border: 1px solid #ddd; border-radius: 16px; outline: none; line-height: 1.8; background: #fff; font-size: 16px; font-family: var(--font-editor-hebrew), sans-serif;',
      },
    },
    onUpdate({ editor }) {
      onChange(appendRelatedPosts(editor.getJSON(), chaptersRef.current))
    },
  })

  // נטען כל פעם שמגיע value חדש (טעינת טיוטה)
  useEffect(() => {
    if (!editor) return
    const raw = value ?? EMPTY_DOC
    const next = stripRelatedPosts(raw)

    // Extract and sync relatedPosts chapters
    const items = extractRelatedPostsItems(raw)
    chaptersRef.current = items
    setChaptersItems(prev => chaptersEqual(prev, items) ? prev : items)

    // רק אם באמת שונה (כדי לא לשרוף undo)
    try {
      const current = editor.getJSON()
      if (JSON.stringify(current) === JSON.stringify(next)) return
    } catch {
      // ignore
    }

    setTimeout(() => {
      if (editor.isDestroyed) return
      editor.commands.setContent(next, { emitUpdate: false })
    }, 0)
  }, [editor, value])

  // רענון Signed URLs לתמונות פרטיות כשפותחים/טוענים טיוטה
  useEffect(() => {
    if (!editor) return

    const refresh = async () => {
      const json = editor.getJSON()
      const paths = Array.from(new Set(findImagePaths(json)))
      if (paths.length === 0) return

      const map: Record<string, string> = {}

      for (const p of paths) {
        const { data, error } = await supabase.storage.from('post-assets').createSignedUrl(p, 60 * 60)
        if (!error && data?.signedUrl) map[p] = data.signedUrl
      }

      if (Object.keys(map).length === 0) return

      const next = replaceImageSrcByPath(json, map)
      setTimeout(() => {
      if (editor.isDestroyed) return
      editor.commands.setContent(next, { emitUpdate: false })
    }, 0)
    }

    void refresh()
  }, [editor, postId])

  const setLink = useCallback(() => {
    if (!editor) return
    const prev = editor.getAttributes('link').href as string | undefined
    const url = window.prompt('הדבק קישור:', prev ?? '')
    if (url === null) return

    if (url.trim() === '') {
      editor.chain().focus().extendMarkRange('link').unsetLink().run()
      return
    }

    const { from, to } = editor.state.selection
    if (from === to) {
      editor
        .chain()
        .focus()
        .insertContent({
          type: 'text',
          text: url.trim(),
          marks: [{ type: 'link', attrs: { href: url.trim() } }],
        })
        .run()
    } else {
      editor.chain().focus().extendMarkRange('link').setLink({ href: url.trim() }).run()
    }
  }, [editor])

  const addYoutube = useCallback(() => {
    if (!editor) return
    const url = window.prompt('הדבק לינק YouTube:')
    if (!url) return
    const cleanUrl = url.replace(/[\u200E\u200F\u202A-\u202E]/g, '').trim()
    const videoId = extractYoutubeId(cleanUrl)
    if (!videoId) {
      setYtError('לא הצלחתי לזהות סרטון YouTube מהקישור')
      return
    }
    setYtError('')
    const embedUrl = `https://www.youtube-nocookie.com/embed/${videoId}`
    editor.chain().focus().setYoutubeVideo({ src: embedUrl }).run()
  }, [editor])

  const triggerImagePick = useCallback(() => {
    if (!postId) {
      alert('עוד רגע 🙂 קודם תן לטיוטה להיווצר (לחכות לשמירה הראשונה)')
      return
    }
    fileInputRef.current?.click()
  }, [postId])

  const onPickImage = useCallback(
    async (file: File | null) => {
      if (!editor) return
      if (!file) return
      if (!postId) return

      setUploading(true)

      let uid = userId ?? null
      if (!uid) {
        const { data } = await supabase.auth.getUser()
        uid = data.user?.id ?? null
      }

      if (!uid) {
        setUploading(false)
        alert('צריך להתחבר כדי להעלות תמונה')
        return
      }

      const ext = (file.name.split('.').pop() || 'jpg').toLowerCase()
      const safeExt = ['png', 'jpg', 'jpeg', 'webp', 'gif'].includes(ext) ? ext : 'jpg'

      // ⚠️ כאן חשוב: ב-bucket name הוא post-assets, ו-name הוא הנתיב בתוך הבקט
      const uuid =
        typeof globalThis !== 'undefined' &&
        'crypto' in globalThis &&
        (globalThis.crypto as Crypto | undefined)?.randomUUID
          ? (globalThis.crypto as Crypto).randomUUID()
          : `${Date.now()}-${Math.random().toString(16).slice(2)}`
      const path = `${uid}/${postId}/${uuid}.${safeExt}`

      const { error } = await supabase.storage.from('post-assets').upload(path, file, {
        upsert: false,
        contentType: file.type || undefined,
      })

      if (error) {
        console.error(error)
        setUploading(false)
        alert(error.message)
        return
      }

      const { data: signed, error: signErr } = await supabase.storage
        .from('post-assets')
        .createSignedUrl(path, 60 * 60)

      if (signErr || !signed?.signedUrl) {
        console.error(signErr)
        setUploading(false)
        alert('התמונה עלתה, אבל לא הצלחתי להציג אותה כרגע. נסה רענון.')
        return
      }

      // כדי להימנע מ-any: נכניס Node JSON ישירות
      const imageNode: JSONContent = {
        type: 'image',
        attrs: {
          src: signed.signedUrl,
          alt: file.name,
          path, // נשמר כדי שנוכל לרענן signedUrl
        },
      }

      editor.chain().focus().insertContent(imageNode).run()

      setUploading(false)
    },
    [editor, postId, userId]
  )

  // Close chapters panel when feature is toggled off
  useEffect(() => {
    if (!chaptersEnabled) setShowChapters(false)
  }, [chaptersEnabled])

  // Reset pending selection when panel closes
  useEffect(() => {
    if (!showChapters) { setPendingIds([]); setChapterSearch('') }
  }, [showChapters])

  // Close chapters panel on click outside
  useEffect(() => {
    if (!showChapters) return
    const handler = (e: MouseEvent) => {
      if (chaptersContainerRef.current && !chaptersContainerRef.current.contains(e.target as Node)) {
        setShowChapters(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [showChapters])

  const updateChapters = useCallback((newItems: ChapterItem[]) => {
    chaptersRef.current = newItems
    setChaptersItems(newItems)
    if (!editor || editor.isDestroyed) return
    onChange(appendRelatedPosts(editor.getJSON(), newItems))
  }, [editor, onChange])

  const availablePosts = userPosts.filter(p =>
    p.id !== postId && !chaptersItems.some(c => c.id === p.id)
  )

  const togglePending = useCallback((id: string) => {
    setPendingIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])
  }, [])

  const addChecked = useCallback(() => {
    if (pendingIds.length === 0) return
    const toAdd = pendingIds
      .map(id => availablePosts.find(p => p.id === id))
      .filter((p): p is ChapterItem => p != null)
    if (toAdd.length === 0) return
    updateChapters([...chaptersItems, ...toAdd])
    setPendingIds([])
  }, [pendingIds, availablePosts, chaptersItems, updateChapters])

  const removeChapter = useCallback((index: number) => {
    updateChapters(chaptersItems.filter((_, i) => i !== index))
  }, [chaptersItems, updateChapters])

  const moveChapter = useCallback((index: number, direction: -1 | 1) => {
    const newIndex = index + direction
    if (newIndex < 0 || newIndex >= chaptersItems.length) return
    const newItems = [...chaptersItems]
    const [item] = newItems.splice(index, 1)
    newItems.splice(newIndex, 0, item)
    updateChapters(newItems)
  }, [chaptersItems, updateChapters])

  if (!editor) return null

  const words = editor.storage.characterCount.words()
  const chars = editor.storage.characterCount.characters()

  return (
    <div style={{ display: 'grid', gap: 10 }}>
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 6,
          padding: 10,
          border: '1px solid #eee',
          borderRadius: 16,
          background: '#fafafa',
          direction: 'rtl',
        }}
      >
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
        <Btn
          label="H2"
          active={editor.isActive('heading', { level: 2 })}
          onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
        />
        <Btn
          label="H3"
          active={editor.isActive('heading', { level: 3 })}
          onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
        />

        <Btn
          label="מודגש"
          active={editor.isActive('bold')}
          disabled={!editor.can().chain().focus().toggleBold().run()}
          onClick={() => editor.chain().focus().toggleBold().run()}
        />
        <Btn
          label="נטוי"
          active={editor.isActive('italic')}
          disabled={!editor.can().chain().focus().toggleItalic().run()}
          onClick={() => editor.chain().focus().toggleItalic().run()}
        />
        <Btn
          label="קו תחתון"
          active={editor.isActive('underline')}
          disabled={!editor.can().chain().focus().toggleUnderline().run()}
          onClick={() => editor.chain().focus().toggleUnderline().run()}
        />

        <Btn
          label="ציטוט"
          active={editor.isActive('blockquote')}
          onClick={() => editor.chain().focus().toggleBlockquote().run()}
        />

        <Btn
          label="• רשימה"
          active={editor.isActive('bulletList')}
          onClick={() => editor.chain().focus().toggleBulletList().run()}
        />
        <Btn
          label="1. רשימה"
          active={editor.isActive('orderedList')}
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
        />

        <Btn label="קו" onClick={() => editor.chain().focus().setHorizontalRule().run()} />
        <Btn label="קישור" active={editor.isActive('link')} onClick={setLink} />

        <Btn
          label={showMedia ? '× מדיה' : '+ מדיה'}
          subtle
          onClick={() => {
            setShowMedia(v => !v)
            setShowStyle(false)
            setShowChapters(false)
          }}
        />
        <Btn
          label={showStyle ? '× עיצוב' : 'עיצוב'}
          subtle
          onClick={() => {
            setShowStyle(v => !v)
            setShowMedia(false)
            setShowChapters(false)
          }}
        />

        {chaptersEnabled && (
          <div ref={chaptersContainerRef} style={{ position: 'relative' }}>
            <Btn
              label="הוספת פרקים"
              subtle
              active={showChapters}
              onClick={() => {
                setShowChapters(v => !v)
                setShowMedia(false)
                setShowStyle(false)
              }}
            />
            {showChapters && (
              <>
                {/* backdrop for mobile bottom-sheet */}
                <div
                  style={{
                    position: 'fixed',
                    inset: 0,
                    zIndex: 49,
                    background: 'rgba(0,0,0,0.15)',
                  }}
                  className="chapters-backdrop"
                  onClick={() => setShowChapters(false)}
                />
                <div
                  className="chapters-panel"
                  style={{
                    zIndex: 50,
                    border: '1px solid #eee',
                    borderRadius: 16,
                    padding: 12,
                    background: '#fff',
                    boxShadow: '0 4px 20px rgba(0,0,0,0.12)',
                    direction: 'rtl',
                    boxSizing: 'border-box',
                    overflowX: 'hidden',
                  }}
                >
                  {/* Search */}
                  <input
                    type="text"
                    value={chapterSearch}
                    onChange={e => setChapterSearch(e.target.value)}
                    placeholder="חיפוש פוסט..."
                    style={{
                      width: '100%',
                      padding: '7px 10px',
                      borderRadius: 10,
                      border: '1px solid #ddd',
                      fontSize: 13,
                      direction: 'rtl',
                      background: '#fff',
                      boxSizing: 'border-box',
                      marginBottom: 6,
                    }}
                  />

                  {/* Available posts – checkboxes */}
                  <div style={{ maxHeight: 150, overflowY: 'auto', border: '1px solid #eee', borderRadius: 10, background: '#fafafa' }}>
                    {userPosts.length === 0 && (
                      <div style={{ padding: '10px 8px', fontSize: 12, color: '#999', textAlign: 'center' }}>טוען...</div>
                    )}
                    {availablePosts
                      .filter(p => !chapterSearch.trim() || p.title.includes(chapterSearch.trim()))
                      .map(p => (
                        <label
                          key={p.id}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 6,
                            padding: '6px 8px',
                            cursor: 'pointer',
                            fontSize: 12,
                            borderBottom: '1px solid #f0f0f0',
                          }}
                        >
                          <input
                            type="checkbox"
                            checked={pendingIds.includes(p.id)}
                            onChange={() => togglePending(p.id)}
                            style={{ accentColor: '#111', flexShrink: 0 }}
                          />
                          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {p.title}
                          </span>
                        </label>
                      ))}
                    {userPosts.length > 0 && availablePosts.filter(p => !chapterSearch.trim() || p.title.includes(chapterSearch.trim())).length === 0 && (
                      <div style={{ padding: '10px 8px', fontSize: 12, color: '#999', textAlign: 'center' }}>אין פוסטים זמינים</div>
                    )}
                  </div>

                  {/* Add checked button */}
                  <button
                    type="button"
                    onClick={addChecked}
                    disabled={pendingIds.length === 0}
                    style={{
                      width: '100%',
                      marginTop: 6,
                      padding: '7px 0',
                      borderRadius: 10,
                      border: '1px solid #ddd',
                      background: pendingIds.length > 0 ? '#111' : '#f5f5f5',
                      color: pendingIds.length > 0 ? '#fff' : '#999',
                      cursor: pendingIds.length > 0 ? 'pointer' : 'not-allowed',
                      fontSize: 13,
                      fontWeight: 700,
                    }}
                  >
                    הוסף נבחרים{pendingIds.length > 0 ? ` (${pendingIds.length})` : ''}
                  </button>

                  {/* Selected chapters list */}
                  {chaptersItems.length > 0 && (
                    <div style={{ fontSize: 12, fontWeight: 700, marginTop: 10, marginBottom: 6, color: '#666' }}>
                      פרקים שנבחרו:
                    </div>
                  )}
                  <div style={{ display: 'grid', gap: 4 }}>
                    {chaptersItems.map((item, i) => (
                      <div
                        key={item.id}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 4,
                          padding: '4px 8px',
                          borderRadius: 8,
                          border: '1px solid #eee',
                          background: '#fafafa',
                          fontSize: 12,
                        }}
                      >
                        <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 }}>
                          {i + 1}. {item.title}
                        </span>
                        <button
                          type="button"
                          onClick={() => moveChapter(i, -1)}
                          disabled={i === 0}
                          style={{
                            width: 28,
                            height: 28,
                            borderRadius: 6,
                            border: '1px solid #ddd',
                            background: '#fff',
                            cursor: i === 0 ? 'not-allowed' : 'pointer',
                            opacity: i === 0 ? 0.3 : 1,
                            fontSize: 13,
                            flexShrink: 0,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                          }}
                          aria-label="הזז למעלה"
                        >
                          ▲
                        </button>
                        <button
                          type="button"
                          onClick={() => moveChapter(i, 1)}
                          disabled={i === chaptersItems.length - 1}
                          style={{
                            width: 28,
                            height: 28,
                            borderRadius: 6,
                            border: '1px solid #ddd',
                            background: '#fff',
                            cursor: i === chaptersItems.length - 1 ? 'not-allowed' : 'pointer',
                            opacity: i === chaptersItems.length - 1 ? 0.3 : 1,
                            fontSize: 13,
                            flexShrink: 0,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                          }}
                          aria-label="הזז למטה"
                        >
                          ▼
                        </button>
                        <button
                          type="button"
                          onClick={() => removeChapter(i)}
                          style={{
                            width: 28,
                            height: 28,
                            borderRadius: 6,
                            border: '1px solid #ddd',
                            background: '#fff',
                            cursor: 'pointer',
                            fontSize: 15,
                            color: '#D92D20',
                            flexShrink: 0,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontWeight: 700,
                          }}
                          aria-label="הסר"
                        >
                          ×
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
                <style>{`
                  .chapters-panel {
                    position: fixed;
                    bottom: 12px;
                    left: 12px;
                    right: 12px;
                    width: auto;
                    max-width: 480px;
                    max-height: 70vh;
                    overflow-y: auto;
                    margin: 0 auto;
                  }
                  .chapters-backdrop { display: block; }
                  @media (min-width: 641px) {
                    .chapters-panel {
                      position: absolute;
                      bottom: auto;
                      top: 110%;
                      left: auto;
                      right: 0;
                      width: min(360px, calc(100vw - 24px));
                      max-height: 420px;
                      margin: 0;
                    }
                    .chapters-backdrop { display: none; }
                  }
                `}</style>
              </>
            )}
          </div>
        )}

        </div>

        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <span style={{ flex: 1 }} />
          <Btn
            label="בטל"
            disabled={!editor.can().chain().focus().undo().run()}
            onClick={() => editor.chain().focus().undo().run()}
          />
          <Btn
            label="החזר"
            disabled={!editor.can().chain().focus().redo().run()}
            onClick={() => editor.chain().focus().redo().run()}
          />
          <div style={{ fontSize: 12, opacity: 0.8, marginInlineStart: 10, fontWeight: 800 }}>
            {words} מילים · {chars} תווים
          </div>
        </div>
      </div>

      {showMedia && (
        <div
          style={{
            border: '1px solid #eee',
            borderRadius: 16,
            padding: 10,
            background: '#fff',
            display: 'flex',
            flexWrap: 'wrap',
            gap: 8,
            alignItems: 'center',
          }}
        >
          <Chip
            label={uploading ? 'מעלה תמונה…' : 'העלה תמונה'}
            onClick={() => {
              if (uploading) return
              triggerImagePick()
            }}
          />
          <Chip label="YouTube" onClick={addYoutube} />
          <Chip label="מפריד" onClick={() => editor.chain().focus().setHorizontalRule().run()} />

          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            style={{ display: 'none' }}
            onChange={e => {
              const f = e.target.files?.[0] ?? null
              void onPickImage(f)
              e.currentTarget.value = ''
            }}
          />

          <div style={{ fontSize: 12, opacity: 0.8, marginInlineStart: 8 }}>
            תמונות בטיוטות נשמרות כפרטיות.
          </div>
          {ytError && (
            <div style={{ fontSize: 12, color: '#D92D20', fontWeight: 700, width: '100%' }}>
              {ytError}
            </div>
          )}
        </div>
      )}

      {showStyle && (
        <div
          style={{
            border: '1px solid #eee',
            borderRadius: 16,
            padding: 10,
            background: '#fff',
            display: 'grid',
            gap: 10,
          }}
        >
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
            <div style={{ fontSize: 12, fontWeight: 900, opacity: 0.75, marginInlineEnd: 6 }}>
              צבע טקסט:
            </div>

            {COLOR_SWATCHES.map(c => (
              <button
                key={c.value}
                type="button"
                onClick={() => editor.chain().focus().setColor(c.value).run()}
                style={{
                  padding: '6px 10px',
                  borderRadius: 999,
                  border: '1px solid #e5e5e5',
                  background: '#fff',
                  cursor: 'pointer',
                  fontSize: 12,
                  fontWeight: 900,
                  color: c.value,
                }}
              >
                {c.name}
              </button>
            ))}

            <Btn label="אפס צבע" subtle onClick={() => editor.chain().focus().unsetColor().run()} />
          </div>

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
            <div style={{ fontSize: 12, fontWeight: 900, opacity: 0.75, marginInlineEnd: 6 }}>
              הדגשה:
            </div>

            {HIGHLIGHTS.map(h => (
              <button
                key={h.value}
                type="button"
                onClick={() => editor.chain().focus().toggleHighlight({ color: h.value }).run()}
                style={{
                  padding: '6px 10px',
                  borderRadius: 999,
                  border: '1px solid #e5e5e5',
                  background: h.value,
                  cursor: 'pointer',
                  fontSize: 12,
                  fontWeight: 900,
                }}
              >
                {h.name}
              </button>
            ))}

            <Btn
              label="הסר הדגשה"
              subtle
              onClick={() => editor.chain().focus().unsetHighlight().run()}
            />
          </div>
        </div>
      )}

      <EditorContent editor={editor} className="prose max-w-none whitespace-pre-wrap break-words"/>
    </div>
  )
}
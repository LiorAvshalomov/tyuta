'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { EditorContent, JSONContent, useEditor } from '@tiptap/react'
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
}

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

export default function Editor({ value, onChange, postId, userId }: Props) {
  const [showMedia, setShowMedia] = useState(false)
  const [showStyle, setShowStyle] = useState(false)
  const [uploading, setUploading] = useState(false)

  const fileInputRef = useRef<HTMLInputElement | null>(null)

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
        addAttributes() {
          return {
            ...this.parent?.(),
            path: { default: null },
          }
        },
      }).configure({
        inline: false,
        allowBase64: false,
        HTMLAttributes: {
          style: 'max-width: 100%; border-radius: 14px; margin: 10px 0;',
        },
      }),
      Youtube.configure({
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
          'min-height: 320px; padding: 16px; border: 1px solid #ddd; border-radius: 16px; outline: none; line-height: 1.8; background: #fff; font-size: 16px;',
      },
    },
    onUpdate({ editor }) {
      onChange(editor.getJSON())
    },
  })

  // נטען כל פעם שמגיע value חדש (טעינת טיוטה)
  useEffect(() => {
    if (!editor) return
    const next = value ?? EMPTY_DOC

    // רק אם באמת שונה (כדי לא לשרוף undo)
    try {
      const current = editor.getJSON()
      if (JSON.stringify(current) === JSON.stringify(next)) return
    } catch {
      // ignore
    }

    editor.commands.setContent(next, { emitUpdate: false })
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
      editor.commands.setContent(next, { emitUpdate: false })
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

    editor.chain().focus().extendMarkRange('link').setLink({ href: url.trim() }).run()
  }, [editor])

  const addYoutube = useCallback(() => {
    if (!editor) return
    const url = window.prompt('הדבק לינק YouTube:')
    if (!url) return
    editor.chain().focus().setYoutubeVideo({ src: url }).run()
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

  if (!editor) return null

  const words = editor.storage.characterCount.words()
  const chars = editor.storage.characterCount.characters()

  return (
    <div style={{ display: 'grid', gap: 10 }}>
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: 8,
          padding: 10,
          border: '1px solid #eee',
          borderRadius: 16,
          background: '#fafafa',
          direction: 'rtl',
          alignItems: 'center',
        }}
      >
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
          }}
        />
        <Btn
          label={showStyle ? '× עיצוב' : 'עיצוב'}
          subtle
          onClick={() => {
            setShowStyle(v => !v)
            setShowMedia(false)
          }}
        />

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

      <EditorContent editor={editor} />
    </div>
  )
}

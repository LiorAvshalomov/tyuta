'use client'

import { useMemo, useRef, useState } from 'react'

type Props = {
  currentUrl: string | null
  displayName: string
  onSelectFile: (file: File | null) => void
}

const MAX_BYTES = 2 * 1024 * 1024 // 2MB

function dicebearInitialsUrl(seed: string) {
  const s = (seed || 'משתמש').trim()
  return `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(s)}`
}

export default function AvatarUpload({ currentUrl, displayName, onSelectFile }: Props) {
  const inputRef = useRef<HTMLInputElement | null>(null)
  const [localPreview, setLocalPreview] = useState<string | null>(null)
  const [localErr, setLocalErr] = useState<string | null>(null)

  const previewSrc = useMemo(() => {
    return localPreview ?? currentUrl ?? dicebearInitialsUrl(displayName)
  }, [localPreview, currentUrl, displayName])

  const pick = () => inputRef.current?.click()

  const clear = () => {
    setLocalErr(null)
    if (localPreview) URL.revokeObjectURL(localPreview)
    setLocalPreview(null)
    onSelectFile(null)
  }

  return (
    <div className="flex flex-col items-center gap-2">
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0] ?? null
          // allow selecting same file again
          e.currentTarget.value = ''

          if (!f) return

          setLocalErr(null)

          if (!f.type.startsWith('image/')) {
            setLocalErr('קובץ חייב להיות תמונה')
            return
          }
          if (f.size > MAX_BYTES) {
            setLocalErr('מקסימום 2MB')
            return
          }

          const url = URL.createObjectURL(f)
          // Revoke previous blob to avoid leaks
          if (localPreview) URL.revokeObjectURL(localPreview)
          setLocalPreview(url)
          onSelectFile(f)
        }}
      />

      <div className="rounded-2xl border bg-white p-2">
        {/* Preview גדול */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={previewSrc}
          alt="תצוגה מקדימה לתמונת פרופיל"
          className="h-24 w-24 rounded-2xl object-cover"
        />
      </div>

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={pick}
          className="rounded-xl border px-3 py-2 text-sm hover:bg-muted"
          title="בחר תמונת פרופיל"
        >
          החלף תמונה
        </button>

        {localPreview ? (
          <button
            type="button"
            onClick={clear}
            className="rounded-xl border px-3 py-2 text-sm hover:bg-muted"
            title="בטל בחירה"
          >
            ביטול
          </button>
        ) : null}
      </div>

      {localPreview ? (
        <div className="text-xs text-muted-foreground">התמונה תישמר בלחיצה על שמירה</div>
      ) : null}

      {localErr ? (
        <div className="text-xs text-red-700">{localErr}</div>
      ) : null}
    </div>
  )
}

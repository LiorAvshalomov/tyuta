'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

type Props = {
  currentUrl: string | null
  displayName: string
  onSelectFile: (file: File | null) => void
  onRemove?: () => void
}

const MAX_BYTES = 2 * 1024 * 1024 // 2 MB — applies to cropped output
const RAW_MAX = 10 * 1024 * 1024 // 10 MB — raw input before crop
const CROP_OUTPUT = 512 // exported pixel size
const VIEWPORT = 280 // crop viewport CSS size

function dicebearInitialsUrl(seed: string) {
  const s = (seed || 'משתמש').trim()
  return `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(s)}`
}

/* ─── Crop Modal ──────────────────────────────────────────────── */

function CropModal({
  imageSrc,
  onConfirm,
  onCancel,
}: {
  imageSrc: string
  onConfirm: (file: File, previewUrl: string) => void
  onCancel: () => void
}) {
  const [imgSize, setImgSize] = useState<{ w: number; h: number } | null>(null)
  const [zoom, setZoom] = useState(1)
  const [offset, setOffset] = useState({ x: 0, y: 0 })
  const dragRef = useRef<{
    startX: number
    startY: number
    origX: number
    origY: number
  } | null>(null)

  // Load image natural dimensions and compute initial fit
  useEffect(() => {
    const img = new window.Image()
    img.onload = () => {
      const minScale = VIEWPORT / Math.min(img.naturalWidth, img.naturalHeight)
      setImgSize({ w: img.naturalWidth, h: img.naturalHeight })
      setZoom(minScale)
      // Center the image so it fills the viewport
      const ox = (VIEWPORT - img.naturalWidth * minScale) / 2
      const oy = (VIEWPORT - img.naturalHeight * minScale) / 2
      setOffset({ x: Math.min(0, ox), y: Math.min(0, oy) })
    }
    img.src = imageSrc
  }, [imageSrc])

  const minZoom = useMemo(() => {
    if (!imgSize) return 0.1
    return VIEWPORT / Math.min(imgSize.w, imgSize.h)
  }, [imgSize])

  const maxZoom = minZoom * 5

  // Keep image edges outside the viewport at all times
  const clampOffset = useCallback(
    (ox: number, oy: number, z: number) => {
      if (!imgSize) return { x: ox, y: oy }
      const scaledW = imgSize.w * z
      const scaledH = imgSize.h * z
      return {
        x: Math.min(0, Math.max(VIEWPORT - scaledW, ox)),
        y: Math.min(0, Math.max(VIEWPORT - scaledH, oy)),
      }
    },
    [imgSize],
  )

  // Re-clamp when zoom changes
  useEffect(() => {
    setOffset((prev) => clampOffset(prev.x, prev.y, zoom))
  }, [zoom, clampOffset])

  const onPointerDown = (e: React.PointerEvent) => {
    e.preventDefault()
    dragRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      origX: offset.x,
      origY: offset.y,
    }
    ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
  }

  const onPointerMove = (e: React.PointerEvent) => {
    if (!dragRef.current) return
    const dx = e.clientX - dragRef.current.startX
    const dy = e.clientY - dragRef.current.startY
    setOffset(clampOffset(dragRef.current.origX + dx, dragRef.current.origY + dy, zoom))
  }

  const onPointerUp = () => {
    dragRef.current = null
  }

  const doCrop = () => {
    if (!imgSize) return

    const canvas = document.createElement('canvas')
    canvas.width = CROP_OUTPUT
    canvas.height = CROP_OUTPUT
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const img = new window.Image()
    img.onload = () => {
      // Map viewport back to original image coordinates
      const srcX = -offset.x / zoom
      const srcY = -offset.y / zoom
      const srcSize = VIEWPORT / zoom
      ctx.drawImage(img, srcX, srcY, srcSize, srcSize, 0, 0, CROP_OUTPUT, CROP_OUTPUT)

      canvas.toBlob(
        (blob) => {
          if (!blob) return
          const file = new File([blob], 'avatar.jpg', { type: 'image/jpeg' })
          const url = URL.createObjectURL(blob)
          onConfirm(file, url)
        },
        'image/jpeg',
        0.9,
      )
    }
    img.src = imageSrc
  }

  if (!imgSize) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
        <div className="rounded-2xl bg-white p-6 text-sm">טוען...</div>
      </div>
    )
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-xl" dir="rtl">
        <div className="mb-3 text-sm font-bold">חיתוך תמונת פרופיל</div>

        {/* Crop viewport */}
        <div
          className="relative mx-auto overflow-hidden rounded-xl border-2 border-dashed border-neutral-300 bg-neutral-100 cursor-grab active:cursor-grabbing touch-none"
          style={{ width: VIEWPORT, height: VIEWPORT }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={imageSrc}
            alt="crop preview"
            draggable={false}
            className="pointer-events-none select-none"
            style={{
              position: 'absolute',
              left: offset.x,
              top: offset.y,
              width: imgSize.w * zoom,
              height: imgSize.h * zoom,
              maxWidth: 'none',
            }}
          />
        </div>

        {/* Zoom slider */}
        <div className="mt-3 flex items-center gap-3 text-xs text-neutral-600">
          <span className="select-none">&minus;</span>
          <input
            type="range"
            min={minZoom}
            max={maxZoom}
            step={0.001}
            value={zoom}
            onChange={(e) => setZoom(Number(e.target.value))}
            className="flex-1"
          />
          <span className="select-none">+</span>
        </div>

        {/* Actions */}
        <div className="mt-4 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-xl border px-4 py-2 text-sm hover:bg-neutral-50"
          >
            ביטול
          </button>
          <button
            type="button"
            onClick={doCrop}
            className="rounded-xl bg-neutral-900 px-4 py-2 text-sm font-bold text-white hover:bg-neutral-800"
          >
            אישור
          </button>
        </div>
      </div>
    </div>
  )
}

/* ─── Main Component ─────────────────────────────────────────── */

export default function AvatarUpload({ currentUrl, displayName, onSelectFile, onRemove }: Props) {
  const inputRef = useRef<HTMLInputElement | null>(null)
  const [localPreview, setLocalPreview] = useState<string | null>(null)
  const [localErr, setLocalErr] = useState<string | null>(null)
  const [cropSrc, setCropSrc] = useState<string | null>(null)

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
          if (f.size > RAW_MAX) {
            setLocalErr('קובץ גדול מדי (מקסימום 10MB)')
            return
          }

          // Open crop modal with the raw image
          const url = URL.createObjectURL(f)
          setCropSrc(url)
        }}
      />

      {/* Crop modal */}
      {cropSrc ? (
        <CropModal
          imageSrc={cropSrc}
          onConfirm={(file, previewUrl) => {
            URL.revokeObjectURL(cropSrc)
            setCropSrc(null)
            if (localPreview) URL.revokeObjectURL(localPreview)
            setLocalPreview(previewUrl)
            onSelectFile(file)
          }}
          onCancel={() => {
            URL.revokeObjectURL(cropSrc)
            setCropSrc(null)
          }}
        />
      ) : null}

      <div className="rounded-2xl border bg-white p-2">
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

        {!localPreview && currentUrl && onRemove ? (
          <button
            type="button"
            onClick={onRemove}
            className="rounded-xl border px-3 py-2 text-sm hover:bg-muted"
            title="הסר תמונת פרופיל"
          >
            הסר תמונה
          </button>
        ) : null}

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

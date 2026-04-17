"use client"

import { useEffect, useRef, useState } from "react"
import { waitForClientSession } from "@/lib/auth/clientSession"

type Theme = "light" | "dark"
type Format = "square" | "portrait" | "story"
type Align = "right" | "center"

type SlidePreview = {
  index: number
  preview: string
}

type Props = {
  postId: string
  onClose: () => void
}

const FORMAT_LABELS: Record<Format, string> = {
  square: "ריבוע",
  portrait: "פיד 4:5",
  story: "סטורי",
}

const THEME_LABELS: Record<Theme, string> = {
  light: "בהיר",
  dark: "כהה",
}

const ALIGN_LABELS: Record<Align, string> = {
  right: "ימין",
  center: "מרכז",
}

async function getToken(): Promise<string | null> {
  const resolution = await waitForClientSession(5000)
  return resolution.status === "authenticated" ? resolution.session.access_token : null
}

export default function ShareImagesModal({ postId, onClose }: Props) {
  const [theme, setTheme] = useState<Theme>("light")
  const [format, setFormat] = useState<Format>("square")
  const [align, setAlign] = useState<Align>("right")
  const [slides, setSlides] = useState<SlidePreview[]>([])
  const [slideTotal, setSlideTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [truncated, setTruncated] = useState(false)
  const [downloading, setDownloading] = useState<number | null>(null)
  const backdropRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let cancelled = false

    async function load() {
      setLoading(true)
      setError(null)

      try {
        const token = await getToken()
        if (!token) throw new Error("לא מחובר/ת")

        const res = await fetch(`/api/posts/${postId}/share-images?format=${format}`, {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` },
        })

        if (!res.ok) {
          const j = await res.json().catch(() => ({}))
          throw new Error(j?.error?.message ?? "שגיאה בטעינה")
        }

        const j = await res.json()
        if (!cancelled) {
          setSlideTotal(j.slideTotal ?? 0)
          setSlides(j.slides ?? [])
          setTruncated(j.truncated ?? false)
        }
      } catch (e: unknown) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "שגיאה לא ידועה")
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    void load()
    return () => {
      cancelled = true
    }
  }, [postId, format])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose()
    }

    document.addEventListener("keydown", onKey)
    return () => document.removeEventListener("keydown", onKey)
  }, [onClose])

  const downloadSlide = async (slideIndex: number) => {
    if (downloading !== null) return
    setDownloading(slideIndex)

    try {
      const token = await getToken()
      if (!token) throw new Error("לא מחובר/ת")

      const url = `/api/posts/${postId}/share-images?slide=${slideIndex}&theme=${theme}&format=${format}&align=${align}`
      const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } })

      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        throw new Error(j?.error?.message ?? "שגיאה בהורדה")
      }

      const blob = await res.blob()
      const blobUrl = URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = blobUrl
      a.download = `tyuta-${postId.slice(0, 8)}-${format}-${slideIndex}.png`
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(blobUrl)
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : "שגיאה בהורדה")
    } finally {
      setDownloading(null)
    }
  }

  const downloadAll = async () => {
    for (let i = 1; i <= slideTotal; i += 1) {
      await downloadSlide(i)
      if (i < slideTotal) {
        await new Promise((resolve) => setTimeout(resolve, 400))
      }
    }
  }

  return (
    <div
      ref={backdropRef}
      className="fixed inset-0 z-[10001] flex items-start justify-center overflow-y-auto bg-black/60 px-4 pb-4 pt-16 sm:items-center sm:pt-4"
      dir="rtl"
      onClick={(e) => {
        if (e.target === backdropRef.current) onClose()
      }}
    >
      <div className="relative flex max-h-[calc(100dvh-80px)] w-full max-w-md flex-col overflow-hidden rounded-2xl border border-border bg-white shadow-2xl dark:bg-card sm:max-h-[92dvh]">
        <div className="flex shrink-0 items-center justify-between border-b border-border px-5 py-4">
          <h2 className="text-base font-bold">צור תמונות לשיתוף</h2>
          <button
            type="button"
            onClick={onClose}
            className="p-1 text-lg leading-none text-muted-foreground transition hover:text-foreground"
            aria-label="סגור"
          >
            ×
          </button>
        </div>

        <div className="flex-1 space-y-5 overflow-y-auto px-5 py-4">
          <div>
            <p className="mb-2 text-xs font-semibold text-muted-foreground">עיצוב</p>
            <div className="flex gap-2">
              {(["light", "dark"] as Theme[]).map((value) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setTheme(value)}
                  className={[
                    "flex-1 rounded-xl border py-2.5 text-sm font-medium transition",
                    theme === value
                      ? "border-neutral-900 bg-neutral-900 text-white dark:border-white dark:bg-white dark:text-black"
                      : "border-border text-muted-foreground hover:border-neutral-400",
                  ].join(" ")}
                >
                  {THEME_LABELS[value]}
                </button>
              ))}
            </div>
          </div>

          <div>
            <p className="mb-2 text-xs font-semibold text-muted-foreground">פורמט</p>
            <div className="grid grid-cols-3 gap-2">
              {(["square", "portrait", "story"] as Format[]).map((value) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setFormat(value)}
                  className={[
                    "rounded-xl border py-2.5 text-sm font-medium transition",
                    format === value
                      ? "border-neutral-900 bg-neutral-900 text-white dark:border-white dark:bg-white dark:text-black"
                      : "border-border text-muted-foreground hover:border-neutral-400",
                  ].join(" ")}
                >
                  {FORMAT_LABELS[value]}
                </button>
              ))}
            </div>
          </div>

          <div>
            <p className="mb-2 text-xs font-semibold text-muted-foreground">יישור טקסט</p>
            <div className="flex gap-2">
              {(["right", "center"] as Align[]).map((value) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setAlign(value)}
                  className={[
                    "flex-1 rounded-xl border py-2.5 text-sm font-medium transition",
                    align === value
                      ? "border-neutral-900 bg-neutral-900 text-white dark:border-white dark:bg-white dark:text-black"
                      : "border-border text-muted-foreground hover:border-neutral-400",
                  ].join(" ")}
                >
                  {ALIGN_LABELS[value]}
                </button>
              ))}
            </div>
          </div>

          <div>
            <p className="mb-2 text-xs font-semibold text-muted-foreground">שקפים</p>

            {loading && (
              <p className="py-4 text-center text-sm text-muted-foreground">טוען...</p>
            )}

            {error && (
              <p className="py-2 text-sm text-red-600 dark:text-red-400">{error}</p>
            )}

            {!loading && !error && slideTotal === 0 && (
              <p className="py-2 text-sm text-muted-foreground">לא נמצא תוכן לשיתוף.</p>
            )}

            {!loading && !error && truncated && (
              <div className="mb-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm dark:border-amber-900/40 dark:bg-amber-950/30">
                <p className="font-semibold text-amber-800 dark:text-amber-300">הפוסט ארוך מדי ולא מתאים לפיצ׳ר זה בזמן זה</p>
                <p className="mt-1 text-amber-700 dark:text-amber-400">אנו עובדים למקסם את הפיצ׳ר עד סופו ולאפשר בעתיד גם אפשרות לפוסטים ארוכים.</p>
              </div>
            )}

            {!loading && !error && slides.length > 0 && !truncated && (
              <div className="space-y-2">
                {slides.map((slide) => (
                  <div
                    key={slide.index}
                    className="flex items-center gap-3 rounded-xl border border-border p-3"
                  >
                    <span className="w-5 shrink-0 text-center text-xs font-bold text-muted-foreground">
                      {slide.index}
                    </span>
                    <p className="line-clamp-1 flex-1 text-right text-sm text-foreground/80">
                      {slide.preview}
                      {slide.preview.length >= 60 ? "..." : ""}
                    </p>
                    {!truncated && (
                      <button
                        type="button"
                        onClick={() => void downloadSlide(slide.index)}
                        disabled={downloading !== null}
                        className={[
                          "shrink-0 rounded-lg px-3 py-1.5 text-xs font-semibold transition",
                          downloading === slide.index
                            ? "bg-neutral-200 text-muted-foreground dark:bg-neutral-700"
                            : "bg-neutral-900 text-white hover:opacity-80 dark:bg-white dark:text-black",
                        ].join(" ")}
                      >
                        {downloading === slide.index ? "מוריד..." : "הורד"}
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {!loading && !error && slideTotal > 1 && !truncated && (
          <div className="shrink-0 px-5 pb-5">
            <button
              type="button"
              onClick={() => void downloadAll()}
              disabled={downloading !== null}
              className="w-full rounded-xl bg-neutral-900 py-3 text-sm font-bold text-white transition hover:opacity-80 disabled:opacity-50 dark:bg-white dark:text-black"
            >
              {downloading !== null ? "מוריד..." : `הורד את כל ${slideTotal} השקפים`}
            </button>
          </div>
        )}

        <p className="shrink-0 px-5 pb-4 text-center text-xs text-muted-foreground/60">
          פיצ׳ר זה נמצא בשלבי פיתוח — אנו ממשיכים לשפר ולהרחיב אותו.
        </p>
      </div>
    </div>
  )
}

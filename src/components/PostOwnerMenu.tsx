"use client"

import Link from "next/link"
import { useEffect, useMemo, useRef, useState } from "react"
import { supabase } from "@/lib/supabaseClient"

function getErrorMessage(e: unknown) {
  if (
    e &&
    typeof e === "object" &&
    "message" in e &&
    typeof (e as { message?: unknown }).message === "string"
  ) {
    return (e as { message: string }).message
  }
  if (e instanceof Error) return e.message
  return "שגיאה לא ידועה"
}

async function authedFetch(input: string, init: RequestInit = {}) {
  const { data } = await supabase.auth.getSession()
  const token = data.session?.access_token
  if (!token) throw new Error("Not authenticated")

  const headers: Record<string, string> = {
    ...(init.headers as Record<string, string> | undefined),
    Authorization: `Bearer ${token}`,
  }
  if (init.body && !headers["Content-Type"] && !(init.body instanceof FormData)) {
    headers["Content-Type"] = "application/json"
  }

  return fetch(input, { ...init, headers })
}

export default function PostOwnerMenu({
  postId,
  authorId,
}: {
  postId: string
  authorId: string
  postSlug?: string
  returnUrl?: string
}) {
  const [viewerId, setViewerId] = useState<string | null>(null)
  const isOwner = useMemo(() => viewerId === authorId, [viewerId, authorId])
  const [open, setOpen] = useState(false)
  const firstItemRef = useRef<HTMLAnchorElement | null>(null)

  const wrapRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
  if (open) {
    firstItemRef.current?.focus()
  }
}, [open])

  useEffect(() => {
    supabase.auth
      .getUser()
      .then(({ data }) => setViewerId(data.user?.id ?? null))
      .catch(() => setViewerId(null))
  }, [])

  // Close on outside click / touch + Esc
  useEffect(() => {
    if (!open) return

    const onPointerDown = (e: Event) => {
      const target = e.target as Node | null
      if (!target) return
      const wrap = wrapRef.current
      if (wrap && !wrap.contains(target)) setOpen(false)
    }

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false)
    }

    document.addEventListener("mousedown", onPointerDown)
    document.addEventListener("touchstart", onPointerDown, { passive: true })
    document.addEventListener("keydown", onKeyDown)

    return () => {
      document.removeEventListener("mousedown", onPointerDown)
      document.removeEventListener("touchstart", onPointerDown)
      document.removeEventListener("keydown", onKeyDown)
    }
  }, [open])

  const onDelete = async () => {
    const ok = confirm("למחוק את הפוסט? אפשר יהיה לשחזר עד 14 יום, ואז יימחק לצמיתות.")
    if (!ok) return

    try {
      const res = await authedFetch(`/api/posts/${postId}/delete`, { method: "POST" })
      const j = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(j?.error?.message ?? j?.error ?? "שגיאה במחיקה")
      window.location.href = "/"
    } catch (e: unknown) {
      alert(getErrorMessage(e))
    }
  }

  if (!isOwner) return null

  return (
    <div ref={wrapRef} className="relative" dir="rtl">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="
  block px-3 py-2 text-right
  hover:bg-neutral-50 dark:hover:bg-muted
  focus:outline-none
  focus-visible:bg-neutral-100 dark:focus-visible:bg-muted
  transition
"
        aria-haspopup="menu"
        aria-expanded={open}
        title="פעולות"
      >
        ⋯
      </button>

      {open ? (
        <div className="absolute left-0 mt-2 w-40 overflow-hidden rounded border bg-white dark:bg-card dark:border-border text-sm shadow-lg">
          <Link
  ref={firstItemRef}
  href={`/write?edit=${encodeURIComponent(postId)}`}
  className="
    block px-3 py-2
    hover:bg-neutral-100 dark:hover:bg-muted
    focus:outline-none
    focus-visible:bg-neutral-100 dark:focus-visible:bg-muted
    focus-visible:font-semibold
  "
>
  ערוך
</Link>
          <button
            type="button"
            className="block w-full px-3 py-2 text-right text-red-700 hover:bg-red-50 dark:hover:bg-red-950/30"
            onClick={() => {
              setOpen(false)
              void onDelete()
            }}
          >
            מחק
          </button>
        </div>
      ) : null}
    </div>
  )
}

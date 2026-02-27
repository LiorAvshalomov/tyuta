'use client'

/**
 * AuthorHover — wraps any author display element and shows a hover profile card.
 *
 * Desktop (hover-capable devices):
 *   - 150 ms debounce on mouseEnter → prefetch starts
 *   - Card opens ONLY after fetchUserPreview resolves AND token still matches
 *     (token is incremented on mouseleave, so stale fetches never open the card)
 *   - Cache hit (TTL 60s) returns synchronously-equivalent result → zero perceptible delay
 *
 * Mobile / touch-only devices:
 *   - Tap triggers prefetch → opens on success; outside-click / ESC close
 *
 * HoverProfileCard receives the fully-loaded preview as a prop and performs
 * ZERO network fetching of its own.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import dynamic from 'next/dynamic'
import { fetchUserPreview, type UserPreview } from '@/lib/userPreviewCache'

const HoverProfileCard = dynamic(() => import('./HoverProfileCard'), { ssr: false })

export default function AuthorHover({
  username,
  children,
}: {
  username: string
  children: React.ReactNode
}) {
  const anchorRef = useRef<HTMLSpanElement>(null)
  const [open, setOpen] = useState(false)
  const [preview, setPreview] = useState<UserPreview | null>(null)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  // Incremented on every mouseleave/close. Fetches that resolve after a
  // mouseleave compare their token to the current ref and discard stale opens.
  const tokenRef = useRef(0)
  // Set once on mount — avoids calling matchMedia on every mouseenter
  const canHoverRef = useRef(false)

  useEffect(() => {
    canHoverRef.current = window.matchMedia('(hover: hover) and (pointer: fine)').matches
  }, [])

  const clearTimer = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current)
      timerRef.current = null
    }
  }, [])

  /** Fetch (or cache-hit) then open — only if token matches (still hovering) */
  const openWhenReady = useCallback((uname: string) => {
    const myToken = tokenRef.current
    fetchUserPreview(uname).then(data => {
      if (tokenRef.current !== myToken || !data) return
      setPreview(data)
      setOpen(true)
    })
  }, [])

  const scheduleOpen = useCallback(() => {
    if (!canHoverRef.current) return
    clearTimer()
    timerRef.current = setTimeout(() => openWhenReady(username), 150)
  }, [clearTimer, openWhenReady, username])

  const scheduleClose = useCallback(() => {
    if (!canHoverRef.current) return
    tokenRef.current++ // invalidate any in-flight fetch/open
    clearTimer()
    timerRef.current = setTimeout(() => setOpen(false), 220)
  }, [clearTimer])

  const keepOpen = useCallback(() => {
    clearTimer()
  }, [clearTimer])

  const close = useCallback(() => {
    tokenRef.current++ // invalidate any in-flight fetch/open
    clearTimer()
    setOpen(false)
  }, [clearTimer])

  // Mobile: tap to open (prefetch → open on success)
  const handleTap = useCallback(() => {
    if (canHoverRef.current) return // desktop — hover handles it
    const myToken = ++tokenRef.current
    fetchUserPreview(username).then(data => {
      if (tokenRef.current !== myToken || !data) return
      setPreview(data)
      setOpen(true)
    })
  }, [username])

  useEffect(() => () => clearTimer(), [clearTimer])

  return (
    <span
      ref={anchorRef}
      className="inline-flex relative pointer-events-auto"
      onMouseEnter={scheduleOpen}
      onMouseLeave={scheduleClose}
      onClick={handleTap}
    >
      {children}
      {open && preview ? (
        <HoverProfileCard
          username={username}
          preview={preview}
          anchorEl={anchorRef.current}
          onClose={close}
          onMouseEnter={keepOpen}
          onMouseLeave={scheduleClose}
        />
      ) : null}
    </span>
  )
}

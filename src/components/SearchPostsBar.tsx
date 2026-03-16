'use client'

import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useRouter } from 'next/navigation'
import { coverProxySrc } from '@/lib/coverUrl'

type Suggestion = {
  id: string
  slug: string
  title: string
  cover_image_url: string | null
  author_name: string | null
  reactions_count: number
  published_at: string | null
}

const MIN_CHARS = 2
const DEBOUNCE_MS = 300
const LISTBOX_ID = 'search-suggestions-listbox'

export default function SearchPostsBar() {
  const router = useRouter()

  const [q, setQ] = useState('')
  const [suggestions, setSuggestions] = useState<Suggestion[]>([])
  const [loadingSuggest, setLoadingSuggest] = useState(false)
  // open=true whenever the dropdown should be visible (including "no results")
  const [open, setOpen] = useState(false)
  const [activeIdx, setActiveIdx] = useState(-1)
  // Portal anchor: fixed viewport coords derived from the full wrapper rect
  const [dropdownPos, setDropdownPos] = useState<{ top: number; left: number; width: number } | null>(null)

  const inputRef = useRef<HTMLInputElement | null>(null)
  // wrapperRef: the full input+button row — used for position measurement
  const wrapperRef = useRef<HTMLDivElement | null>(null)
  // dropdownRef: the portal dropdown div — kept outside the bar so click-outside ignores it
  const dropdownRef = useRef<HTMLDivElement | null>(null)
  const abortRef = useRef<AbortController | null>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // ── position ─────────────────────────────────────────────────────────────
  // Anchor dropdown to the full wrapper (input + button) so width matches exactly.
  useEffect(() => {
    if (!open) return
    const update = () => {
      if (!wrapperRef.current) return
      const r = wrapperRef.current.getBoundingClientRect()
      setDropdownPos({ top: r.bottom + 8, left: r.left, width: r.width })
    }
    update()
    window.addEventListener('scroll', update, { passive: true })
    window.addEventListener('resize', update, { passive: true })
    return () => {
      window.removeEventListener('scroll', update)
      window.removeEventListener('resize', update)
    }
  }, [open])

  // ── cleanup on unmount ────────────────────────────────────────────────────
  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
      abortRef.current?.abort()
    }
  }, [])

  // ── click outside ─────────────────────────────────────────────────────────
  // Must ignore mousedown inside BOTH the bar wrapper AND the portal dropdown,
  // otherwise mousedown on a suggestion fires close() before onClick can run.
  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      const target = e.target as Node
      if (wrapperRef.current?.contains(target)) return
      if (dropdownRef.current?.contains(target)) return
      close()
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open])

  // ── close helper — always resets activeIdx ───────────────────────────────
  function close() {
    setOpen(false)
    setActiveIdx(-1)
  }

  // ── navigate helpers ──────────────────────────────────────────────────────
  function navigateToSearch(query = q) {
    const trimmed = query.trim()
    close()
    setSuggestions([])
    if (!trimmed) { router.push('/search?sort=recent'); return }
    router.push(`/search?q=${encodeURIComponent(trimmed)}&sort=recent`)
  }

  function navigateToPost(slug: string) {
    close()
    router.push(`/post/${slug}`)
  }

  // ── fetch (debounced) ─────────────────────────────────────────────────────
  function handleChange(value: string) {
    setQ(value)
    setActiveIdx(-1)

    if (debounceRef.current) clearTimeout(debounceRef.current)

    if (value.trim().length < MIN_CHARS) {
      setSuggestions([])
      close()
      setLoadingSuggest(false)
      return
    }

    setLoadingSuggest(true)

    debounceRef.current = setTimeout(async () => {
      abortRef.current?.abort()
      const ctrl = new AbortController()
      abortRef.current = ctrl

      try {
        const res = await fetch(
          `/api/search/suggest?q=${encodeURIComponent(value.trim())}`,
          { signal: ctrl.signal }
        )
        if (!res.ok) throw new Error('bad_response')
        const { suggestions: data } = await res.json() as { suggestions: Suggestion[] }
        setSuggestions(data ?? [])
        setOpen(true) // always open to show results or empty state
        setActiveIdx(-1)
      } catch (e) {
        if ((e as Error)?.name !== 'AbortError') {
          setSuggestions([])
          close()
        }
      } finally {
        setLoadingSuggest(false)
      }
    }, DEBOUNCE_MS)
  }

  // ── keyboard ──────────────────────────────────────────────────────────────
  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') {
      // Active item → navigate to post; otherwise → full search
      if (activeIdx >= 0 && suggestions[activeIdx]) {
        navigateToPost(suggestions[activeIdx].slug)
      } else {
        navigateToSearch()
      }
      return
    }
    if (e.key === 'Escape') {
      close()
      return
    }
    if (!open || suggestions.length === 0) return
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      // Clamp at last item (no wrap)
      setActiveIdx(prev => Math.min(prev + 1, suggestions.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      // Clamp at -1 (no active item) when going above first
      setActiveIdx(prev => Math.max(prev - 1, -1))
    }
  }

  // ── dropdown content ──────────────────────────────────────────────────────
  const showDropdown = q.trim().length >= MIN_CHARS && (loadingSuggest || open)

  const dropdownContent = showDropdown && dropdownPos ? (
    <div
      ref={dropdownRef}
      style={{
        position: 'fixed',
        top: dropdownPos.top,
        left: dropdownPos.left,
        width: dropdownPos.width,
        zIndex: 99999,
      }}
      className="overflow-hidden rounded-2xl border border-border bg-white dark:bg-card shadow-xl"
      dir="rtl"
    >
      {loadingSuggest && suggestions.length === 0 ? (
        /* Skeleton while loading */
        <div className="animate-pulse space-y-1 p-2" aria-hidden="true">
          {[0, 1, 2].map(i => (
            <div key={i} className="flex items-center gap-2.5 rounded-xl p-2">
              <div className="h-10 w-10 shrink-0 rounded-xl bg-neutral-200 dark:bg-muted" />
              <div className="flex-1 space-y-1.5">
                <div className="h-3 w-3/4 rounded bg-neutral-200 dark:bg-muted" />
                <div className="h-2.5 w-1/2 rounded bg-neutral-100 dark:bg-muted/60" />
              </div>
            </div>
          ))}
        </div>
      ) : suggestions.length === 0 ? (
        /* No results — still show "see all" so user can reach full search */
        <>
          <div className="px-4 py-3 text-sm text-muted-foreground text-right">
            לא נמצאו תוצאות עבור &quot;{q.trim()}&quot;
          </div>
          <div className="border-t border-border px-3 py-2">
            <button
              type="button"
              onClick={() => navigateToSearch()}
              className="w-full text-center text-xs font-semibold text-blue-600 dark:text-blue-400 hover:underline cursor-pointer"
            >
              לכל התוצאות עבור &quot;{q.trim()}&quot;
            </button>
          </div>
        </>
      ) : (
        <>
          <ul id={LISTBOX_ID} role="listbox" className="py-1">
            {suggestions.map((s, idx) => (
              (() => {
                const coverSrc = coverProxySrc(s.cover_image_url)
                return (
                  <li
                    key={s.id}
                    id={`search-opt-${s.id}`}
                    role="option"
                    aria-selected={activeIdx === idx}
                  >
                    <button
                      type="button"
                      onMouseEnter={() => setActiveIdx(idx)}
                      onClick={() => navigateToPost(s.slug)}
                      className={[
                        'flex w-full cursor-pointer items-center gap-2.5 px-3 py-2 text-right transition-colors',
                        activeIdx === idx
                          ? 'bg-neutral-100 dark:bg-muted'
                          : 'hover:bg-neutral-50 dark:hover:bg-muted/50',
                      ].join(' ')}
                    >
                      <div className="h-10 w-10 shrink-0 overflow-hidden rounded-xl bg-neutral-100 dark:bg-muted ring-1 ring-black/5">
                        {coverSrc ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={coverSrc}
                            alt=""
                            className="h-full w-full object-cover"
                            loading="lazy"
                          />
                        ) : null}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-[13px] font-semibold text-neutral-900 dark:text-foreground">
                          {s.title}
                        </div>
                        {s.author_name ? (
                          <div className="truncate text-[11px] text-muted-foreground">
                            {s.author_name}
                          </div>
                        ) : null}
                      </div>
                    </button>
                  </li>
                )
              })()
            ))}
          </ul>

          <div className="border-t border-border px-3 py-2">
            <button
              type="button"
              onClick={() => navigateToSearch()}
              className="w-full text-center text-xs font-semibold text-blue-600 dark:text-blue-400 hover:underline"
            >
              לכל התוצאות עבור &quot;{q.trim()}&quot;
            </button>
          </div>
        </>
      )}
    </div>
  ) : null

  // ── render ────────────────────────────────────────────────────────────────
  return (
    <div ref={wrapperRef} className="relative flex items-center gap-2" dir="rtl">
      <input
        ref={inputRef}
        value={q}
        onChange={e => handleChange(e.target.value)}
        onKeyDown={handleKeyDown}
        onFocus={() => { if (q.trim().length >= MIN_CHARS && suggestions.length > 0) setOpen(true) }}
        placeholder="חפש פוסטים..."
        autoComplete="off"
        role="combobox"
        aria-expanded={open && showDropdown}
        aria-controls={open ? LISTBOX_ID : undefined}
        aria-activedescendant={
          activeIdx >= 0 && suggestions[activeIdx]
            ? `search-opt-${suggestions[activeIdx].id}`
            : undefined
        }
        className="h-10 rounded-full border border-border bg-card text-foreground placeholder:text-muted-foreground dark:bg-muted dark:focus:bg-muted px-4 text-sm outline-none focus:ring-2 focus:ring-black/10 dark:focus:ring-foreground/10"
        style={{ width: 240 }}
      />

      {/* Portal: renders outside the backdrop-blur stacking context */}
      {typeof window !== 'undefined' ? createPortal(dropdownContent, document.body) : null}

      <button
        type="button"
        onClick={() => navigateToSearch()}
        className="h-10 shrink-0 rounded-full bg-black px-4 text-sm font-semibold text-white cursor-pointer transition hover:bg-neutral-900 shadow-sm hover:shadow-md active:scale-[0.98] active:opacity-90 focus:outline-none focus:ring-4"
      >
        חפש
      </button>
    </div>
  )
}

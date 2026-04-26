'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Search } from 'lucide-react'
import Avatar from '@/components/Avatar'
import { adminFetch } from '@/lib/admin/adminFetch'

type UserSuggestion = {
  id: string
  username: string | null
  display_name: string | null
  avatar_url: string | null
}

type Props = {
  value: string
  onChange: (val: string) => void
  onSelect: (user: UserSuggestion) => void
  placeholder?: string
  inputClassName?: string
  width?: string
}

function suggestionLabel(u: UserSuggestion): string {
  if (u.display_name && u.username) return `${u.display_name} (@${u.username})`
  return u.display_name ?? (u.username ? `@${u.username}` : u.id.slice(0, 8) + '…')
}

export default function UserAutocompleteInput({
  value,
  onChange,
  onSelect,
  placeholder = 'שם / @username / UUID…',
  inputClassName,
  width = 'w-[260px]',
}: Props) {
  const [suggestions, setSuggestions] = useState<UserSuggestion[]>([])
  const [open, setOpen] = useState(false)
  const [fetching, setFetching] = useState(false)
  const [activeIdx, setActiveIdx] = useState(-1)
  const containerRef = useRef<HTMLDivElement>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const fetchSuggestions = useCallback(async (q: string) => {
    const trimmed = q.trim()
    if (trimmed.length < 2) {
      setSuggestions([])
      setOpen(false)
      return
    }
    setFetching(true)
    try {
      const r = await adminFetch(`/api/admin/users/search?q=${encodeURIComponent(trimmed)}`)
      if (!r.ok) { setSuggestions([]); setOpen(false); return }
      const j = await r.json() as Record<string, unknown>
      const users = Array.isArray(j.users) ? (j.users as UserSuggestion[]) : []
      setSuggestions(users.slice(0, 8))
      setOpen(users.length > 0)
      setActiveIdx(-1)
    } catch {
      setSuggestions([])
      setOpen(false)
    } finally {
      setFetching(false)
    }
  }, [])

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => void fetchSuggestions(value), 280)
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current) }
  }, [value, fetchSuggestions])

  // Close dropdown on outside click
  useEffect(() => {
    function onDown(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [])

  function handleSelect(u: UserSuggestion) {
    onChange(suggestionLabel(u))
    setSuggestions([])
    setOpen(false)
    onSelect(u)
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!open || suggestions.length === 0) return
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActiveIdx(i => Math.min(i + 1, suggestions.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActiveIdx(i => Math.max(i - 1, 0))
    } else if (e.key === 'Enter' && activeIdx >= 0) {
      e.preventDefault()
      handleSelect(suggestions[activeIdx])
    } else if (e.key === 'Escape') {
      setOpen(false)
    }
  }

  return (
    <div ref={containerRef} className={`relative ${width}`}>
      <Search size={13} className="pointer-events-none absolute top-1/2 right-2.5 -translate-y-1/2 text-neutral-400" />
      {fetching && (
        <div className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 h-3 w-3 animate-spin rounded-full border border-neutral-300 border-t-neutral-600 dark:border-neutral-600 dark:border-t-neutral-300" />
      )}
      <input
        type="text"
        value={value}
        onChange={e => onChange(e.target.value)}
        onKeyDown={handleKeyDown}
        onFocus={() => { if (suggestions.length > 0) setOpen(true) }}
        placeholder={placeholder}
        autoComplete="off"
        className={
          inputClassName ??
          'w-full rounded-lg border border-neutral-200 bg-white py-1.5 pr-7 pl-3 text-sm outline-none focus:border-neutral-400 dark:border-border dark:bg-zinc-800/50 dark:text-foreground dark:placeholder:text-neutral-600 dark:focus:border-zinc-500'
        }
      />
      {open && suggestions.length > 0 && (
        <ul
          dir="rtl"
          className="absolute right-0 top-full z-50 mt-1 w-full overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-lg dark:border-border dark:bg-neutral-900"
        >
          {suggestions.map((u, i) => (
            <li key={u.id}>
              <button
                type="button"
                onMouseDown={e => { e.preventDefault(); handleSelect(u) }}
                className={
                  'flex w-full items-center gap-2.5 px-3 py-2 text-right transition-colors ' +
                  (i === activeIdx
                    ? 'bg-neutral-100 dark:bg-neutral-800'
                    : 'hover:bg-neutral-50 dark:hover:bg-neutral-800/60')
                }
              >
                <Avatar src={u.avatar_url} name={u.display_name ?? u.username ?? '?'} size={24} />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium text-neutral-900 dark:text-foreground">
                    {u.display_name ?? `@${u.username}`}
                  </div>
                  {u.username && (
                    <div className="truncate text-xs text-neutral-400 dark:text-neutral-500">
                      @{u.username}
                    </div>
                  )}
                </div>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

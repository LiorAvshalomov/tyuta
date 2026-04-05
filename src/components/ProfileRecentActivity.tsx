'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'

import { supabase } from '@/lib/supabaseClient'

export type ProfileRecentActivityRow = {
  created_at: string
  content: string
  post_slug: string
  post_title: string
}

function timeAgo(dateStr: string): string {
  const date = new Date(dateStr)
  const now = new Date()
  const seconds = Math.floor((now.getTime() - date.getTime()) / 1000)

  if (seconds < 60) return 'עכשיו'
  if (seconds < 3600) return `לפני ${Math.floor(seconds / 60)} דק׳`
  if (seconds < 86400) return `לפני ${Math.floor(seconds / 3600)} שעות`
  if (seconds < 172800) return 'אתמול'
  if (seconds < 604800) return `לפני ${Math.floor(seconds / 86400)} ימים`
  return date.toLocaleDateString('he-IL', { day: 'numeric', month: 'short' })
}

export default function ProfileRecentActivity({
  userId,
  initialRows = [],
}: {
  userId: string
  initialRows?: ProfileRecentActivityRow[]
}) {
  const [rows, setRows] = useState<ProfileRecentActivityRow[]>(initialRows)
  const [loading, setLoading] = useState(initialRows.length === 0)

  useEffect(() => {
    if (initialRows.length > 0) return

    let cancelled = false

    async function load() {
      setLoading(true)

      const { data, error } = await supabase
        .from('user_recent_comments')
        .select('created_at, content, post_slug, post_title')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(10)

      if (cancelled) return
      if (!error && data) setRows(data as ProfileRecentActivityRow[])
      setLoading(false)
    }

    void load()

    return () => {
      cancelled = true
    }
  }, [initialRows.length, userId])

  return (
    <div
      className="flex max-h-[360px] flex-col overflow-hidden rounded-2xl border border-neutral-200 bg-white p-4 transition-shadow hover:shadow-md dark:bg-card dark:border-border sm:max-h-[420px] lg:absolute lg:inset-0 lg:max-h-none"
      dir="rtl"
    >
      <div className="mb-3 flex shrink-0 items-center justify-between">
        <h3 className="m-0 text-sm font-bold">פעילות אחרונה</h3>
        <span className="text-xs text-neutral-400 dark:text-muted-foreground/70">10 אחרונות</span>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {loading ? (
          <ul className="animate-pulse space-y-2 pb-1" aria-hidden="true">
            {[0, 1, 2, 3, 4].map((index) => (
              <li key={index} className="rounded-lg border border-neutral-100 bg-neutral-50 p-2.5 dark:border-border dark:bg-muted/50">
                <div className="mb-1.5 flex items-center justify-between gap-2">
                  <div className="h-3 w-3/5 rounded bg-neutral-200 dark:bg-muted" />
                  <div className="h-2.5 w-1/5 shrink-0 rounded bg-neutral-100 dark:bg-muted/60" />
                </div>
                <div className="space-y-1.5">
                  <div className="h-3 w-full rounded bg-neutral-100 dark:bg-muted/60" />
                  <div className="h-3 w-4/5 rounded bg-neutral-100 dark:bg-muted/60" />
                </div>
              </li>
            ))}
          </ul>
        ) : rows.length === 0 ? (
          <div className="flex h-full items-center justify-center py-8">
            <div className="text-center">
              <div className="mb-2 text-2xl">💬</div>
              <p className="text-sm text-neutral-500 dark:text-muted-foreground">אין עדיין תגובות.</p>
            </div>
          </div>
        ) : (
          <ul className="space-y-2 pb-1">
            {rows.map((row, index) => (
              <li
                key={`${row.post_slug}-${row.created_at}-${index}`}
                className="rounded-lg border border-neutral-100 bg-neutral-50 p-2.5 transition-colors hover:bg-neutral-100 dark:border-border dark:bg-muted/50 dark:hover:bg-muted"
              >
                <div className="mb-1 flex items-center justify-between gap-2">
                  <Link
                    className="max-w-[70%] truncate text-xs font-medium text-blue-600 transition-colors hover:text-blue-700 hover:underline dark:text-blue-400 dark:hover:text-blue-300"
                    href={`/post/${row.post_slug}`}
                  >
                    {row.post_title}
                  </Link>
                  <span className="shrink-0 text-[10px] text-neutral-400 dark:text-muted-foreground/70">
                    {timeAgo(row.created_at)}
                  </span>
                </div>
                <p className="line-clamp-2 text-xs leading-relaxed text-neutral-600 dark:text-muted-foreground">
                  {row.content}
                </p>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}

'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabaseClient'

type Row = {
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

export default function ProfileRecentActivity({ userId }: { userId: string }) {
  const [rows, setRows] = useState<Row[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const load = async () => {
      setLoading(true)

      const { data, error } = await supabase
        .from('user_recent_comments')
        .select('created_at, content, post_slug, post_title')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(10)

      if (!error && data) setRows(data as Row[])
      setLoading(false)
    }

    load()
  }, [userId])

  return (
    <div
      className="flex flex-col overflow-hidden rounded-2xl border border-neutral-200 bg-white p-4 transition-shadow hover:shadow-md dark:bg-card dark:border-border max-h-[360px] sm:max-h-[420px] lg:absolute lg:inset-0 lg:max-h-none"
      dir="rtl"
    >
      <div className="flex shrink-0 items-center justify-between mb-3">
        <h3 className="text-sm font-bold m-0">פעילות אחרונה</h3>
        <span className="text-xs text-neutral-400 dark:text-muted-foreground/70">10 אחרונות</span>
      </div>

      {/* Scrollable area */}
      <div className="flex-1 overflow-y-auto min-h-0">
        {loading ? (
          <ul className="space-y-2 pb-1 animate-pulse" aria-hidden="true">
            {[0, 1, 2, 3, 4].map(i => (
              <li key={i} className="rounded-lg border border-neutral-100 dark:border-border bg-neutral-50 dark:bg-muted/50 p-2.5">
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
              <div className="text-2xl mb-2">💬</div>
              <p className="text-sm text-neutral-500 dark:text-muted-foreground">אין עדיין תגובות.</p>
            </div>
          </div>
        ) : (
          <ul className="space-y-2 pb-1">
            {rows.map((r, i) => (
              <li 
                key={i} 
                className="rounded-lg border border-neutral-100 bg-neutral-50 p-2.5 transition-colors hover:bg-neutral-100 dark:border-border dark:bg-muted/50 dark:hover:bg-muted"
              >
                <div className="flex items-center justify-between gap-2 mb-1">
                  <Link
                    className="text-xs font-medium text-blue-600 dark:text-blue-400 transition-colors hover:text-blue-700 dark:hover:text-blue-300 hover:underline truncate max-w-[70%]"
                    href={`/post/${r.post_slug}`}
                  >
                    {r.post_title}
                  </Link>
                  <span className="text-[10px] text-neutral-400 shrink-0 dark:text-muted-foreground/70">
                    {timeAgo(r.created_at)}
                  </span>
                </div>
                <p className="text-xs leading-relaxed text-neutral-600 line-clamp-2 dark:text-muted-foreground">
                  {r.content}
                </p>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}

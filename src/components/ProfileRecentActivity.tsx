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
        .limit(5)

      if (!error && data) setRows(data as Row[])
      setLoading(false)
    }

    load()
  }, [userId])

  return (
    <div className="flex h-[440px] flex-col rounded-2xl border border-neutral-200 bg-white p-4 transition-shadow hover:shadow-md" dir="rtl">
      <div className="flex shrink-0 items-center justify-between">
        <h3 className="text-sm font-bold m-0">פעילות אחרונה</h3>
        <span className="text-xs text-neutral-400">5 אחרונות</span>
      </div>

      {/* Scrollable content area */}
      <div className="mt-3 flex-1 overflow-y-auto">
        {loading ? (
          <div className="flex h-full items-center justify-center">
            <div className="h-5 w-5 animate-spin rounded-full border-2 border-neutral-300 border-t-neutral-600" />
          </div>
        ) : rows.length === 0 ? (
          <div className="flex h-full items-center justify-center">
            <div className="text-center">
              <div className="text-2xl mb-2">💬</div>
              <p className="text-sm text-neutral-500">אין עדיין תגובות.</p>
            </div>
          </div>
        ) : (
          <ul className="space-y-2 pb-1">
            {rows.map((r, i) => (
              <li 
                key={i} 
                className="rounded-xl border border-neutral-100 bg-neutral-50 p-3 transition-colors hover:bg-neutral-100"
              >
                <div className="text-xs text-neutral-400">
                  {new Date(r.created_at).toLocaleString('he-IL')}
                </div>

                <div className="mt-1 text-sm leading-relaxed text-neutral-700 line-clamp-2">
                  {r.content}
                </div>

                <Link
                  className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-blue-600 transition-colors hover:text-blue-700 hover:underline"
                  href={`/post/${r.post_slug}`}
                >
                  <span>↩</span>
                  <span className="line-clamp-1">{r.post_title}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}

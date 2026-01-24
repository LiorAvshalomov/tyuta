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
        .limit(10)

      if (!error && data) setRows(data as Row[])
      setLoading(false)
    }

    load()
  }, [userId])

  return (
    <div className="rounded-2xl border bg-white p-4 h-[320px] flex flex-col" dir="rtl">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-bold m-0">פעילות אחרונה</h3>
        <span className="text-xs text-muted-foreground">10 אחרונות</span>
      </div>

      <div className="mt-3 flex-1 overflow-y-auto pr-1">
        {loading ? (
          <div className="text-sm text-muted-foreground">טוען…</div>
        ) : rows.length === 0 ? (
          <div className="text-sm text-muted-foreground">אין עדיין תגובות.</div>
        ) : (
          <ul className="space-y-3">
            {rows.map((r, i) => (
              <li key={i} className="border-b pb-3 last:border-b-0 last:pb-0">
                <div className="text-xs text-muted-foreground">
                  {new Date(r.created_at).toLocaleString('he-IL')}
                </div>

                <div className="mt-1 text-sm leading-6 line-clamp-2">
                  {r.content}
                </div>

                <Link
                  className="mt-2 inline-block text-sm font-semibold hover:underline"
                  href={`/post/${r.post_slug}`}
                >
                  ↩ לפוסט: {r.post_title}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}

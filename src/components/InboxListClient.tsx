'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabaseClient'
import Avatar from './Avatar'

type Thread = {
  conversation_id: string
  other_username: string
  other_display_name: string
  other_avatar_url: string | null
  last_message_body: string | null
  unread_count: number
}

export default function InboxListClient() {
  const [threads, setThreads] = useState<Thread[]>([])

  async function load() {
    const { data } = await supabase
      .from('inbox_threads')
      .select('*')
      .order('last_message_at', { ascending: false })

    setThreads((data ?? []) as Thread[])
  }

  useEffect(() => {
    load()

    const channel = supabase
      .channel('inbox-realtime')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages' },
        load
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [])

  if (threads.length === 0) {
    return <p className="text-sm text-muted-foreground">אין הודעות</p>
  }

  return (
    <div className="space-y-3">
      {threads.map(t => (
        <Link
          key={t.conversation_id}
          href={`/inbox/${t.conversation_id}`}
          className="flex items-center gap-3 rounded-2xl border bg-white p-3 hover:bg-neutral-50"
        >
          <Avatar
            src={t.other_avatar_url}
            name={t.other_display_name}
            size={48}
          />

          <div className="min-w-0 flex-1">
            <div className="flex justify-between gap-2">
              <div className="font-semibold truncate">
                {t.other_display_name}
              </div>
              {t.unread_count > 0 && (
                <span className="rounded-full bg-red-600 px-2 py-0.5 text-xs text-white">
                  {t.unread_count}
                </span>
              )}
            </div>
            <div className="truncate text-sm text-muted-foreground">
              {t.last_message_body ?? '—'}
            </div>
          </div>
        </Link>
      ))}
    </div>
  )
}

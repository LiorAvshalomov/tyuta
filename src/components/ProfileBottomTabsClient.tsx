'use client'

import type { ComponentProps } from 'react'
import { useEffect, useState } from 'react'
import ProfilePostsClient from '@/components/ProfilePostsClient'
import ProfileStatsCard, { type ProfileReactionTotal } from '@/components/ProfileStatsCard'
import { supabase } from '@/lib/supabaseClient'

type Tab = 'posts' | 'stats'

export default function ProfileBottomTabsClient({
  profileId,
  username,
  postsCount,
  commentsWritten,
  commentsReceived,
  medals,
  initialReactionTotals,
  initialPostsData,
}: {
  profileId: string
  username: string
  postsCount: number
  commentsWritten: number
  commentsReceived: number
  medals: { gold: number; silver: number; bronze: number }
  initialReactionTotals?: ProfileReactionTotal[]
  initialPostsData?: ComponentProps<typeof ProfilePostsClient>['initialData']
}) {
  const [tab, setTab] = useState<Tab>('posts')
  const [statsLoading, setStatsLoading] = useState(false)
  const [statsLoaded, setStatsLoaded] = useState(Array.isArray(initialReactionTotals))
  const [reactionTotals, setReactionTotals] = useState<ProfileReactionTotal[] | undefined>(initialReactionTotals)

  useEffect(() => {
    if (tab !== 'stats' || statsLoaded) return

    let cancelled = false

    async function loadStats() {
      setStatsLoading(true)

      const { data: totals, error: totalsError } = await supabase.rpc('get_profile_reaction_totals', {
        p_profile_id: profileId,
      })

      if (cancelled) return
      if (totalsError) {
        console.error('get_profile_reaction_totals error:', totalsError)
      }

      setReactionTotals(Array.isArray(totals) ? (totals as ProfileReactionTotal[]) : undefined)
      setStatsLoaded(true)
      setStatsLoading(false)
    }

    void loadStats()

    return () => {
      cancelled = true
    }
  }, [profileId, statsLoaded, tab])

  return (
    <section className="mt-6" dir="rtl">
      <div className="rounded-2xl border border-neutral-200 bg-white shadow-sm transition-shadow hover:shadow-md overflow-hidden dark:bg-card dark:border-border">
        {/* Header with title and tabs */}
        <div className="flex items-center justify-between gap-3 border-b border-neutral-100 p-4 dark:border-border sm:p-5">
          <h2 className="shrink-0 text-base font-black text-neutral-950 dark:text-foreground sm:text-lg">התוכן שלי</h2>

          {/* Tab switcher */}
          <div className="inline-flex shrink-0 items-center rounded-[18px] border border-neutral-200 bg-neutral-100/80 p-1 shadow-inner shadow-white/50 dark:border-white/10 dark:bg-neutral-800/70 dark:shadow-none sm:rounded-full sm:border-neutral-200 sm:bg-neutral-50 sm:p-1 sm:shadow-none sm:dark:!border-border sm:dark:!bg-neutral-800">
            <button
              type="button"
              onClick={() => setTab('posts')}
              aria-pressed={tab === 'posts'}
              className={`min-h-10 rounded-[14px] px-4 py-1.5 text-sm font-semibold transition-all duration-200 sm:min-h-0 sm:rounded-full ${
                tab === 'posts'
                  ? 'bg-blue-600 text-white shadow-sm dark:bg-blue-600 dark:text-white'
                  : 'text-neutral-700 hover:bg-white/80 hover:text-neutral-950 dark:text-neutral-200 dark:hover:bg-white/[0.06] dark:hover:text-neutral-50 sm:text-neutral-600 sm:hover:bg-transparent sm:hover:text-neutral-900 sm:dark:text-muted-foreground sm:dark:hover:bg-transparent sm:dark:hover:text-foreground'
              }`}
            >
              פוסטים
            </button>
            <button
              type="button"
              onClick={() => setTab('stats')}
              aria-pressed={tab === 'stats'}
              className={`min-h-10 rounded-[14px] px-4 py-1.5 text-sm font-semibold transition-all duration-200 sm:min-h-0 sm:rounded-full ${
                tab === 'stats'
                  ? 'bg-blue-600 text-white shadow-sm dark:bg-blue-600 dark:text-white'
                  : 'text-neutral-700 hover:bg-white/80 hover:text-neutral-950 dark:text-neutral-200 dark:hover:bg-white/[0.06] dark:hover:text-neutral-50 sm:text-neutral-600 sm:hover:bg-transparent sm:hover:text-neutral-900 sm:dark:text-muted-foreground sm:dark:hover:bg-transparent sm:dark:hover:text-foreground'
              }`}
            >
              נתונים
            </button>
          </div>
        </div>

        {/* Tab content with animation */}
        <div className="p-4 sm:p-5">
          <div className="relative">
            {/* Posts Tab */}
            <div 
              className={`transition-all duration-300 ease-out ${
                tab === 'posts' 
                  ? 'opacity-100 translate-y-0' 
                  : 'opacity-0 absolute inset-0 translate-y-2 pointer-events-none'
              }`}
            >
              {tab === 'posts' && <ProfilePostsClient profileId={profileId} username={username} initialData={initialPostsData} />}
            </div>
            
            {/* Stats Tab */}
            <div 
              className={`transition-all duration-300 ease-out ${
                tab === 'stats' 
                  ? 'opacity-100 translate-y-0' 
                  : 'opacity-0 absolute inset-0 translate-y-2 pointer-events-none'
              }`}
            >
              {tab === 'stats' && (
                <ProfileStatsCard
                  loading={statsLoading && !statsLoaded}
                  postsCount={postsCount}
                  commentsWritten={commentsWritten}
                  commentsReceived={commentsReceived}
                  medals={medals}
                  reactionTotals={reactionTotals ?? []}
                />
              )}
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

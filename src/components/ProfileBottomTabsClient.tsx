'use client'

import { useState } from 'react'
import ProfilePostsClient from '@/components/ProfilePostsClient'
import ProfileStatsCard, { type ProfileReactionTotal } from '@/components/ProfileStatsCard'

type Tab = 'posts' | 'stats'

export default function ProfileBottomTabsClient({
  profileId,
  username,
  postsCount,
  commentsWritten,
  commentsReceived,
  medals,
  reactionTotals,
}: {
  profileId: string
  username: string
  postsCount: number
  commentsWritten: number
  commentsReceived: number
  medals: { gold: number; silver: number; bronze: number }
  reactionTotals?: ProfileReactionTotal[]
}) {
  const [tab, setTab] = useState<Tab>('posts')

  return (
    <section className="mt-6" dir="rtl">
      <div className="rounded-2xl border border-neutral-200 bg-white shadow-sm transition-shadow hover:shadow-md overflow-hidden dark:bg-card dark:border-border">
        {/* Header with title and tabs */}
        <div className="flex flex-wrap items-center justify-between gap-3 p-4 sm:p-5 border-b border-neutral-100 dark:border-border">
          <h2 className="text-lg font-bold">התוכן שלי</h2>

          {/* Tab switcher */}
          <div className="inline-flex items-center rounded-full border border-neutral-200 bg-neutral-50 p-1 dark:border-border dark:bg-muted">
            <button
              type="button"
              onClick={() => setTab('posts')}
              className={`rounded-full px-4 py-1.5 text-sm font-medium transition-all duration-200 ${
                tab === 'posts'
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'text-neutral-600 hover:text-neutral-900 dark:text-muted-foreground dark:hover:text-foreground'
              }`}
            >
              פוסטים
            </button>
            <button
              type="button"
              onClick={() => setTab('stats')}
              className={`rounded-full px-4 py-1.5 text-sm font-medium transition-all duration-200 ${
                tab === 'stats'
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'text-neutral-600 hover:text-neutral-900 dark:text-muted-foreground dark:hover:text-foreground'
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
              {tab === 'posts' && <ProfilePostsClient profileId={profileId} username={username} />}
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

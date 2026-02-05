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
      <div className="rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm transition-shadow hover:shadow-md lg:rounded-3xl lg:p-6">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-bold">{tab === 'posts' ? 'פוסטים' : 'נתונים'}</h2>

          {/* Tab switcher */}
          <div className="inline-flex items-center gap-1 rounded-full border border-neutral-200 bg-neutral-50 p-1">
            <button
              type="button"
              onClick={() => setTab('posts')}
              className={`rounded-full px-4 py-1.5 text-sm font-medium transition-all duration-200 ${
                tab === 'posts' 
                  ? 'bg-neutral-900 text-white shadow-sm' 
                  : 'text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900'
              }`}
            >
              פוסטים
            </button>
            <button
              type="button"
              onClick={() => setTab('stats')}
              className={`rounded-full px-4 py-1.5 text-sm font-medium transition-all duration-200 ${
                tab === 'stats' 
                  ? 'bg-neutral-900 text-white shadow-sm' 
                  : 'text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900'
              }`}
            >
              נתונים
            </button>
          </div>
        </div>

        {/* Tab content with animation */}
        <div className="relative overflow-hidden">
          <div 
            className={`transition-all duration-300 ease-out ${
              tab === 'posts' 
                ? 'opacity-100 translate-x-0' 
                : 'opacity-0 absolute inset-0 translate-x-4 pointer-events-none'
            }`}
          >
            {tab === 'posts' && <ProfilePostsClient profileId={profileId} username={username} />}
          </div>
          
          <div 
            className={`transition-all duration-300 ease-out ${
              tab === 'stats' 
                ? 'opacity-100 translate-x-0' 
                : 'opacity-0 absolute inset-0 -translate-x-4 pointer-events-none'
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
    </section>
  )
}

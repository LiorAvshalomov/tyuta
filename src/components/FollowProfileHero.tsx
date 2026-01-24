'use client'

import Link from 'next/link'
import FollowButton from '@/components/FollowButton'
import ProfileNonOwnerActions from '@/components/ProfileNonOwnerActions'

export default function FollowProfileHero({
  profileId,
  username,
  displayName,
  avatarUrl,
  followersCount,
  followingCount,
  medals,
}: {
  profileId: string
  username: string
  displayName: string
  avatarUrl: string | null
  followersCount: number
  followingCount: number
  medals: { gold: number; silver: number; bronze: number }
}) {
  return (
    <section className="mx-auto max-w-3xl rounded-2xl border bg-white p-4 shadow-sm" dir="rtl">
      {/* חזרה לפרופיל בתוך הכרטיס */}
      <div className="mb-3 flex items-center justify-end">
        <Link
          href={`/u/${username}`}
          className="h-9 rounded-md border bg-white px-3 text-xs font-semibold hover:bg-neutral-50 inline-flex items-center"
        >
          חזרה לפרופיל
        </Link>
      </div>

      <div className="flex items-start justify-center gap-6">
        {/* ימין: תמונה */}
        <div className="shrink-0">
          <div className="h-32 w-32 overflow-hidden rounded-md border bg-neutral-100">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {avatarUrl ? (
              <img src={avatarUrl} alt={displayName} className="h-full w-full object-cover" />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-5xl font-black text-neutral-500">
                {(displayName?.[0] ?? 'א').toUpperCase()}
              </div>
            )}
          </div>
        </div>

        {/* שמאל: הכל מתחיל יחד במקביל */}
        <div className="min-w-0 flex-1">
          {/* שם + מדליות באותה שורה */}
          <div className="flex items-center gap-3">
            <h1 className="truncate text-2xl font-bold"><Link href={`/u/${username}`} className="hover:opacity-90">
  {displayName}
</Link></h1>

            <div className="flex items-center gap-2 shrink-0 text-xs text-muted-foreground">
              <span className="inline-flex items-center gap-1 rounded-full border bg-neutral-50 px-2 py-1">
                🥉 {medals.bronze}
              </span>
              <span className="inline-flex items-center gap-1 rounded-full border bg-neutral-50 px-2 py-1">
                🥈 {medals.silver}
              </span>
              <span className="inline-flex items-center gap-1 rounded-full border bg-neutral-50 px-2 py-1">
              🥇 {medals.gold}
              </span>
            </div>
          </div>

          {/* עוקבים/נעקבים באותה התחלה בדיוק */}
          <div className="mt-2 flex items-center gap-3 text-sm">
            <Link href={`/u/${username}/followers`} className="hover:underline">
              <span className="font-bold">{followersCount}</span> עוקבים
            </Link>
            <span className="text-muted-foreground">|</span>
            <Link href={`/u/${username}/following`} className="hover:underline">
              <span className="font-bold">{followingCount}</span> נעקבים
            </Link>
          </div>

          {/* כפתורים — אותו גובה */}
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <ProfileNonOwnerActions profileId={profileId} username={username} />
            <FollowButton targetUserId={profileId} targetUsername={username} />
          </div>
        </div>
      </div>
    </section>
  )
}

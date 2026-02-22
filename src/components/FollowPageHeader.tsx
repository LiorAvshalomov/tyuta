import Link from 'next/link'
import ProfileAvatarFrame from '@/components/ProfileAvatarFrame'

export default function FollowPageHeader({
  profileId,
  username,
  displayName,
  avatarUrl,
  initialFollowers,
  initialFollowing,
  medals,
}: {
  profileId: string
  username: string
  displayName: string
  avatarUrl: string | null
  initialFollowers: number
  initialFollowing: number
  medals: { gold: number; silver: number; bronze: number }
}) {
  // Suppress unused warnings
  void profileId
  void initialFollowers
  void initialFollowing

  return (
    <section className="rounded-2xl border border-neutral-200 bg-white p-4 sm:p-5 shadow-sm dark:bg-card dark:border-border" dir="rtl">
      {/* Back button - top right */}
      <div className="mb-4">
        <Link
          href={`/u/${username}`}
          className="inline-flex items-center gap-1.5 rounded-full border border-neutral-200 bg-white px-3 py-1.5 text-sm font-medium text-neutral-600 transition-colors hover:bg-neutral-50 hover:text-neutral-900 dark:border-border dark:bg-card dark:text-muted-foreground dark:hover:bg-muted dark:hover:text-foreground"
        >
          <svg className="h-4 w-4 rotate-180" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          חזרה לפרופיל
        </Link>
      </div>

      {/* Profile info */}
      <div className="flex items-center gap-4">
        {/* Avatar */}
        <Link href={`/u/${username}`} className="shrink-0">
          <ProfileAvatarFrame src={avatarUrl} name={displayName} size={80} shape="square" />
        </Link>

        {/* Name + Medals */}
        <div className="min-w-0 flex-1">
          <h1 className="text-xl font-bold leading-tight truncate">
            <Link href={`/u/${username}`} className="hover:text-blue-600 transition-colors">
              {displayName}
            </Link>
          </h1>
          <div className="text-sm text-neutral-500 mt-0.5 dark:text-muted-foreground">@{username}</div>

          {/* Medals - compact */}
          {(medals.gold > 0 || medals.silver > 0 || medals.bronze > 0) && (
            <div className="flex items-center gap-2 mt-2">
              {medals.gold > 0 && (
                <span className="inline-flex items-center gap-1 text-sm">
                  <span>🥇</span>
                  <span className="font-semibold">{medals.gold}</span>
                </span>
              )}
              {medals.silver > 0 && (
                <span className="inline-flex items-center gap-1 text-sm">
                  <span>🥈</span>
                  <span className="font-semibold">{medals.silver}</span>
                </span>
              )}
              {medals.bronze > 0 && (
                <span className="inline-flex items-center gap-1 text-sm">
                  <span>🥉</span>
                  <span className="font-semibold">{medals.bronze}</span>
                </span>
              )}
            </div>
          )}
        </div>
      </div>
    </section>
  )
}

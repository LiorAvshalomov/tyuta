import Link from 'next/link'
import Avatar from '@/components/Avatar'
import ProfileFollowBar from '@/components/ProfileFollowBar'

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
  return (
    <section className="rounded-3xl border bg-white p-5 shadow-sm" dir="rtl">
      {/* חזרה לפרופיל - בפינה שמאלית (RTL: justify-end) */}
      {/* <div className="mb-3 flex items-center justify-end">
        <Link
          href={`/u/${username}`}
          className="h-9 inline-flex items-center rounded-md border bg-white px-3 text-xs font-semibold hover:bg-neutral-50"
        >
          חזרה לפרופיל
        </Link>
      </div> */}

      <div className="flex items-start gap-4">
        <div className="flex items-center gap-4 min-w-0 flex-1">
          <div className="shrink-0">
            <div className="rounded-full ring-2 ring-black/5 p-1">
              <Avatar src={avatarUrl} name={displayName} size={140} shape="square" />
            </div>
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex items-start justify-between gap-3 w-full">
              {/* ✅ השם לחיץ ומעביר לפרופיל */}
              <h1 className="min-w-0 text-2xl font-bold leading-tight break-words">
                <Link href={`/u/${username}`} className="hover:underline">
                  {displayName}
                </Link>
              </h1>

              {/* מדליות – כרגע 0 עד שתחבר ל-DB */}
              <div className="shrink-0">
                <div className="flex items-center gap-2">
                  <span className="rounded-full border bg-neutral-50 px-3 py-1 text-sm">
                    🥉 {medals.bronze}
                  </span>
                  <span className="rounded-full border bg-neutral-50 px-3 py-1 text-sm">
                    🥈 {medals.silver}
                  </span>
                  <span className="rounded-full border bg-neutral-50 px-3 py-1 text-sm">
                    🥇 {medals.gold}
                  </span>
                </div>
              </div>
            </div>

            {/* ✅ לפי מה שביקשת קודם: מורידים @username מהדף הזה */}
            {/* <div className="mt-1 text-sm text-muted-foreground">@{username}</div> */}

            {/* counts + actions + realtime */}
            <div className="mt-3">
              <ProfileFollowBar
                profileId={profileId}
                username={username}
                initialFollowers={initialFollowers}
                initialFollowing={initialFollowing}
              />
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

import Link from 'next/link'

type Profile = {
  id: string
  username: string
  bio: string
  createdAt: string | null
  avatarUrl: string | null
}

type Medals = {
  gold: number
  silver: number
  bronze: number
}

export default function ProfileShell({
  profile,
  medals,
  sort,
  children,
}: {
  profile: Profile
  medals: Medals
  sort: string
  children: React.ReactNode
}) {
  return (
    <div dir="rtl" className="mx-auto w-full max-w-3xl px-4 py-6">
      <div className="rounded-2xl border bg-white p-5">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <h1 className="text-2xl font-extrabold leading-tight">
              {profile.username}
            </h1>
            

            {profile.bio ? (
              <p className="mt-2 text-sm leading-6 text-neutral-600">
                {profile.bio}
              </p>
            ) : (
              <p className="mt-2 text-sm text-neutral-500">
                עדיין אין תיאור.
              </p>
            )}

            {profile.createdAt ? (
              <p className="mt-3 text-xs text-neutral-500">
                הצטרף בתאריך {new Date(profile.createdAt).toLocaleDateString('he-IL')}
              </p>
            ) : null}
          </div>

          <div className="flex shrink-0 items-center gap-3 text-sm">
            {medals.gold > 0 && (
              <span className="rounded-full bg-neutral-100 px-3 py-1">
                🥇 {medals.gold}
              </span>
            )}
            {medals.silver > 0 && (
              <span className="rounded-full bg-neutral-100 px-3 py-1">
                🥈 {medals.silver}
              </span>
            )}
            {medals.bronze > 0 && (
              <span className="rounded-full bg-neutral-100 px-3 py-1">
                🥉 {medals.bronze}
              </span>
            )}
          </div>
        </div>

        <div className="mt-5 flex gap-2">
          <Link
            href={`/users/${profile.id}?sort=new`}
            className={[
              'rounded-full px-4 py-2 text-sm',
              sort === 'new'
                ? 'bg-black text-white'
                : 'bg-neutral-100 text-neutral-800 hover:bg-neutral-200',
            ].join(' ')}
          >
            חדשים
          </Link>

          <Link
            href={`/users/${profile.id}?sort=top`}
            className={[
              'rounded-full px-4 py-2 text-sm',
              sort === 'top'
                ? 'bg-black text-white'
                : 'bg-neutral-100 text-neutral-800 hover:bg-neutral-200',
            ].join(' ')}
          >
            הכי מדורגים
          </Link>
        </div>
      </div>

      {children}
    </div>
  )
}

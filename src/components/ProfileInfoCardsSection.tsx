'use client'

import ProfilePersonalInfoCardClient from '@/components/ProfilePersonalInfoCardClient'
import ProfileRecentActivity, { type ProfileRecentActivityRow } from '@/components/ProfileRecentActivity'

type PersonalInfo = {
  personal_is_shared: boolean
  personal_about: string | null
  personal_age: number | null
  personal_occupation: string | null
  personal_writing_about: string | null
  personal_books: string | null
  personal_favorite_category: string | null
}

export default function ProfileInfoCardsSection({
  profileId,
  userId,
  initial,
  initialRecentActivity,
}: {
  profileId: string
  userId: string
  initial: PersonalInfo
  initialRecentActivity?: ProfileRecentActivityRow[]
}) {
  return (
    <section className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
      <ProfilePersonalInfoCardClient
        profileId={profileId}
        initial={initial}
      />
      <div className="lg:relative">
        <ProfileRecentActivity userId={userId} initialRows={initialRecentActivity} />
      </div>
    </section>
  )
}

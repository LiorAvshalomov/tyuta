'use client'

import { useState, useRef, useEffect } from 'react'
import ProfilePersonalInfoCardClient from '@/components/ProfilePersonalInfoCardClient'
import ProfileRecentActivity from '@/components/ProfileRecentActivity'

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
}: {
  profileId: string
  userId: string
  initial: PersonalInfo
}) {
  const [personalInfoHeight, setPersonalInfoHeight] = useState<number>(0)
  const personalInfoRef = useRef<HTMLDivElement>(null)

  // Observe personal info card height
  useEffect(() => {
    if (!personalInfoRef.current) return

    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setPersonalInfoHeight(entry.contentRect.height)
      }
    })

    observer.observe(personalInfoRef.current)
    return () => observer.disconnect()
  }, [])

  return (
    <section className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
      <div ref={personalInfoRef}>
        <ProfilePersonalInfoCardClient
          profileId={profileId}
          initial={initial}
        />
      </div>
      <ProfileRecentActivity 
        userId={userId} 
        matchHeight={personalInfoHeight > 0 ? personalInfoHeight : undefined} 
      />
    </section>
  )
}

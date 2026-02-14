import type { Metadata } from 'next'
import type { ReactNode } from 'react'

import { supabase } from '@/lib/supabaseClient'

const SITE_URL = 'https://tyuta.net'

type LayoutProps = {
  children: ReactNode
  params: { username: string }
}

type ProfileSeoRow = {
  username: string
  display_name: string | null
  bio: string | null
  avatar_url: string | null
  created_at: string | null
  personal_updated_at: string | null
}

export async function generateMetadata({ params }: LayoutProps): Promise<Metadata> {
  const username = params?.username
  const canonical = `${SITE_URL}/u/${encodeURIComponent(username)}`

  const { data, error } = await supabase
    .from('profiles')
    .select('username, display_name, bio, avatar_url, created_at, personal_updated_at')
    .eq('username', username)
    .maybeSingle()

  if (error || !data) {
    return {
      title: 'פרופיל לא נמצא',
      robots: { index: false, follow: false },
      alternates: { canonical },
      openGraph: { type: 'website', url: canonical },
    }
  }

  const p = data as ProfileSeoRow
  const name = (p.display_name ?? '').trim() || `@${p.username}`
  const title = `${name}`
  const description = (p.bio ?? '').trim() || 'פרופיל משתמש ב‑Tyuta'
  const imageUrl = p.avatar_url ? p.avatar_url : `${SITE_URL}/apple-touch-icon.png`

  return {
    title,
    description,
    alternates: { canonical },
    openGraph: {
      type: 'profile',
      url: canonical,
      title,
      description,
      siteName: 'Tyuta',
      locale: 'he_IL',
      images: [{ url: imageUrl }],
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: [imageUrl],
    },
  }
}

export default function ProfileLayout({ children }: LayoutProps) {
  return <>{children}</>
}

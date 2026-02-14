import type { Metadata } from "next"
import { createClient } from "@supabase/supabase-js"
import React from "react"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

type Params = { username: string }

type ProfileRow = {
  username: string | null
  display_name: string | null
  bio: string | null
  avatar_url: string | null
}

function absoluteUrl(path: string): string {
  const base = "https://tyuta.net"
  if (path.startsWith("http")) return path
  if (!path.startsWith("/")) return `${base}/${path}`
  return `${base}${path}`
}

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const username = params.username
  const url = absoluteUrl(`/u/${encodeURIComponent(username)}`)

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!supabaseUrl || !anonKey) {
    return {
      title: "Tyuta",
      alternates: { canonical: url },
      openGraph: { type: "profile", url },
      twitter: { card: "summary" },
    }
  }

  const supabase = createClient(supabaseUrl, anonKey, { auth: { persistSession: false } })

  const { data } = await supabase
    .from("profiles")
    .select("username,display_name,bio,avatar_url")
    .eq("username", username)
    .maybeSingle<ProfileRow>()

  if (!data || !data.username) {
    return {
      title: "פרופיל לא נמצא | Tyuta",
      alternates: { canonical: url },
      robots: { index: false, follow: false },
      openGraph: { type: "website", url, title: "פרופיל לא נמצא | Tyuta" },
      twitter: { card: "summary" },
    }
  }

  const title = (data.display_name?.trim() || data.username.trim()) + " | Tyuta"
  const description = (data.bio?.trim() || "המקום לכל הגרסאות שלך").slice(0, 200)
  const image = data.avatar_url ? absoluteUrl(data.avatar_url) : absoluteUrl("/og-default.png")

  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: {
      type: "profile",
      url,
      title,
      description,
      images: [{ url: image }],
      locale: "he_IL",
      siteName: "Tyuta",
    },
    twitter: {
      card: "summary",
      title,
      description,
      images: [image],
    },
  }
}

export default function UserLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}

import type { Metadata } from "next"
import type { ReactNode } from "react"
import { createClient } from "@supabase/supabase-js"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

const SITE_URL = "https://tyuta.net"

type LayoutProps = {
  children: ReactNode
  params: Promise<{ username: string }>
}

type ProfileSeoRow = {
  username: string
  display_name: string | null
  bio: string | null
  avatar_url: string | null
}

function absUrl(pathOrUrl: string): string {
  if (pathOrUrl.startsWith("http")) return pathOrUrl
  if (!pathOrUrl.startsWith("/")) return `${SITE_URL}/${pathOrUrl}`
  return `${SITE_URL}${pathOrUrl}`
}

function getServerSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !key) return null
  return createClient(url, key, { auth: { persistSession: false } })
}

export async function generateMetadata({ params }: LayoutProps): Promise<Metadata> {
  const { username } = await params
  const canonical = `${SITE_URL}/u/${encodeURIComponent(username)}`

  const supabase = getServerSupabase()
  if (!supabase) {
    return { alternates: { canonical } }
  }

  const { data, error } = await supabase
    .from("profiles")
    .select("username,display_name,bio,avatar_url")
    .eq("username", username)
    .maybeSingle<ProfileSeoRow>()

  if (error || !data) {
    return {
      title: "פרופיל לא נמצא",
      alternates: { canonical },
      robots: { index: false, follow: false },
      openGraph: { type: "website", url: canonical },
      twitter: { card: "summary" },
    }
  }

  // IMPORTANT: do NOT append " | Tyuta" here if RootLayout already uses title.template
  const name = (data.display_name ?? "").trim() || `@${data.username}`
  const description = ((data.bio ?? "").trim() || "פרופיל משתמש ב‑Tyuta").slice(0, 200)
  const image = data.avatar_url ? absUrl(data.avatar_url) : absUrl("/apple-touch-icon.png")

  return {
    title: name,
    description,
    alternates: { canonical },
    openGraph: {
      type: "profile",
      url: canonical,
      title: `${name} | Tyuta`, // OG title can include brand safely (doesn't affect browser tab template)
      description,
      siteName: "Tyuta",
      locale: "he_IL",
      images: [{ url: image }],
    },
    twitter: {
      card: "summary",
      title: `${name} | Tyuta`,
      description,
      images: [image],
    },
  }
}

export default function UserLayout({ children }: LayoutProps) {
  return <>{children}</>
}

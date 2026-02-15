import type { Metadata } from "next"
import type { ReactNode } from "react"
import { createClient } from "@supabase/supabase-js"

export const revalidate = 60
export const runtime = "nodejs"

const SITE_URL = "https://tyuta.net"

type LayoutProps = {
  children: ReactNode
  params: Promise<{ slug: string }>
}

type PostSeoRow = {
  title: string | null
  excerpt: string | null
  cover_image_url: string | null
  published_at: string | null
  updated_at: string | null
  slug: string
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
  const { slug } = await params
  const canonical = `${SITE_URL}/post/${encodeURIComponent(slug)}`

  const supabase = getServerSupabase()
  if (!supabase) {
    return { alternates: { canonical } }
  }

  const { data, error } = await supabase
    .from("posts")
    .select("slug,title,excerpt,cover_image_url,published_at,updated_at")
    .eq("slug", slug)
    .eq("status", "published")
    .is("deleted_at", null)
    .maybeSingle<PostSeoRow>()

  if (error || !data) {
    return {
      title: "פוסט לא נמצא | Tyuta",
      alternates: { canonical },
      robots: { index: false, follow: false },
      openGraph: { type: "website", url: canonical },
      twitter: { card: "summary" },
    }
  }

  const title = (data.title ?? "").trim() || "Tyuta"
  const description = ((data.excerpt ?? "").trim() || "המקום לכל הגרסאות שלך").slice(0, 200)
  const image = data.cover_image_url ? absUrl(data.cover_image_url) : absUrl("/apple-touch-icon.png")

  return {
    title,
    description,
    alternates: { canonical },
    openGraph: {
      type: "article",
      url: canonical,
      title,
      description,
      siteName: "Tyuta",
      locale: "he_IL",
      images: [{ url: image }],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [image],
    },
  }
}

export default function PostLayout({ children }: LayoutProps) {
  return <>{children}</>
}

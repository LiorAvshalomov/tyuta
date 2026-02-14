import type { Metadata } from "next"
import { createClient } from "@supabase/supabase-js"
import React from "react"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

type Params = { slug: string }

type PostRow = {
  title: string | null
  excerpt: string | null
  cover_image_url: string | null
  published_at: string | null
  updated_at: string | null
}

function absoluteUrl(path: string): string {
  const base = "https://tyuta.net"
  if (path.startsWith("http")) return path
  if (!path.startsWith("/")) return `${base}/${path}`
  return `${base}${path}`
}

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const slug = params.slug
  const url = absoluteUrl(`/post/${encodeURIComponent(slug)}`)

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  // Safe fallback if env missing
  if (!supabaseUrl || !anonKey) {
    return {
      title: "Tyuta",
      alternates: { canonical: url },
      openGraph: { type: "article", url },
      twitter: { card: "summary_large_image" },
    }
  }

  const supabase = createClient(supabaseUrl, anonKey, { auth: { persistSession: false } })

  const { data } = await supabase
    .from("posts")
    .select("title,excerpt,cover_image_url,published_at,updated_at")
    .eq("slug", slug)
    .is("deleted_at", null)
    .maybeSingle<PostRow>()

  // If not found/published: noindex and generic metadata
  if (!data || !data.published_at) {
    return {
      title: "פוסט לא נמצא | Tyuta",
      alternates: { canonical: url },
      robots: { index: false, follow: false },
      openGraph: { type: "website", url, title: "פוסט לא נמצא | Tyuta" },
      twitter: { card: "summary" },
    }
  }

  const title = data.title?.trim() || "Tyuta"
  const description =
    (data.excerpt?.trim() || "המקום לכל הגרסאות שלך").slice(0, 200)

  const image = data.cover_image_url ? absoluteUrl(data.cover_image_url) : absoluteUrl("/og-default.png")

  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: {
      type: "article",
      url,
      title,
      description,
      images: [{ url: image }],
      locale: "he_IL",
      siteName: "Tyuta",
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [image],
    },
  }
}

export default function PostLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}

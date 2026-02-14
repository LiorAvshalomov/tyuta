import { MetadataRoute } from "next"
import { createClient } from "@supabase/supabase-js"

export const revalidate = 3600 // שעה

type SitemapPostRow = {
  slug: string
  published_at: string | null
  updated_at: string | null
}

type SitemapProfileRow = {
  username: string | null
  updated_at: string | null
}

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const baseUrl = "https://tyuta.net"

  // Published posts only (public content)
  const { data: postsData } = await supabase
    .from("posts")
    .select("slug,published_at,updated_at")
    .is("deleted_at", null)
    .not("published_at", "is", null)
    .order("published_at", { ascending: false })

  const posts = (postsData ?? []) as SitemapPostRow[]

  const postUrls: MetadataRoute.Sitemap = posts.map((p) => ({
    url: `${baseUrl}/post/${p.slug}`,
    lastModified: (p.published_at ?? p.updated_at) ?? undefined,
    changeFrequency: "weekly",
    priority: 0.8,
  }))

  // Public profiles only (users with username)
  const { data: profilesData } = await supabase
    .from("profiles")
    .select("username,updated_at")
    .not("username", "is", null)

  const profiles = (profilesData ?? []) as SitemapProfileRow[]

  const profileUrls: MetadataRoute.Sitemap = profiles
    .filter((p) => p.username && p.username.trim().length > 0)
    .map((p) => ({
      url: `${baseUrl}/u/${p.username}`,
      lastModified: p.updated_at ?? undefined,
      changeFrequency: "weekly",
      priority: 0.6,
    }))

  return [
    { url: baseUrl, lastModified: new Date(), changeFrequency: "daily", priority: 1 },
    { url: `${baseUrl}/about`, changeFrequency: "monthly", priority: 0.4 },
    { url: `${baseUrl}/terms`, changeFrequency: "yearly", priority: 0.2 },
    { url: `${baseUrl}/privacy`, changeFrequency: "yearly", priority: 0.2 },
    { url: `${baseUrl}/contact`, changeFrequency: "yearly", priority: 0.2 },
    ...postUrls,
    ...profileUrls,
  ]
}

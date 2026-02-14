import { MetadataRoute } from "next"
import { createClient } from "@supabase/supabase-js"

export const revalidate = 3600 // שעה
export const dynamic = "force-dynamic"
export const runtime = "nodejs"

type SitemapPostRow = {
  slug: string
  published_at: string | null
  updated_at: string | null
}

type ProfileRow = {
  username: string | null
  created_at: string | null
  personal_updated_at: string | null
}

type PostWithAuthorJoinRow = {
  slug: string
  published_at: string | null
  updated_at: string | null
  author: {
    username: string | null
    created_at: string | null
    personal_updated_at: string | null
  }[] | null
}

function pickLastModified(p: { published_at: string | null; updated_at: string | null }): string | undefined {
  return (p.published_at ?? p.updated_at) ?? undefined
}

function pickProfileLastModified(p: ProfileRow): string | undefined {
  return (p.personal_updated_at ?? p.created_at) ?? undefined
}

function firstAuthor(
  row: PostWithAuthorJoinRow,
): { username: string | null; created_at: string | null; personal_updated_at: string | null } | null {
  if (!row.author || row.author.length === 0) return null
  return row.author[0] ?? null
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const baseUrl = "https://tyuta.net"
  const nowIso = new Date().toISOString()

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  // Prefer service role for sitemap (bypasses RLS). Fallback to anon so posts sitemap still works.
  const key = serviceRole ?? anonKey
  if (!supabaseUrl || !key) {
    return [
      { url: baseUrl, lastModified: nowIso, changeFrequency: "daily", priority: 1 },
      { url: `${baseUrl}/about`, changeFrequency: "monthly", priority: 0.4 },
      { url: `${baseUrl}/terms`, changeFrequency: "yearly", priority: 0.2 },
      { url: `${baseUrl}/privacy`, changeFrequency: "yearly", priority: 0.2 },
      { url: `${baseUrl}/contact`, changeFrequency: "yearly", priority: 0.2 },
    ]
  }

  const supabase = createClient(supabaseUrl, key, { auth: { persistSession: false } })

  // 1) Posts (public)
  const { data: postsData, error: postsErr } = await supabase
    .from("posts")
    .select("slug,published_at,updated_at")
    .is("deleted_at", null)
    .not("published_at", "is", null)
    .order("published_at", { ascending: false })

  if (postsErr || !postsData) {
    return [
      { url: baseUrl, lastModified: nowIso, changeFrequency: "daily", priority: 1 },
      { url: `${baseUrl}/about`, changeFrequency: "monthly", priority: 0.4 },
      { url: `${baseUrl}/terms`, changeFrequency: "yearly", priority: 0.2 },
      { url: `${baseUrl}/privacy`, changeFrequency: "yearly", priority: 0.2 },
      { url: `${baseUrl}/contact`, changeFrequency: "yearly", priority: 0.2 },
    ]
  }

  const posts = postsData as SitemapPostRow[]

  const postUrls: MetadataRoute.Sitemap = posts
    .filter((p) => typeof p.slug === "string" && p.slug.trim().length > 0)
    .map((p) => ({
      url: `${baseUrl}/post/${p.slug}`,
      lastModified: pickLastModified(p),
      changeFrequency: "weekly",
      priority: 0.8,
    }))

  // 2) Profiles — direct select (should work under your RLS)
  let profileUrls: MetadataRoute.Sitemap = []
  const { data: profilesData, error: profilesErr } = await supabase
    .from("profiles")
    .select("username,created_at,personal_updated_at")
    .not("username", "is", null)

  if (!profilesErr && profilesData) {
    const profiles = profilesData as ProfileRow[]
    profileUrls = profiles
      .filter((p) => p.username && p.username.trim().length > 0)
      .map((p) => {
        const username = p.username!.trim()
        return {
          url: `${baseUrl}/u/${encodeURIComponent(username)}`,
          lastModified: pickProfileLastModified(p),
          changeFrequency: "weekly",
          priority: 0.6,
        }
      })
  } else {
    // 3) Fallback: derive usernames via join from posts (only authors with public posts)
    const { data: joinedData, error: joinedErr } = await supabase
      .from("posts")
      .select(
        `
          slug,
          published_at,
          updated_at,
          author:profiles!posts_author_id_fkey ( username, created_at, personal_updated_at )
        `,
      )
      .is("deleted_at", null)
      .not("published_at", "is", null)
      .order("published_at", { ascending: false })

    if (!joinedErr && joinedData) {
      const rows = joinedData as unknown as PostWithAuthorJoinRow[]
      const map = new Map<string, string | undefined>() // username -> lastModified

      for (const r of rows) {
        const a = firstAuthor(r)
        const username = a?.username?.trim() ?? ""
        if (!username) continue

        const postLm = pickLastModified({ published_at: r.published_at, updated_at: r.updated_at })
        const authorLm = a ? pickProfileLastModified(a) : undefined

        let lastModified: string | undefined = postLm ?? authorLm
        if (postLm && authorLm) {
          lastModified = new Date(postLm).getTime() > new Date(authorLm).getTime() ? postLm : authorLm
        }

        const prev = map.get(username)
        if (!prev) {
          map.set(username, lastModified)
          continue
        }
        if (lastModified && new Date(lastModified).getTime() > new Date(prev).getTime()) {
          map.set(username, lastModified)
        }
      }

      profileUrls = Array.from(map.entries()).map(([username, lastModified]) => ({
        url: `${baseUrl}/u/${encodeURIComponent(username)}`,
        lastModified,
        changeFrequency: "weekly",
        priority: 0.6,
      }))
    }
  }

  return [
    { url: baseUrl, lastModified: nowIso, changeFrequency: "daily", priority: 1 },
    { url: `${baseUrl}/about`, changeFrequency: "monthly", priority: 0.4 },
    { url: `${baseUrl}/terms`, changeFrequency: "yearly", priority: 0.2 },
    { url: `${baseUrl}/privacy`, changeFrequency: "yearly", priority: 0.2 },
    { url: `${baseUrl}/contact`, changeFrequency: "yearly", priority: 0.2 },
    ...postUrls,
    ...profileUrls,
  ]
}

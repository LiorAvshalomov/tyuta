import { MetadataRoute } from "next"
import { createClient } from "@supabase/supabase-js"
import { profileAvatarImageUrl } from "@/lib/avatarUrl"

export const revalidate = 3600 // שעה
export const runtime = "nodejs"

type SitemapPostRow = {
  slug: string
  cover_image_url: string | null
  published_at: string | null
  updated_at: string | null
}

type ProfileRow = {
  username: string | null
  display_name: string | null
  avatar_url: string | null
  created_at: string | null
  personal_updated_at: string | null
}

type PostAuthorJoinRow = {
  username: string | null
  display_name: string | null
  avatar_url: string | null
  created_at: string | null
  updated_at: string | null
}

type PostWithAuthorJoinRow = {
  slug: string
  published_at: string | null
  updated_at: string | null
  author: PostAuthorJoinRow[] | null
}

function pickLastModified(p: { published_at: string | null; updated_at: string | null }): string | undefined {
  // Return the later of the two timestamps so edited posts reflect their true last-modified date.
  const a = p.published_at
  const b = p.updated_at
  if (a && b) return a > b ? a : b
  return (a ?? b) ?? undefined
}

function pickProfileLastModified(p: {
  created_at: string | null
  personal_updated_at?: string | null
  updated_at?: string | null
}): string | undefined {
  return (p.personal_updated_at ?? p.updated_at ?? p.created_at) ?? undefined
}

function firstAuthor(row: PostWithAuthorJoinRow): PostAuthorJoinRow | null {
  if (!row.author || row.author.length === 0) return null
  return row.author[0] ?? null
}

function absUrl(baseUrl: string, pathOrUrl: string): string {
  if (pathOrUrl.startsWith("http")) return pathOrUrl
  if (!pathOrUrl.startsWith("/")) return `${baseUrl}/${pathOrUrl}`
  return `${baseUrl}${pathOrUrl}`
}

function imageUrl(baseUrl: string, pathOrUrl: string | null): string | undefined {
  const cleaned = pathOrUrl?.trim().split("?")[0]
  return cleaned ? absUrl(baseUrl, cleaned) : undefined
}

function dicebearSitemapInitialsUrl(seed: string): string {
  const normalized = seed.trim() || "משתמש"
  return `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(normalized)}`
}

function profileSitemapImageUrl(baseUrl: string, avatarUrl: string | null, seed: string): string {
  const safeAvatar = avatarUrl?.trim()
  if (!safeAvatar || safeAvatar.startsWith("https://api.dicebear.com/7.x/initials/svg")) {
    return dicebearSitemapInitialsUrl(seed)
  }

  return profileAvatarImageUrl(baseUrl, safeAvatar, seed, { stripQuery: true })
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
      { url: `${baseUrl}/c/release`, changeFrequency: "daily", priority: 0.9 },
      { url: `${baseUrl}/c/stories`, changeFrequency: "daily", priority: 0.9 },
      { url: `${baseUrl}/c/magazine`, changeFrequency: "daily", priority: 0.9 },
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
    .select("slug,cover_image_url,published_at,updated_at")
    .eq("status", "published")
    .is("deleted_at", null)
    .not("published_at", "is", null)
    .order("published_at", { ascending: false })

  if (postsErr || !postsData) {
    return [
      { url: baseUrl, lastModified: nowIso, changeFrequency: "daily", priority: 1 },
      { url: `${baseUrl}/c/release`, changeFrequency: "daily", priority: 0.9 },
      { url: `${baseUrl}/c/stories`, changeFrequency: "daily", priority: 0.9 },
      { url: `${baseUrl}/c/magazine`, changeFrequency: "daily", priority: 0.9 },
      { url: `${baseUrl}/about`, changeFrequency: "monthly", priority: 0.4 },
      { url: `${baseUrl}/terms`, changeFrequency: "yearly", priority: 0.2 },
      { url: `${baseUrl}/privacy`, changeFrequency: "yearly", priority: 0.2 },
      { url: `${baseUrl}/contact`, changeFrequency: "yearly", priority: 0.2 },
    ]
  }

  const posts = postsData as SitemapPostRow[]

  const postUrls: MetadataRoute.Sitemap = posts
    .filter((p) => typeof p.slug === "string" && p.slug.trim().length > 0)
    .map((p) => {
      const cover = imageUrl(baseUrl, p.cover_image_url)
      return {
        url: `${baseUrl}/post/${encodeURIComponent(p.slug)}`,
        lastModified: pickLastModified(p),
        changeFrequency: "weekly",
        priority: 0.8,
        ...(cover ? { images: [cover] } : {}),
      }
    })

  // 2) Profiles — direct select (should work under your RLS)
  let profileUrls: MetadataRoute.Sitemap = []
  const { data: profilesData, error: profilesErr } = await supabase
    .from("profiles_public")
    .select("username,display_name,avatar_url,created_at,personal_updated_at")
    .not("username", "is", null)

  if (!profilesErr && profilesData) {
    const profiles = profilesData as ProfileRow[]
    profileUrls = profiles
      .filter((p) => p.username && p.username.trim().length > 0)
      .map((p) => {
        const username = p.username!.trim()
        const seed = (p.display_name ?? "").trim() || username
        const avatar = profileSitemapImageUrl(baseUrl, p.avatar_url, seed)
        return {
          url: `${baseUrl}/u/${encodeURIComponent(username)}`,
          lastModified: pickProfileLastModified(p),
          changeFrequency: "weekly",
          priority: 0.6,
          images: [avatar],
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
          author:profiles!posts_author_id_fkey ( username, display_name, avatar_url, created_at, updated_at )
        `,
      )
      .is("deleted_at", null)
      .not("published_at", "is", null)
      .order("published_at", { ascending: false })

    if (!joinedErr && joinedData) {
      const rows = joinedData as unknown as PostWithAuthorJoinRow[]
      const map = new Map<string, { lastModified: string | undefined; avatar: string }>()

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

        const seed = (a?.display_name ?? "").trim() || username
        const avatar = profileSitemapImageUrl(baseUrl, a?.avatar_url ?? null, seed)
        const prev = map.get(username)
        if (!prev) {
          map.set(username, { lastModified, avatar })
          continue
        }
        if (
          lastModified &&
          (!prev.lastModified || new Date(lastModified).getTime() > new Date(prev.lastModified).getTime())
        ) {
          map.set(username, { lastModified, avatar: prev.avatar })
        }
      }

      profileUrls = Array.from(map.entries()).map(([username, data]) => ({
        url: `${baseUrl}/u/${encodeURIComponent(username)}`,
        lastModified: data.lastModified,
        changeFrequency: "weekly",
        priority: 0.6,
        images: [data.avatar],
      }))
    }
  }

  return [
    { url: baseUrl, lastModified: nowIso, changeFrequency: "daily", priority: 1 },
    { url: `${baseUrl}/c/release`, changeFrequency: "daily", priority: 0.9 },
    { url: `${baseUrl}/c/stories`, changeFrequency: "daily", priority: 0.9 },
    { url: `${baseUrl}/c/magazine`, changeFrequency: "daily", priority: 0.9 },
    { url: `${baseUrl}/about`, changeFrequency: "monthly", priority: 0.4 },
    { url: `${baseUrl}/terms`, changeFrequency: "yearly", priority: 0.2 },
    { url: `${baseUrl}/privacy`, changeFrequency: "yearly", priority: 0.2 },
    { url: `${baseUrl}/contact`, changeFrequency: "yearly", priority: 0.2 },
    ...postUrls,
    ...profileUrls,
  ]
}

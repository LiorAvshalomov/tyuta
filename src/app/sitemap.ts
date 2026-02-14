import { MetadataRoute } from "next"
import { createClient } from "@supabase/supabase-js"

export const revalidate = 3600 // שעה

type PostWithAuthorRow = {
  slug: string | null
  published_at: string | null
  updated_at: string | null
  // Supabase returns relations sometimes as arrays depending on schema introspection.
  // We model it as an array and take the first element.
  author: { username: string | null; updated_at: string | null }[] | null
}

function pickLastModified(p: { published_at: string | null; updated_at: string | null }): string | undefined {
  return (p.published_at ?? p.updated_at) ?? undefined
}

function getAuthor(row: PostWithAuthorRow): { username: string | null; updated_at: string | null } | null {
  if (!row.author || row.author.length === 0) return null
  return row.author[0] ?? null
}

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const baseUrl = "https://tyuta.net"
  const nowIso = new Date().toISOString()

  // אם אין Service Role בפרודקשן – נחזיר sitemap בסיסי כדי לא להפיל את הדף
  if (!supabaseUrl || !serviceRole) {
    return [
      { url: baseUrl, lastModified: nowIso, changeFrequency: "daily", priority: 1 },
      { url: `${baseUrl}/about`, changeFrequency: "monthly", priority: 0.4 },
      { url: `${baseUrl}/terms`, changeFrequency: "yearly", priority: 0.2 },
      { url: `${baseUrl}/privacy`, changeFrequency: "yearly", priority: 0.2 },
      { url: `${baseUrl}/contact`, changeFrequency: "yearly", priority: 0.2 },
    ]
  }

  const admin = createClient(supabaseUrl, serviceRole, { auth: { persistSession: false } })

  // פוסטים פומביים + join ל-author (profiles) כדי להוציא usernames בלי לשאול profiles בנפרד
  const { data, error } = await admin
    .from("posts")
    .select(
      `
        slug,
        published_at,
        updated_at,
        author:profiles!posts_author_id_fkey ( username, updated_at )
      `
    )
    .is("deleted_at", null)
    .eq("status", "published")
    .order("published_at", { ascending: false })

  if (error || !data) {
    return [{ url: baseUrl, lastModified: nowIso, changeFrequency: "daily", priority: 1 }]
  }

  const rows = data as unknown as PostWithAuthorRow[]

  // Posts in sitemap
  const postUrls: MetadataRoute.Sitemap = rows
    .filter((r) => typeof r.slug === "string" && r.slug.trim().length > 0)
    .map((r) => ({
      url: `${baseUrl}/post/${r.slug}`,
      lastModified: pickLastModified({ published_at: r.published_at, updated_at: r.updated_at }),
      changeFrequency: "weekly",
      priority: 0.8,
    }))

  // Profiles from posts authors (dedupe)
  const profileMap = new Map<string, string | undefined>() // username -> lastModified

  for (const r of rows) {
    const author = getAuthor(r)
    const username = author?.username?.trim() ?? ""
    if (!username) continue

    const postLm = pickLastModified({ published_at: r.published_at, updated_at: r.updated_at })
    const authorLm = author?.updated_at ?? undefined

    let lastModified: string | undefined = postLm ?? authorLm
    if (postLm && authorLm) {
      lastModified = new Date(postLm).getTime() > new Date(authorLm).getTime() ? postLm : authorLm
    }

    const prev = profileMap.get(username)
    if (!prev) {
      profileMap.set(username, lastModified)
      continue
    }
    if (lastModified && new Date(lastModified).getTime() > new Date(prev).getTime()) {
      profileMap.set(username, lastModified)
    }
  }

  const profileUrls: MetadataRoute.Sitemap = Array.from(profileMap.entries()).map(([username, lastModified]) => ({
    url: `${baseUrl}/u/${encodeURIComponent(username)}`,
    lastModified,
    changeFrequency: "weekly",
    priority: 0.6,
  }))

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

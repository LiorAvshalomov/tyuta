import { createClient } from "@supabase/supabase-js"
import PostClient from "./PostClient"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

const SITE_URL = "https://tyuta.net"

type PageProps = {
  params: Promise<{ slug: string }>
}

type PostSeoRow = {
  author_id: string
  title: string | null
  excerpt: string | null
  cover_image_url: string | null
  published_at: string | null
  updated_at: string | null
  author: { username: string | null; display_name: string | null }[] | null
}

type ProfileRow = {
  username: string | null
  display_name: string | null
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

function pickAuthor(
  joined: { username: string | null; display_name: string | null }[] | null,
): { username: string | null; display_name: string | null } | null {
  if (!joined || joined.length === 0) return null
  return joined[0] ?? null
}

export default async function PostPage({ params }: PageProps) {
  const { slug } = await params

  const canonical = `${SITE_URL}/post/${encodeURIComponent(slug)}`
  const supabase = getServerSupabase()

  // Always render the client page; JSON-LD is best-effort
  if (!supabase) return <PostClient />

  const { data } = await supabase
    .from("posts")
    .select(
      `
        author_id,
        title,
        excerpt,
        cover_image_url,
        published_at,
        updated_at,
        author:profiles!posts_author_id_fkey ( username, display_name )
      `,
    )
    .eq("slug", slug)
    .eq("status", "published")
    .is("deleted_at", null)
    .maybeSingle<PostSeoRow>()

  if (!data) return <PostClient />

  const headline = (data.title ?? "").trim() || "Tyuta"
  const description = ((data.excerpt ?? "").trim() || "המקום לכל הגרסאות שלך").slice(0, 200)
  const image = data.cover_image_url ? absUrl(data.cover_image_url) : absUrl("/apple-touch-icon.png")
  const datePublished = data.published_at ? new Date(data.published_at).toISOString() : undefined
  const dateModified = (data.updated_at ?? data.published_at)
    ? new Date((data.updated_at ?? data.published_at)!).toISOString()
    : undefined

  // Prefer display_name from joined relation; fallback to a direct profiles fetch by author_id
  let authorName = ""
  let authorUsername: string | null = null

  const joinedAuthor = pickAuthor(data.author)
  authorName = (joinedAuthor?.display_name ?? "").trim()
  authorUsername = joinedAuthor?.username ?? null

  if (!authorName) {
    const { data: prof } = await supabase
      .from("profiles")
      .select("username,display_name")
      .eq("id", data.author_id)
      .maybeSingle<ProfileRow>()

    authorName = (prof?.display_name ?? "").trim()
    authorUsername = prof?.username ?? authorUsername
  }

  if (!authorName) {
    authorName = (authorUsername ?? "").trim() || "Tyuta"
  }

  const authorUrl = authorUsername ? `${SITE_URL}/u/${encodeURIComponent(authorUsername)}` : undefined

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Article",
    mainEntityOfPage: { "@type": "WebPage", "@id": canonical },
    headline,
    description,
    image: [image],
    datePublished,
    dateModified,
    author: authorUrl
      ? { "@type": "Person", name: authorName, url: authorUrl }
      : { "@type": "Person", name: authorName },
    publisher: {
      "@type": "Organization",
      name: "Tyuta",
      url: SITE_URL,
      logo: { "@type": "ImageObject", url: absUrl("/apple-touch-icon.png") },
    },
  }

  return (
    <>
      <script
        type="application/ld+json"
        // eslint-disable-next-line react/no-danger
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <PostClient />
    </>
  )
}

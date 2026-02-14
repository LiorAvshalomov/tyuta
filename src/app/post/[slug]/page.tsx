import PostClient from "./PostClient"
import { createClient } from "@supabase/supabase-js"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const SITE_URL = "https://tyuta.net"

type PageProps = {
  params: Promise<{ slug: string }>
}

type AuthorRow = {
  username: string | null
  display_name: string | null
}

type PostSeoRow = {
  slug: string
  title: string | null
  excerpt: string | null
  cover_image_url: string | null
  published_at: string | null
  updated_at: string | null
  created_at: string
  is_anonymous: boolean | null
  author: AuthorRow[] | AuthorRow | null
}

function absUrl(pathOrUrl: string): string {
  if (pathOrUrl.startsWith("http")) return pathOrUrl
  if (!pathOrUrl.startsWith("/")) return `${SITE_URL}/${pathOrUrl}`
  return `${SITE_URL}${pathOrUrl}`
}

function pickAuthor(a: AuthorRow[] | AuthorRow | null | undefined): AuthorRow | null {
  if (!a) return null
  return Array.isArray(a) ? (a[0] ?? null) : a
}

function safeText(v: string | null | undefined): string {
  return (v ?? "").trim()
}

function getServerSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !key) return null
  return createClient(url, key, { auth: { persistSession: false } })
}

export default async function PostPage({ params }: PageProps) {
  const { slug } = await params

  const supabase = getServerSupabase()
  const canonical = `${SITE_URL}/post/${encodeURIComponent(slug)}`

  let jsonLd: Record<string, unknown> | null = null

  if (supabase) {
    const { data } = await supabase
      .from("posts")
      .select(
        "slug,title,excerpt,cover_image_url,published_at,updated_at,created_at,is_anonymous,author:profiles(username,display_name)"
      )
      .eq("slug", slug)
      .eq("status", "published")
      .is("deleted_at", null)
      .maybeSingle<PostSeoRow>()

    if (data && data.published_at) {
      const title = safeText(data.title) || "Tyuta"
      const description = (safeText(data.excerpt) || "המקום לכל הגרסאות שלך").slice(0, 200)
      const image = data.cover_image_url ? absUrl(data.cover_image_url) : absUrl("/apple-touch-icon.png")

      const a = pickAuthor(data.author)
      const authorName = safeText(a?.display_name) || safeText(a?.username) || "Tyuta"
      const authorUsername = safeText(a?.username)

      const datePublished = data.published_at
      const dateModified = data.updated_at ?? data.published_at ?? data.created_at

      jsonLd = {
        "@context": "https://schema.org",
        "@type": "Article",
        mainEntityOfPage: {
          "@type": "WebPage",
          "@id": canonical,
        },
        headline: title,
        description,
        image: [image],
        datePublished,
        dateModified,
        inLanguage: "he-IL",
        author: authorUsername
          ? {
              "@type": "Person",
              name: authorName,
              url: `${SITE_URL}/u/${encodeURIComponent(authorUsername)}`,
            }
          : {
              "@type": "Person",
              name: authorName,
            },
        publisher: {
          "@type": "Organization",
          name: "Tyuta",
          url: SITE_URL,
          logo: {
            "@type": "ImageObject",
            url: absUrl("/apple-touch-icon.png"),
          },
        },
      }
    }
  }

  return (
    <>
      {jsonLd ? (
        <script
          type="application/ld+json"
          // eslint-disable-next-line react/no-danger
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
      ) : null}
      <PostClient />
    </>
  )
}

import type { Metadata } from "next"
import { cache } from "react"
import { createClient } from "@supabase/supabase-js"
import { redirect } from "next/navigation"
import PostClient from "./PostClient"

export const revalidate = 60
export const runtime = "nodejs"

const SITE_URL = "https://tyuta.net"

/**
 * Safely serialize JSON for embedding in a <script> tag.
 * Prevents </script> breakout by escaping < to \u003c.
 */
function safeJsonLdStringify(data: unknown): string {
  return JSON.stringify(data).replace(/</g, "\\u003c")
}

type PageProps = {
  params: Promise<{ slug: string }>
}

// Full post data returned to the client as SSR initial state (avoids a first client-side DB round-trip)
export type PostInitialData = {
  id: string
  slug: string
  title: string | null
  excerpt: string | null
  cover_image_url: string | null
  status: string | null
  published_at: string | null
  updated_at: string | null
  content_json: unknown
  created_at: string
  author_id: string
  channel_id: number | null
  subcategory_tag_id: number | null
  channel: { name_he: string | null; slug: string | null }[] | null
  author: { id: string; username: string | null; display_name: string | null; avatar_url: string | null }[] | null
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

/**
 * Cached per-request post fetch — shared between generateMetadata and PostPage
 * so the DB is queried only once per request, not twice.
 */
const fetchPost = cache(async (slug: string): Promise<PostInitialData | null> => {
  const supabase = getServerSupabase()
  if (!supabase) return null
  const { data } = await supabase
    .from("posts")
    .select(
      `
        id,
        slug,
        title,
        excerpt,
        cover_image_url,
        status,
        published_at,
        updated_at,
        content_json,
        created_at,
        author_id,
        channel_id,
        subcategory_tag_id,
        channel:channels ( name_he, slug ),
        author:profiles!posts_author_id_fkey ( id, username, display_name, avatar_url )
      `,
    )
    .eq("slug", slug)
    .eq("status", "published")
    .is("deleted_at", null)
    .maybeSingle<PostInitialData>()
  return data ?? null
})

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const slug = decodeURIComponent((await params).slug)
  const data = await fetchPost(slug)
  if (!data) return { title: "Tyuta", robots: { index: false, follow: false } }

  const title = (data.title ?? "").trim() || "Tyuta"
  const description = ((data.excerpt ?? "").trim() || "Tyuta(טיוטה): המקום לכל הגרסאות שלך. מרחב כתיבה שיתופי לקהילת הכותבים בישראל – מהמחשבה הראשונה ועד ליצירה הסופית.").slice(0, 200)
  // Strip ?v=timestamp cache-busting params from the cover URL.
  // Facebook/WhatsApp OG scrapers sometimes fail to fetch images whose URLs contain
  // non-standard query strings. The Supabase storage URL without ?v= is still valid.
  const rawCoverUrl = data.cover_image_url ? data.cover_image_url.split('?')[0] : null
  // Fallback: web-app-manifest-512x512.png (512×512) rather than apple-touch-icon.png (180×180).
  // Facebook requires ≥200×200; WhatsApp requires ≥300×300. 180px silently drops the image.
  const imageUrl = rawCoverUrl ? absUrl(rawCoverUrl) : absUrl("/web-app-manifest-512x512.png")
  // Use data.slug (DB canonical) not URL param slug — ensures redirect targets also get correct canonical
  const canonical = `${SITE_URL}/post/${encodeURIComponent(data.slug)}`
  const author = pickAuthor(data.author as { username: string | null; display_name: string | null }[] | null)

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
      images: rawCoverUrl
        ? [{ url: imageUrl, alt: title, width: 1200, height: 630 }]
        : [{ url: imageUrl, alt: title, width: 512, height: 512 }],
      ...(data.published_at ? { publishedTime: new Date(data.published_at).toISOString() } : {}),
      ...(data.updated_at ? { modifiedTime: new Date(data.updated_at).toISOString() } : {}),
      ...(author?.username ? { authors: [`${SITE_URL}/u/${encodeURIComponent(author.username)}`] } : {}),
    },
    twitter: {
      card: data.cover_image_url ? "summary_large_image" : "summary",
      title,
      description,
      images: [imageUrl],
    },
  }
}

export default async function PostPage({ params }: PageProps) {
  const rawSlug = (await params).slug
  const slug = decodeURIComponent(rawSlug)

  const supabase = getServerSupabase()

  // Always render the client page; JSON-LD is best-effort
  if (!supabase) return <PostClient />

  const data = await fetchPost(slug)

  if (!data) {
    // Check slug_redirects for any old/broken slug (UUID-based, RTL-reversed, or other variants).
    // This handles Facebook RTL-flipped slugs and pre-migration UUID slugs alike.
    const { data: slugRedirect } = await supabase
      .from("slug_redirects")
      .select("new_slug")
      .eq("old_slug", slug)
      .maybeSingle<{ new_slug: string }>()
    if (slugRedirect?.new_slug) {
      redirect(`/post/${encodeURIComponent(slugRedirect.new_slug)}`)
    }

    // Legacy fallback: slug looks like a UUID — try matching against the post id column
    // (covers any future deep-links that use the DB id directly).
    const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    if (UUID_RE.test(slug)) {
      const { data: byId } = await supabase
        .from("posts")
        .select("slug")
        .eq("id", slug)
        .eq("status", "published")
        .is("deleted_at", null)
        .maybeSingle<{ slug: string }>()
      if (byId?.slug && byId.slug !== slug) {
        redirect(`/post/${encodeURIComponent(byId.slug)}`)
      }
    }
    return <PostClient />
  }

  const canonical = `${SITE_URL}/post/${encodeURIComponent(data.slug)}`
  const headline = (data.title ?? "").trim() || "Tyuta"
  const description = ((data.excerpt ?? "").trim() || "Tyuta(טיוטה): המקום לכל הגרסאות שלך. מרחב כתיבה שיתופי לקהילת הכותבים בישראל – מהמחשבה הראשונה ועד ליצירה הסופית.").slice(0, 200)
  const image = data.cover_image_url ? absUrl(data.cover_image_url) : absUrl("/apple-touch-icon.png")
  const datePublished = data.published_at ? new Date(data.published_at).toISOString() : undefined
  const dateModified = (data.updated_at ?? data.published_at)
    ? new Date((data.updated_at ?? data.published_at)!).toISOString()
    : undefined

  // Prefer display_name from joined relation; fallback to a direct profiles fetch by author_id
  let authorName = ""
  let authorUsername: string | null = null

  const joinedAuthor = pickAuthor(data.author as { username: string | null; display_name: string | null }[] | null)
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
        dangerouslySetInnerHTML={{ __html: safeJsonLdStringify(jsonLd) }}
      />
      <PostClient initialData={data} />
    </>
  )
}

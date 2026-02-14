import type { Metadata } from "next"
import { createClient } from "@supabase/supabase-js"

import PostClient from "./PostClient"

const SITE_URL = "https://tyuta.net"

type Author = {
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
  author: Author[] | Author | null
}

function pickAuthor(a: Author[] | Author | null | undefined): Author | null {
  if (!a) return null
  return Array.isArray(a) ? (a[0] ?? null) : a
}

function trunc(s: string, n: number) {
  const v = (s ?? "").trim()
  return v.length > n ? `${v.slice(0, n - 1)}…` : v
}

function jsonLd(data: unknown) {
  return JSON.stringify(data)
}

async function fetchPostSeo(slug: string): Promise<PostSeoRow | null> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!supabaseUrl || !anonKey) return null

  const supabase = createClient(supabaseUrl, anonKey, { auth: { persistSession: false } })

  const { data, error } = await supabase
    .from("posts")
    .select(
      `
        slug,
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
    .maybeSingle()

  if (error || !data) return null
  return data as unknown as PostSeoRow
}

export async function generateMetadata({ params }: { params: { slug: string } }): Promise<Metadata> {
  const slug = params.slug
  const post = await fetchPostSeo(slug)

  const canonical = `${SITE_URL}/post/${encodeURIComponent(slug)}`

  if (!post) {
    return {
      title: "פוסט לא נמצא",
      alternates: { canonical },
      robots: { index: false, follow: false },
    }
  }

  const title = (post.title ?? "ללא כותרת").trim()
  const description = trunc(post.excerpt ?? "", 160) || "פוסט ב‑Tyuta"
  const imageUrl = post.cover_image_url ? post.cover_image_url : `${SITE_URL}/apple-touch-icon.png`

  return {
    title,
    description,
    alternates: { canonical },
    openGraph: {
      type: "article",
      url: canonical,
      title,
      description,
      locale: "he_IL",
      images: [{ url: imageUrl }],
      publishedTime: post.published_at ?? undefined,
      modifiedTime: post.updated_at ?? undefined,
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [imageUrl],
    },
  }
}

export default async function PostPageServer({ params }: { params: { slug: string } }) {
  const post = await fetchPostSeo(params.slug)

  const canonical = `${SITE_URL}/post/${encodeURIComponent(params.slug)}`

  // Article JSON-LD (only when we have data)
  const author = post ? pickAuthor(post.author) : null
  const authorName = author?.display_name?.trim() || author?.username?.trim() || "אנונימי"
  const headline = (post?.title ?? "ללא כותרת").trim()
  const description = trunc(post?.excerpt ?? "", 200) || "פוסט ב‑Tyuta"
  const imageUrl = post?.cover_image_url ? post.cover_image_url : `${SITE_URL}/apple-touch-icon.png`

  const articleSchema = post
    ? {
        "@context": "https://schema.org",
        "@type": "Article",
        mainEntityOfPage: {
          "@type": "WebPage",
          "@id": canonical,
        },
        headline,
        description,
        image: [imageUrl],
        datePublished: post.published_at ?? undefined,
        dateModified: post.updated_at ?? post.published_at ?? undefined,
        author: {
          "@type": "Person",
          name: authorName,
        },
        publisher: {
          "@type": "Organization",
          name: "Tyuta",
          logo: {
            "@type": "ImageObject",
            url: `${SITE_URL}/apple-touch-icon.png`,
          },
        },
      }
    : null

  return (
    <>
      {articleSchema ? (
        <script
          type="application/ld+json"
          // eslint-disable-next-line react/no-danger
          dangerouslySetInnerHTML={{ __html: jsonLd(articleSchema) }}
        />
      ) : null}
      <PostClient />
    </>
  )
}

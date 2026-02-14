import type { Metadata } from 'next'
import type { ReactNode } from 'react'

import { supabase } from '@/lib/supabaseClient'

const SITE_URL = 'https://tyuta.net'

type LayoutProps = {
  children: ReactNode
  params: { slug: string }
}

type PostSeoRow = {
  slug: string
  title: string | null
  excerpt: string | null
  cover_image_url: string | null
  published_at: string | null
  updated_at: string | null
  created_at: string | null
  author: { username: string | null; display_name: string | null }[] | { username: string | null; display_name: string | null } | null
}

function pickAuthor(
  a: PostSeoRow['author']
): { username: string | null; display_name: string | null } | null {
  if (!a) return null
  return Array.isArray(a) ? (a[0] ?? null) : a
}

function JsonLd({ data }: { data: unknown }) {
  return (
    <script
      type="application/ld+json"
      // eslint-disable-next-line react/no-danger
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data) }}
    />
  )
}

export async function generateMetadata({ params }: LayoutProps): Promise<Metadata> {
  const slug = params?.slug
  const canonical = `${SITE_URL}/post/${encodeURIComponent(slug)}`

  // Fetch minimal SEO fields for published, non-deleted posts
  const { data, error } = await supabase
    .from('posts')
    .select(
      'slug, title, excerpt, cover_image_url, published_at, updated_at, created_at, author:profiles!posts_author_id_fkey(username, display_name)'
    )
    .eq('slug', slug)
    .eq('status', 'published')
    .is('deleted_at', null)
    .maybeSingle()

  if (error || !data) {
    return {
      title: 'פוסט לא נמצא',
      robots: { index: false, follow: false },
      alternates: { canonical },
      openGraph: { type: 'website', url: canonical },
    }
  }

  const post = data as PostSeoRow
  const author = pickAuthor(post.author)
  const title = (post.title ?? '').trim() || 'ללא כותרת'
  const description = (post.excerpt ?? '').trim() || 'פוסט ב-Tyuta'

  const imageUrl = post.cover_image_url
    ? post.cover_image_url
    : `${SITE_URL}/apple-touch-icon.png`

  return {
    title,
    description,
    alternates: { canonical },
    openGraph: {
      type: 'article',
      url: canonical,
      title,
      description,
      siteName: 'Tyuta',
      locale: 'he_IL',
      images: [{ url: imageUrl }],
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: [imageUrl],
    },
    authors: author?.display_name ? [{ name: author.display_name }] : undefined,
  }
}

export default async function PostLayout({ children, params }: LayoutProps) {
  const slug = params.slug
  const canonical = `${SITE_URL}/post/${encodeURIComponent(slug)}`

  // Article JSON-LD (best-effort). This does NOT gate rendering.
  const { data } = await supabase
    .from('posts')
    .select(
      'slug, title, excerpt, cover_image_url, published_at, updated_at, created_at, author:profiles!posts_author_id_fkey(username, display_name)'
    )
    .eq('slug', slug)
    .eq('status', 'published')
    .is('deleted_at', null)
    .maybeSingle()

  const post = (data ?? null) as PostSeoRow | null
  const author = post ? pickAuthor(post.author) : null

  const jsonLd =
    post
      ? {
          '@context': 'https://schema.org',
          '@type': 'Article',
          headline: (post.title ?? '').trim() || 'ללא כותרת',
          description: (post.excerpt ?? '').trim() || undefined,
          mainEntityOfPage: canonical,
          url: canonical,
          datePublished: post.published_at ?? post.created_at ?? undefined,
          dateModified: post.updated_at ?? undefined,
          image: post.cover_image_url ? [post.cover_image_url] : undefined,
          author: author
            ? {
                '@type': 'Person',
                name: (author.display_name ?? author.username ?? '').trim() || 'אנונימי',
                url: author.username ? `${SITE_URL}/u/${author.username}` : undefined,
              }
            : undefined,
          publisher: {
            '@type': 'Organization',
            name: 'Tyuta',
            url: SITE_URL,
            logo: {
              '@type': 'ImageObject',
              url: `${SITE_URL}/apple-touch-icon.png`,
            },
          },
        }
      : null

  return (
    <>
      {jsonLd ? <JsonLd data={jsonLd} /> : null}
      {children}
    </>
  )
}

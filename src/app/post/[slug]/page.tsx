import type { Metadata } from "next"
import { cache } from "react"
import { createClient } from "@supabase/supabase-js"
import { redirect } from "next/navigation"
import PostClient from "./PostClient"
import PostVersionSeed from "@/components/PostVersionSeed"
import { pickLatestVersion } from "@/lib/freshness/serverVersions"

export const runtime = "nodejs"
export const dynamicParams = true
export const revalidate = 300 // 5 minutes; revalidatePath clears it immediately on publish/edit/delete

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
  author: { id: string; username: string | null; display_name: string | null; avatar_url: string | null; updated_at: string | null }[] | null
}

export type PostSsrExtras = {
  subcategoryName: string | null
  postTags: string[]
  moreFromAuthor: Array<{
    id: string
    slug: string
    title: string | null
    excerpt: string | null
    cover_image_url: string | null
    published_at: string | null
    created_at: string
    author_id: string
    author: Array<{ id: string; username: string | null; display_name: string | null; avatar_url: string | null; updated_at: string | null }> | null
  }>
  hotInChannel: Array<{
    id: string
    slug: string
    title: string | null
    excerpt: string | null
    cover_image_url: string | null
    published_at: string | null
    created_at: string
    author_id: string
    author: Array<{ id: string; username: string | null; display_name: string | null; avatar_url: string | null; updated_at: string | null }> | null
  }>
}

type ProfileRow = {
  username: string | null
  display_name: string | null
  updated_at?: string | null
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

function pickAuthor<T extends { username: string | null; display_name: string | null }>(
  joined: T[] | null,
): T | null {
  if (!joined || joined.length === 0) return null
  return joined[0] ?? null
}

function uniqById<T extends { id: string }>(items: T[]) {
  const seen = new Set<string>()
  const unique: T[] = []

  for (const item of items) {
    if (!item?.id || seen.has(item.id)) continue
    seen.add(item.id)
    unique.push(item)
  }

  return unique
}

async function loadPostSsrExtras(
  supabase: NonNullable<ReturnType<typeof getServerSupabase>>,
  post: PostInitialData,
): Promise<PostSsrExtras> {
  const sidebarPostSelect = `
    id,
    slug,
    title,
    excerpt,
    cover_image_url,
    published_at,
    created_at,
    author_id,
    author:profiles!posts_author_id_fkey ( id, username, display_name, avatar_url, updated_at )
  `

  const [subcategoryRes, postTagsRes, authorRes, hotRes] = await Promise.all([
    post.subcategory_tag_id
      ? supabase.from('tags').select('name_he').eq('id', post.subcategory_tag_id).maybeSingle()
      : Promise.resolve({ data: null }),
    supabase.from('post_tags').select('tag_id').eq('post_id', post.id),
    supabase
      .from('posts')
      .select(sidebarPostSelect)
      .is('deleted_at', null)
      .eq('status', 'published')
      .eq('author_id', post.author_id)
      .neq('id', post.id)
      .order('published_at', { ascending: false, nullsFirst: false })
      .limit(5),
    post.channel_id
      ? supabase.rpc('pendemic_hot_posts_smart_by_channel', {
          p_channel_id: post.channel_id,
          p_ref_ts: new Date().toISOString(),
          p_limit: 12,
        })
      : Promise.resolve({ data: [] as Array<{ post_id: string }> }),
  ])

  const postTagIds = (postTagsRes.data ?? [])
    .map((row) => (row as { tag_id: number }).tag_id)
    .filter(Boolean)

  const tagsRes = postTagIds.length > 0
    ? await supabase.from('tags').select('name_he').in('id', postTagIds)
    : { data: [] as Array<{ name_he: string | null }> }

  const moreFromAuthor = uniqById((authorRes.data ?? []) as PostSsrExtras['moreFromAuthor'])
  const authorPostIds = new Set(moreFromAuthor.map((item) => item.id))

  const hotIds = ((hotRes.data ?? []) as Array<{ post_id: string }>)
    .map((row) => row.post_id)
    .filter((id) => id !== post.id && !authorPostIds.has(id))
    .slice(0, 5)

  let hotInChannel: PostSsrExtras['hotInChannel'] = []
  if (hotIds.length > 0) {
    const { data: hotPosts } = await supabase
      .from('posts')
      .select(sidebarPostSelect)
      .in('id', hotIds)
      .is('deleted_at', null)
      .eq('status', 'published')

    const hotById = new Map(((hotPosts ?? []) as PostSsrExtras['hotInChannel']).map((item) => [item.id, item]))
    hotInChannel = hotIds
      .map((id) => hotById.get(id))
      .filter((item): item is PostSsrExtras['hotInChannel'][number] => Boolean(item))
  }

  return {
    subcategoryName: subcategoryRes.data?.name_he ?? null,
    postTags: ((tagsRes.data ?? []) as Array<{ name_he: string | null }>)
      .map((tag) => tag.name_he)
      .filter((tag): tag is string => Boolean(tag)),
    moreFromAuthor,
    hotInChannel,
  }
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
        author:profiles!posts_author_id_fkey ( id, username, display_name, avatar_url, updated_at )
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
  const rawCoverUrl = data.cover_image_url ? data.cover_image_url.split('?')[0] : null
  const imageUrl = rawCoverUrl ? absUrl(rawCoverUrl) : absUrl("/web-app-manifest-512x512.png")
  const datePublished = data.published_at ? new Date(data.published_at).toISOString() : undefined
  const dateModified = (data.updated_at ?? data.published_at)
    ? new Date((data.updated_at ?? data.published_at)!).toISOString()
    : undefined

  // Prefer display_name from joined relation; fallback to a direct profiles fetch by author_id
  let authorName = ""
  let authorUsername: string | null = null
  let authorUpdatedAt: string | null = null

  const joinedAuthor = pickAuthor(
    data.author as { username: string | null; display_name: string | null; updated_at?: string | null }[] | null,
  )
  authorName = (joinedAuthor?.display_name ?? "").trim()
  authorUsername = joinedAuthor?.username ?? null
  authorUpdatedAt = joinedAuthor?.updated_at ?? null

  // Run all remaining queries in a single parallel batch:
  // - optional author profile fallback (when joined author has no display_name)
  // - post extras (related posts, comments, etc.)
  // - version-seed queries (latest author/channel/global timestamps)
  const [
    profFallback,
    initialExtras,
    latestAuthorPostRes,
    latestChannelPostRes,
    latestGlobalProfileRes,
  ] = await Promise.all([
    !authorName
      ? supabase
          .from("profiles")
          .select("username,display_name,updated_at")
          .eq("id", data.author_id)
          .maybeSingle<ProfileRow>()
      : Promise.resolve({ data: null }),
    loadPostSsrExtras(supabase, data),
    supabase
      .from('posts')
      .select('updated_at, published_at, created_at')
      .eq('author_id', data.author_id)
      .eq('status', 'published')
      .is('deleted_at', null)
      .order('updated_at', { ascending: false, nullsFirst: false })
      .order('published_at', { ascending: false, nullsFirst: false })
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle<{ updated_at: string | null; published_at: string | null; created_at: string }>(),
    data.channel_id != null
      ? supabase
          .from('posts')
          .select('updated_at, published_at, created_at')
          .eq('channel_id', data.channel_id)
          .eq('status', 'published')
          .is('deleted_at', null)
          .order('updated_at', { ascending: false, nullsFirst: false })
          .order('published_at', { ascending: false, nullsFirst: false })
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle<{ updated_at: string | null; published_at: string | null; created_at: string }>()
      : Promise.resolve({ data: null }),
    supabase
      .from('profiles')
      .select('updated_at')
      .order('updated_at', { ascending: false, nullsFirst: false })
      .limit(1)
      .maybeSingle<{ updated_at: string | null }>(),
  ])

  if (profFallback.data) {
    const prof = profFallback.data
    authorName = (prof.display_name ?? "").trim()
    authorUsername = prof.username ?? authorUsername
    authorUpdatedAt = prof.updated_at ?? authorUpdatedAt
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
    image: rawCoverUrl
      ? [{ "@type": "ImageObject", url: imageUrl, width: 1200, height: 630 }]
      : [{ "@type": "ImageObject", url: imageUrl, width: 512, height: 512 }],
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

  const initialPostVersion = pickLatestVersion(
    data.updated_at,
    data.published_at,
    data.created_at,
    authorUpdatedAt,
    latestAuthorPostRes.data?.updated_at ?? null,
    latestAuthorPostRes.data?.published_at ?? null,
    latestAuthorPostRes.data?.created_at ?? null,
    latestChannelPostRes.data?.updated_at ?? null,
    latestChannelPostRes.data?.published_at ?? null,
    latestChannelPostRes.data?.created_at ?? null,
    latestGlobalProfileRes.data?.updated_at ?? null,
  )

  return (
    <>
      {rawCoverUrl && (
        <link rel="preload" as="image" href={imageUrl} />
      )}
      <PostVersionSeed pathname={`/post/${data.slug}`} version={initialPostVersion} />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: safeJsonLdStringify(jsonLd) }}
      />
      <PostClient initialData={data} initialExtras={initialExtras} />
    </>
  )
}

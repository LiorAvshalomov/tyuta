import { MetadataRoute } from "next"
import { createClient } from "@supabase/supabase-js"

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY! // רק ב-server
)

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
   const baseUrl = "https://tyuta.net"

  // שליפת פוסטים פומביים
  const { data: posts } = await supabase
    .from("posts")
    .select("slug, published_at")
    .eq("is_published", true)

  const postUrls =
    posts?.map((post) => ({
      url: `${baseUrl}/p/${post.slug}`,
      lastModified: post.published_at ?? undefined,
      changeFrequency: "weekly" as const,
      priority: 0.8,
    })) ?? []

  return [
    {
      url: baseUrl,
      lastModified: new Date(),
      changeFrequency: "daily",
      priority: 1,
    },
    {
      url: `${baseUrl}/about`,
      changeFrequency: "monthly",
      priority: 0.5,
    },
    {
      url: `${baseUrl}/terms`,
      changeFrequency: "yearly",
      priority: 0.3,
    },
    {
      url: `${baseUrl}/privacy`,
      changeFrequency: "yearly",
      priority: 0.3,
    },
    ...postUrls,
  ]
}

import { MetadataRoute } from "next"

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: [
          "/api/",     // API routes — never index
          "/admin/",   // Admin panel
          "/auth/",    // Auth callbacks (reset-password, OAuth)
        ],
      },
    ],
    sitemap: "https://tyuta.net/sitemap.xml",
  }
}

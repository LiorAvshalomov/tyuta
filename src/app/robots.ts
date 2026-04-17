import { MetadataRoute } from "next"

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: [
          "/api/",           // API routes — never index
          "/admin/",         // Admin panel
          "/auth/",          // Auth callbacks (reset-password, OAuth)
          "/write",
          "/write/",
          "/inbox",
          "/inbox/",
          "/notebook",
          "/notebook/",
          "/notes",
          "/notes/",
          "/notifications",
          "/notifications/",
          "/saved",
          "/saved/",
          "/settings",
          "/settings/",
          "/trash",
          "/trash/",
          "/banned",
          "/restricted",
        ],
      },
    ],
    sitemap: "https://tyuta.net/sitemap.xml",
  }
}

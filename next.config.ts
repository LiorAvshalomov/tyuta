import type { NextConfig } from 'next'

/**
 * Security headers + CSP (Content Security Policy)
 * Notes:
 * - We allow connections to BOTH Supabase projects (A + B) so dev/prod won't break
 *   if env vars point to a different project.
 * - Keep this list tight. If you add another external provider, add it explicitly.
 */

const SUPABASE_URLS = [
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? '',
  // Database A
  'https://dowhdgcvxgzaikmpnchv.supabase.co',
  // Database B
  'https://ckhhngglsipovvvgailq.supabase.co',
].filter(Boolean)

const supabaseOrigins = Array.from(
  new Set(
    SUPABASE_URLS.map((u) => {
      try {
        return new URL(u).origin
      } catch {
        return ''
      }
    }).filter(Boolean),
  ),
)

const supabaseWssOrigins = supabaseOrigins
  .map((o) => o.replace(/^https:\/\//, 'wss://'))
  .filter(Boolean)

const connectSrc = [
  "'self'",
  ...supabaseOrigins,
  ...supabaseWssOrigins,
  'https://api-free.deepl.com',
  'https://www.google-analytics.com',
  'https://region1.google-analytics.com',
].join(' ')

const imgSrc = [
  "'self'",
  'data:',
  'blob:',
  ...supabaseOrigins,
  'https://api.dicebear.com',
  'https://pixabay.com',
  'https://cdn.pixabay.com',
  'https://images.pexels.com',
  'https://www.google-analytics.com',
].join(' ')

const nextConfig: NextConfig = {
  images: {
    minimumCacheTTL: 86400,
    // Constrain candidate widths so Next.js generates fewer distinct transformed variants.
    // Default deviceSizes includes 1920/2048/3840 — overkill for this layout (max 1280px wide).
    deviceSizes: [360, 640, 768, 1024, 1280],
    // Add 600 to cover the FeaturedPost hero cap; keeps card thumbnails in the 32–384 range.
    imageSizes: [32, 48, 64, 96, 128, 256, 384, 600],
    // Next.js 15+ requires local paths with query strings to be explicitly listed.
    // Omitting `search` means any query string is accepted for this pathname.
    localPatterns: [
      { pathname: '/api/media/cover' },
    ],
    remotePatterns: [
      // DiceBear (fallback avatars)
      { protocol: 'https', hostname: 'api.dicebear.com' },

      // Pixabay (page + CDN)
      { protocol: 'https', hostname: 'pixabay.com' },
      { protocol: 'https', hostname: 'cdn.pixabay.com' },

      // Pexels images CDN
      { protocol: 'https', hostname: 'images.pexels.com' },

      // Supabase Storage (public objects)
      { protocol: 'https', hostname: 'dowhdgcvxgzaikmpnchv.supabase.co', pathname: '/storage/v1/object/public/**' },
      { protocol: 'https', hostname: 'ckhhngglsipovvvgailq.supabase.co', pathname: '/storage/v1/object/public/**' },
    ],
  },

  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), payment=()' },
          { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
          {
            key: 'Content-Security-Policy',
            value: [
              "default-src 'self'",
              "script-src 'self' 'unsafe-inline' https://www.googletagmanager.com",
              "style-src 'self' 'unsafe-inline'",
              `img-src ${imgSrc}`,
              "font-src 'self'",
              `connect-src ${connectSrc}`,
              "frame-src https://www.youtube.com https://www.youtube-nocookie.com",
              "frame-ancestors 'none'",
              "base-uri 'self'",
              "form-action 'self'",
            ].join('; '),
          },
        ],
      },
    ]
  },
}

export default nextConfig

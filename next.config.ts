import type { NextConfig } from 'next'

// CSP is managed dynamically in middleware.ts (nonce-based, per-request).
// next.config.ts only sets the remaining static security headers.

const nextConfig: NextConfig = {
  poweredByHeader: false,
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
      { pathname: '/api/media/avatar' },
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
        ],
      },
    ]
  },
}

export default nextConfig

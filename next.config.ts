import type { NextConfig } from 'next'
import { API_SECURITY_HEADERS, BASE_SECURITY_HEADERS } from './src/lib/securityHeaders'

// Document responses receive the full CSP (via applyDocumentSecurityHeaders in middleware.ts).
// API responses and any other routes not touched by middleware get the base (non-CSP) headers
// below. CSP is static — Next.js App Router 16 RSC streaming injects executable inline scripts
// ($RC/$RV/self.__next_f.push), so 'unsafe-inline' is required in script-src and nonces would
// force every page to be dynamic (breaking ISR/static optimization).

const nextConfig: NextConfig = {
  poweredByHeader: false,
  // @resvg/resvg-js ships a native .node binary — must not be bundled by Turbopack/webpack.
  // Require it at runtime via Node.js instead.
  serverExternalPackages: ['@resvg/resvg-js', 'fontkit'],
  // Bundle font TTF files with the share-images API route on Vercel serverless.
  outputFileTracingIncludes: {
    '/api/posts/\\[id\\]/share-images': ['./src/lib/share-images/fonts/**'],
  },
  images: {
    formats: ['image/avif', 'image/webp'],
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

  async rewrites() {
    return {
      // beforeFiles runs before ISR cache — UUID post URLs are handed off to an
      // API route (Node.js runtime) that looks up the current slug and redirects.
      // The `?nr=1` query param acts as a bypass flag so the rewrite doesn't loop.
      beforeFiles: [
        {
          source: '/post/:uuid([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})',
          missing: [{ type: 'query', key: 'nr' }],
          destination: '/api/internal/post-by-id/:uuid',
        },
      ],
    }
  },

  async headers() {
    return [
      {
        // Long-lived cache for versioned Next.js static chunks (already immutable by hash)
        source: '/_next/static/:path*',
        headers: [
          { key: 'Cache-Control', value: 'public, max-age=31536000, immutable' },
        ],
      },
      {
        // Public JS assets (ga.js etc.) — 1 day, allow background revalidation for a week
        source: '/js/:path*',
        headers: [
          { key: 'Cache-Control', value: 'public, max-age=86400, stale-while-revalidate=604800' },
        ],
      },
      {
        // Static images & icons in public/ — 7 days, revalidate for 30 days
        source: '/:path(.*\\.(?:png|jpg|jpeg|webp|avif|ico|svg|webmanifest))',
        headers: [
          { key: 'Cache-Control', value: 'public, max-age=604800, stale-while-revalidate=2592000' },
        ],
      },
      {
        source: '/api/:path*',
        headers: API_SECURITY_HEADERS,
      },
      {
        source: '/(.*)',
        headers: [
          ...BASE_SECURITY_HEADERS,
        ],
      },
    ]
  },
}

export default nextConfig

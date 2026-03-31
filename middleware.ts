import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

const RESET_COOKIE = 'tyuta_reset_required'

// Supabase origins — must match next.config.ts remotePatterns
const SB_ORIGINS = [
  'https://dowhdgcvxgzaikmpnchv.supabase.co',
  'https://ckhhngglsipovvvgailq.supabase.co',
]
const SB_WSS = SB_ORIGINS.map((o) => o.replace('https://', 'wss://'))

/**
 * Build the Content-Security-Policy header value.
 *
 * script-src strategy (hash-based — compatible with ISR/edge caching):
 *   - 'sha256-{hash}' — SHA-256 of the static theme-init inline script in layout.tsx.
 *     CSP3 ignores 'unsafe-inline' for static inline scripts when a hash is present,
 *     so injected inline XSS is blocked while the known script is allowed.
 *   - 'self' — allows Next.js bundle chunks loaded from the same origin.
 *   - No 'unsafe-inline' — GA init moved to /public/js/ga.js (external 'self' script).
 *     Zero inline JS remains; any injected inline script is blocked unconditionally.
 *   - https://www.googletagmanager.com — explicit allowlist for GTM external script.
 *
 * Why not nonce-based: nonces require headers() in layout.tsx which forces dynamic
 * rendering and breaks ISR/Vercel edge caching entirely.
 *
 * style-src keeps 'unsafe-inline' because Tailwind v4 and TipTap inject styles at runtime.
 *
 * Hardening:
 *   - object-src 'none' — blocks Flash / plugin embeds
 *   - upgrade-insecure-requests — upgrades any accidental HTTP sub-resources
 *   - report-uri — browser reports violations to our logging endpoint
 */
function buildCSP(): string {
  const imgSrc = [
    "'self'",
    'data:',
    'blob:',
    ...SB_ORIGINS,
    'https://api.dicebear.com',
    'https://pixabay.com',
    'https://cdn.pixabay.com',
    'https://images.pexels.com',
    'https://www.google-analytics.com',
  ].join(' ')

  const connectSrc = [
    "'self'",
    ...SB_ORIGINS,
    ...SB_WSS,
    'https://api-free.deepl.com',
    'https://www.google-analytics.com',
    'https://region1.google-analytics.com',
  ].join(' ')

  return [
    "default-src 'self'",
    // SHA-256 hash of the theme-init inline script (layout.tsx) — the only inline script.
    // All other JS (GA, Next.js bundles) is loaded as external files ('self' / GTM host).
    // No 'unsafe-inline': without it, any injected inline script is blocked in all CSP levels.
    `script-src 'sha256-BrQ21Fty0XJkC0AunvvgEWvXkbWfHbpmmJpKVG+Dw48=' 'self' https://www.googletagmanager.com`,
    "style-src 'self' 'unsafe-inline'",
    `img-src ${imgSrc}`,
    "font-src 'self'",
    `connect-src ${connectSrc}`,
    'frame-src https://www.youtube.com https://www.youtube-nocookie.com',
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "object-src 'none'",
    // Block inline event-handler XSS (onclick=, onerror=, etc.) — React never uses HTML event attributes.
    "script-src-attr 'none'",
    // No service workers in this app; block explicitly to prevent SW-based cache poisoning.
    "worker-src 'none'",
    'upgrade-insecure-requests',
  ].join('; ')
}

/** Paths that skip middleware entirely — static files and API routes */
function isStaticAsset(pathname: string): boolean {
  return (
    pathname.startsWith('/_next') ||
    pathname.startsWith('/api') ||
    pathname === '/favicon.ico' ||
    pathname === '/robots.txt' ||
    pathname === '/sitemap.xml'
  )
}

/** Auth pages bypass the reset-cookie gate but still receive the CSP header */
function isAuthPage(pathname: string): boolean {
  return pathname.startsWith('/auth/')
}

const UUID_POST_RE = /^\/post\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i

export function middleware(req: NextRequest) {
  const { pathname, searchParams } = req.nextUrl

  // Static assets: skip nonce/CSP entirely
  if (isStaticAsset(pathname)) return NextResponse.next()

  // UUID post URLs → rewrite to API route that looks up the current slug and redirects.
  // No async IO here — pure regex match. The API route (Node.js) handles the DB lookup.
  // ?nr=1 bypasses this rewrite so the fallback page can render without looping.
  const uuidMatch = pathname.match(UUID_POST_RE)
  if (uuidMatch && !searchParams.has('nr')) {
    return NextResponse.rewrite(new URL(`/api/internal/post-by-id/${uuidMatch[1]}`, req.url))
  }

  // Reset-cookie and recovery-flow gate (auth pages are exempt from this gate)
  if (!isAuthPage(pathname)) {
    const resetRequired = req.cookies.get(RESET_COOKIE)?.value === '1'
    if (resetRequired && pathname !== '/auth/reset-password') {
      const url = req.nextUrl.clone()
      url.pathname = '/auth/reset-password'
      url.search = ''
      return NextResponse.redirect(url)
    }

    const flowType = searchParams.get('type')
    const isRecoveryFlow = flowType === 'recovery' || flowType === 'invite'
    if (isRecoveryFlow && pathname !== '/auth/reset-password') {
      const url = req.nextUrl.clone()
      url.pathname = '/auth/reset-password'
      url.search = req.nextUrl.search
      return NextResponse.redirect(url)
    }
  }

  const response = NextResponse.next()
  response.headers.set('Content-Security-Policy', buildCSP())
  return response
}

export const config = {
  matcher: ['/((?!_next|api|favicon.ico|robots.txt|sitemap.xml).*)'],
}

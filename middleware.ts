import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { verifyAuthHint, verifyPresence, AUTH_HINT_COOKIE, PRESENCE_COOKIE } from '@/lib/auth/presenceCookie'
import { buildLoginRedirect } from '@/lib/auth/protectedRoutes'

const RESET_COOKIE = 'tyuta_reset_required'
const PUBLIC_FILE_RE = /\.(?:png|svg|jpe?g|gif|webp|ico|txt|xml|json|webmanifest|woff2?|ttf|otf|mp4|webm)$/i

// Supabase origins — must match next.config.ts remotePatterns
const SB_ORIGINS = [
  'https://dowhdgcvxgzaikmpnchv.supabase.co',
  'https://ckhhngglsipovvvgailq.supabase.co',
]
const SB_WSS = SB_ORIGINS.map((o) => o.replace('https://', 'wss://'))

/**
 * Build the Content-Security-Policy header value.
 *
 * script-src strategy ('unsafe-inline' — required by Next.js App Router):
 *   - 'unsafe-inline' — Next.js App Router injects dynamic inline scripts per-render
 *     (RSC flight data, hydration bootstrap). These change per response and cannot be hashed.
 *     NOTE: If a hash OR nonce is also present, CSP3 ignores 'unsafe-inline' entirely,
 *     which would block Next.js's own scripts. So no hash is used here.
 *   - 'self' — allows Next.js bundle chunks loaded from the same origin.
 *   - https://www.googletagmanager.com — explicit allowlist for GTM external script.
 *
 * Why not nonce-based: nonces require headers() in layout.tsx which forces dynamic
 * rendering and breaks ISR/Vercel edge caching entirely.
 *
 * Inline XSS is still mitigated by:
 *   - script-src-attr 'none' — blocks onclick=/onerror= event-handler injection.
 *   - React's output escaping — all template expressions are HTML-entity-encoded.
 *   - connect-src whitelist — limits where data can be exfiltrated even if JS runs.
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
    // 'unsafe-inline' is required: Next.js App Router injects dynamic inline scripts
    // (RSC streaming data, hydration bootstrap) that cannot be statically hashed.
    // XSS risk is mitigated by script-src-attr 'none' + React escaping + connect-src whitelist.
    `script-src 'unsafe-inline' 'self' https://www.googletagmanager.com`,
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
    // Browser violation reports → /api/internal/csp-report (excluded from middleware matcher)
    'report-uri /api/internal/csp-report',
  ].join('; ')
}

/** Apply all hardening headers to an outgoing response. */
function applySecurityHeaders(res: NextResponse): void {
  res.headers.set('Content-Security-Policy', buildCSP())
  // Belt-and-suspenders alongside frame-ancestors 'none' in CSP (older browser compat)
  res.headers.set('X-Frame-Options', 'DENY')
  // Prevent MIME-type sniffing (e.g. serving JS as text/plain to bypass CSP)
  res.headers.set('X-Content-Type-Options', 'nosniff')
  // Send origin only on cross-origin requests; full URL on same-origin
  res.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin')
  // Prevent this window from being opened in a cross-origin context (clickjacking, Spectre)
  res.headers.set('Cross-Origin-Opener-Policy', 'same-origin')
  // Opt out of browser features not used by this app
  res.headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()')
  // HSTS — tell browsers to always use HTTPS for 2 years, including subdomains.
  // Vercel already adds this in production, but defence-in-depth keeps it here too.
  res.headers.set('Strict-Transport-Security', 'max-age=63072000; includeSubDomains; preload')
}

/** Paths that skip middleware entirely — static files and API routes */
function isStaticAsset(pathname: string): boolean {
  return (
    pathname.startsWith('/_next') ||
    pathname.startsWith('/api') ||
    PUBLIC_FILE_RE.test(pathname) ||
    pathname === '/favicon.ico' ||
    pathname === '/robots.txt' ||
    pathname === '/sitemap.xml'
  )
}

/** Auth pages bypass the reset-cookie gate but still receive security headers */
function isAuthPage(pathname: string): boolean {
  return pathname.startsWith('/auth/')
}

const UUID_POST_RE = /^\/post\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i
const SUSPENDED_BLOCKED_PREFIXES = [
  '/write',
  '/notes',
  '/notebook',
  '/saved',
  '/trash',
  '/notifications',
  '/settings',
] as const

function matchesPrefix(pathname: string, prefixes: readonly string[]): boolean {
  return prefixes.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`))
}

function isBannedPath(pathname: string): boolean {
  return pathname === '/banned' || pathname.startsWith('/banned/')
}

function isRestrictedPath(pathname: string): boolean {
  return pathname === '/restricted' || pathname.startsWith('/restricted/')
}

function redirectWithHeaders(req: NextRequest, target: string): NextResponse {
  const redirect = NextResponse.redirect(new URL(target, req.url))
  applySecurityHeaders(redirect)
  return redirect
}

export async function middleware(req: NextRequest) {
  const { pathname, searchParams } = req.nextUrl

  // Static assets and API routes: skip middleware entirely
  if (isStaticAsset(pathname)) return NextResponse.next()

  // UUID post URLs → rewrite to API route that looks up the current slug and redirects.
  // No async IO here — pure regex match. The API route (Node.js) handles the DB lookup.
  // ?nr=1 bypasses this rewrite so the fallback page can render without looping.
  const uuidMatch = pathname.match(UUID_POST_RE)
  if (uuidMatch && !searchParams.has('nr')) {
    return NextResponse.rewrite(new URL(`/api/internal/post-by-id/${uuidMatch[1]}`, req.url))
  }

  // ── Admin gate ────────────────────────────────────────────────────────────
  // /admin/* requires a valid HMAC-signed presence cookie carrying admin=1.
  // This is a routing-layer hint — real authorization is enforced by
  // requireAdminFromRequest() on every /api/admin/* call and server component.
  //
  // If PRESENCE_HMAC_SECRET is not configured (local dev), the gate is skipped
  // so development is not blocked. In production this env var MUST be set.
  const secret = process.env.PRESENCE_HMAC_SECRET
  const cookieVal = secret ? req.cookies.get(PRESENCE_COOKIE)?.value : null
  const presence = secret && cookieVal ? await verifyPresence(cookieVal, secret) : null
  const authHintCookieVal = secret ? req.cookies.get(AUTH_HINT_COOKIE)?.value : null
  const authHint = secret && authHintCookieVal ? await verifyAuthHint(authHintCookieVal, secret) : null

  if (presence?.moderation === 'banned') {
    if (!isBannedPath(pathname)) {
      return redirectWithHeaders(req, `/banned?from=${encodeURIComponent(pathname)}`)
    }
  } else if (presence?.moderation === 'suspended') {
    if (isBannedPath(pathname)) {
      return redirectWithHeaders(req, '/restricted')
    }
    if (!isRestrictedPath(pathname) && matchesPrefix(pathname, SUSPENDED_BLOCKED_PREFIXES)) {
      return redirectWithHeaders(req, `/restricted?from=${encodeURIComponent(pathname)}`)
    }
  } else if (presence) {
    if (isBannedPath(pathname) || isRestrictedPath(pathname)) {
      return redirectWithHeaders(req, '/')
    }
  }

  if (pathname.startsWith('/admin')) {
    if (secret) {
      const adminHint = presence ?? authHint

      if (adminHint && !adminHint.isAdmin) {
        return redirectWithHeaders(req, '/')
      }
      if (!adminHint) {
        return redirectWithHeaders(req, buildLoginRedirect(pathname))
      }
    }
  }

  // ── Reset-cookie and recovery-flow gate (auth pages are exempt) ───────────
  if (!isAuthPage(pathname)) {
    const resetRequired = req.cookies.get(RESET_COOKIE)?.value === '1'
    if (resetRequired && pathname !== '/auth/reset-password') {
      const url = req.nextUrl.clone()
      url.pathname = '/auth/reset-password'
      url.search = ''
      const redirect = NextResponse.redirect(url)
      applySecurityHeaders(redirect)
      return redirect
    }

    const flowType = searchParams.get('type')
    const isRecoveryFlow = flowType === 'recovery' || flowType === 'invite'
    if (isRecoveryFlow && pathname !== '/auth/reset-password') {
      const url = req.nextUrl.clone()
      url.pathname = '/auth/reset-password'
      url.search = req.nextUrl.search
      const redirect = NextResponse.redirect(url)
      applySecurityHeaders(redirect)
      return redirect
    }
  }

  const response = NextResponse.next()
  applySecurityHeaders(response)
  return response
}

export const config = {
  matcher: ['/((?!_next|api|favicon.ico|robots.txt|sitemap.xml).*)'],
}

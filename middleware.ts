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
 * script-src strategy (nonce + strict-dynamic):
 *   - 'nonce-{nonce}' — every inline/external <script> tag gets this nonce
 *   - 'strict-dynamic' — scripts loaded by nonce-trusted scripts are also trusted
 *     (required for Next.js chunk loading and GA4/GTM dynamic injection)
 *   - 'unsafe-inline' — CSP Level 2 fallback only; ignored by CSP3 browsers
 *     when a nonce is present
 *   - https://www.googletagmanager.com — CSP2 host fallback; ignored in CSP3
 *
 * style-src keeps 'unsafe-inline' because Tailwind v4 and TipTap inject styles at runtime.
 *
 * Hardening:
 *   - object-src 'none' — blocks Flash / plugin embeds
 *   - upgrade-insecure-requests — upgrades any accidental HTTP sub-resources
 *   - report-uri — browser reports violations to our logging endpoint
 */
function buildCSP(nonce: string): string {
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
    // nonce-based: 'unsafe-inline' is ignored by CSP3 browsers when a nonce is present.
    // 'strict-dynamic' trusts scripts dynamically injected by nonce-trusted scripts (Next.js chunks, GTM).
    `script-src 'nonce-${nonce}' 'strict-dynamic' 'unsafe-inline' https://www.googletagmanager.com`,
    "style-src 'self' 'unsafe-inline'",
    `img-src ${imgSrc}`,
    "font-src 'self'",
    `connect-src ${connectSrc}`,
    'frame-src https://www.youtube.com https://www.youtube-nocookie.com',
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "object-src 'none'",
    'upgrade-insecure-requests',
    'report-uri /api/csp-report',
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

/** Auth pages bypass the reset-cookie gate but still receive nonce + CSP */
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

  // Generate a cryptographically random nonce per request.
  // btoa(randomUUID()) produces a base64 string — required by the CSP spec.
  const nonce = btoa(crypto.randomUUID())

  // Forward the nonce to the React server layer so layout.tsx can stamp
  // it onto inline <script> tags (theme init, GA, JSON-LD).
  const requestHeaders = new Headers(req.headers)
  requestHeaders.set('x-nonce', nonce)

  const response = NextResponse.next({ request: { headers: requestHeaders } })
  response.headers.set('Content-Security-Policy', buildCSP(nonce))
  return response
}

export const config = {
  matcher: ['/((?!_next|api|favicon.ico|robots.txt|sitemap.xml).*)'],
}

import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

const RESET_COOKIE = 'tyuta_reset_required'

const UUID_POST_RE = /^\/post\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i

// Supabase origins — must match next.config.ts remotePatterns
const SB_ORIGINS = [
  'https://dowhdgcvxgzaikmpnchv.supabase.co',
  'https://ckhhngglsipovvvgailq.supabase.co',
]
const SB_WSS = SB_ORIGINS.map((o) => o.replace('https://', 'wss://'))

/**
 * Generate a cryptographically random base64 nonce using the Web Crypto API.
 * Works in the Next.js Edge Runtime (no Node.js Buffer/crypto module needed).
 */
function generateNonce(): string {
  const bytes = new Uint8Array(16)
  crypto.getRandomValues(bytes)
  return btoa(String.fromCharCode(...Array.from(bytes)))
}

/**
 * Build the Content-Security-Policy header value for a given nonce.
 *
 * script-src:
 *   - 'self'  — allows Next.js chunk scripts served from the same origin
 *   - 'nonce-{nonce}' — allows inline scripts that carry this exact nonce
 *   - https://www.googletagmanager.com — allows GTM external script
 *   (no 'unsafe-inline' — nonce supersedes it in all modern browsers)
 *
 * style-src keeps 'unsafe-inline' because Tailwind v4 and TipTap use it.
 *
 * Added hardening vs previous config:
 *   - object-src 'none' — blocks Flash / plugin embeds
 *   - upgrade-insecure-requests — upgrades any accidental HTTP sub-resources
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
    `script-src 'self' 'nonce-${nonce}' https://www.googletagmanager.com`,
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

export async function middleware(req: NextRequest) {
  const { pathname, searchParams } = req.nextUrl

  // Static assets: skip nonce/CSP entirely
  if (isStaticAsset(pathname)) return NextResponse.next()

  // UUID slug redirect — runs before ISR cache so Google-indexed old URLs always redirect
  const uuidMatch = UUID_POST_RE.exec(pathname)
  if (uuidMatch) {
    const postId = uuidMatch[1]
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    if (supabaseUrl && key) {
      try {
        const apiRes = await fetch(
          `${supabaseUrl}/rest/v1/posts?id=eq.${postId}&select=slug&status=eq.published&deleted_at=is.null&limit=1`,
          { headers: { apikey: key, Authorization: `Bearer ${key}` } },
        )
        if (apiRes.ok) {
          const rows = (await apiRes.json()) as Array<{ slug: string }>
          const newSlug = rows[0]?.slug
          if (newSlug && newSlug !== postId) {
            const dest = req.nextUrl.clone()
            dest.pathname = `/post/${encodeURIComponent(newSlug)}`
            return NextResponse.redirect(dest, 301)
          }
        }
      } catch {
        // Network error — fall through to normal rendering
      }
    }
  }

  const nonce = generateNonce()

  // Forward the nonce to Server Components via a request header.
  // Next.js App Router reads 'x-nonce' and automatically injects the nonce
  // into every <script> and <style> tag it generates (hydration, chunks, etc.).
  const requestHeaders = new Headers(req.headers)
  requestHeaders.set('x-nonce', nonce)

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

  const response = NextResponse.next({ request: { headers: requestHeaders } })
  response.headers.set('Content-Security-Policy', buildCSP(nonce))
  return response
}

export const config = {
  matcher: ['/((?!_next|api|favicon.ico|robots.txt|sitemap.xml).*)'],
}

import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { verifyAuthHint, verifyPresence, AUTH_HINT_COOKIE, PRESENCE_COOKIE } from '@/lib/auth/presenceCookie'
import { buildLoginRedirect, isProtectedPath } from '@/lib/auth/protectedRoutes'
import { applyDocumentSecurityHeadersForPath } from '@/lib/securityHeaders'

const RESET_COOKIE = 'tyuta_reset_required'
const PUBLIC_FILE_RE = /\.(?:png|svg|jpe?g|gif|webp|ico|txt|xml|json|webmanifest|woff2?|ttf|otf|mp4|webm)$/i

/** Paths that skip middleware entirely - static files and API routes */
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
  applyDocumentSecurityHeadersForPath(redirect, req.nextUrl.pathname)
  return redirect
}

export async function middleware(req: NextRequest) {
  const { pathname, searchParams } = req.nextUrl
  const requestPath = `${pathname}${req.nextUrl.search}`

  if (isStaticAsset(pathname)) return NextResponse.next()

  const uuidMatch = pathname.match(UUID_POST_RE)
  if (uuidMatch && !searchParams.has('nr')) {
    return NextResponse.rewrite(new URL(`/api/internal/post-by-id/${uuidMatch[1]}`, req.url))
  }

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
        return redirectWithHeaders(req, buildLoginRedirect(requestPath))
      }
    }
  }

  if (!pathname.startsWith('/admin') && isProtectedPath(pathname)) {
    if (secret) {
      const userHint = presence ?? authHint
      if (!userHint) {
        return redirectWithHeaders(req, buildLoginRedirect(requestPath))
      }
    }
  }

  if (!isAuthPage(pathname)) {
    const resetRequired = req.cookies.get(RESET_COOKIE)?.value === '1'
    if (resetRequired && pathname !== '/auth/reset-password') {
      const url = req.nextUrl.clone()
      url.pathname = '/auth/reset-password'
      url.search = ''
      const redirect = NextResponse.redirect(url)
      applyDocumentSecurityHeadersForPath(redirect, pathname)
      return redirect
    }

    const flowType = searchParams.get('type')
    const isRecoveryFlow = flowType === 'recovery' || flowType === 'invite'
    if (isRecoveryFlow && pathname !== '/auth/reset-password') {
      const url = req.nextUrl.clone()
      url.pathname = '/auth/reset-password'
      url.search = req.nextUrl.search
      const redirect = NextResponse.redirect(url)
      applyDocumentSecurityHeadersForPath(redirect, pathname)
      return redirect
    }
  }

  const response = NextResponse.next()
  applyDocumentSecurityHeadersForPath(response, pathname)
  return response
}

export const config = {
  matcher: ['/((?!_next|api|favicon.ico|robots.txt|sitemap.xml).*)'],
}

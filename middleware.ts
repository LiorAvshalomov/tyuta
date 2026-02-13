import { NextRequest, NextResponse } from 'next/server'

/**
 * Tyuta - Password Reset Gate
 *
 * Supabase recovery links create a temporary authenticated session.
 * Product requirement: user MUST set a new password before getting access to the site.
 *
 * We enforce this server-side via a cookie set when recovery session is established.
 */
const RESET_GATE_COOKIE = 'tyuta_reset_required'

function isPublicFile(pathname: string): boolean {
  return (
    pathname.startsWith('/_next/') ||
    pathname.startsWith('/favicon') ||
    pathname.startsWith('/robots') ||
    pathname.startsWith('/sitemap') ||
    pathname.startsWith('/assets/') ||
    pathname.endsWith('.png') ||
    pathname.endsWith('.jpg') ||
    pathname.endsWith('.jpeg') ||
    pathname.endsWith('.webp') ||
    pathname.endsWith('.svg') ||
    pathname.endsWith('.ico')
  )
}

export function middleware(req: NextRequest) {
  const { pathname, search } = req.nextUrl

  if (isPublicFile(pathname)) return NextResponse.next()

  // Allow the reset page itself (and optional querystring).
  if (pathname.startsWith('/auth/reset-password')) return NextResponse.next()

  const gate = req.cookies.get(RESET_GATE_COOKIE)?.value
  if (gate === '1') {
    const url = req.nextUrl.clone()
    url.pathname = '/auth/reset-password'
    url.search = '' // keep clean; reset page will read its own token from URL when user arrives via email
    return NextResponse.redirect(url)
  }

  return NextResponse.next()
}

export const config = {
  matcher: [
    /**
     * Apply to all routes except static files.
     * Next will still call middleware for many paths; we early-return for public files above.
     */
    '/:path*',
  ],
}

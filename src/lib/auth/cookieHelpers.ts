import { NextResponse } from 'next/server'

/**
 * Shared cookie configuration for the httpOnly refresh-token cookies.
 *
 * Security properties:
 *   httpOnly   — JS cannot read it. Eliminates token theft via XSS entirely.
 *   Secure     — HTTPS-only in production (local dev uses HTTP, so conditional).
 *   SameSite=Strict — blocks the cookie from being sent on ANY cross-origin request,
 *                     including cross-site navigations. Strongest available CSRF protection.
 *   Path=/api/auth  — cookie is transmitted ONLY to /api/auth/* routes.
 *                     Every other route (including /api/posts, /api/admin, etc.)
 *                     never sees this cookie, minimising the attack surface.
 *
 * Two cookie names are used intentionally:
 *   - sb_rt      : persistent "remember me" session
 *   - sb_rt_sess : short-lived rolling session when "remember me" is off
 *
 * This lets the refresh route preserve the user's persistence choice without
 * guessing from auxiliary cookies that may be missing or unverifiable.
 */

export const RT_COOKIE = 'sb_rt'
export const RT_SESSION_COOKIE = 'sb_rt_sess'
export const RT_MODE_COOKIE = 'sb_rt_mode'

// 60-day absolute lifetime for "remember me".
const REMEMBER_ME_MAX_AGE = 60 * 24 * 60 * 60

// 24-hour rolling lifetime for non-remembered sessions.
// This cookie is re-issued whenever /api/auth/session rotates the refresh token,
// so an active user keeps the session alive without being logged out mid-work.
const SESSION_WINDOW_MAX_AGE = 24 * 60 * 60

const BASE_COOKIE_OPTS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'strict' as const,
  path: '/api/auth',
} as const

type RefreshCookieMode = 'remember' | 'session'

function parseRefreshCookieMode(value?: string | null): RefreshCookieMode | null {
  if (!value) return null
  if (value === 'remember') return 'remember'
  if (value === 'session') return 'session'
  return null
}

/** Write the httpOnly refresh-token cookie to an outgoing NextResponse. */
export function setRefreshCookie(
  res: NextResponse,
  refreshToken: string,
  rememberMe = true,
): void {
  const activeCookie = rememberMe ? RT_COOKIE : RT_SESSION_COOKIE
  const staleCookie = rememberMe ? RT_SESSION_COOKIE : RT_COOKIE
  const modeCookie = rememberMe ? 'remember' : 'session'

  res.cookies.set({
    name: activeCookie,
    value: refreshToken,
    ...BASE_COOKIE_OPTS,
    maxAge: rememberMe ? REMEMBER_ME_MAX_AGE : SESSION_WINDOW_MAX_AGE,
  })

  // Ensure only one RT cookie variant is live at a time.
  res.cookies.set({
    name: staleCookie,
    value: '',
    ...BASE_COOKIE_OPTS,
    maxAge: 0,
  })

  res.cookies.set({
    name: RT_MODE_COOKIE,
    value: modeCookie,
    ...BASE_COOKIE_OPTS,
    maxAge: rememberMe ? REMEMBER_ME_MAX_AGE : SESSION_WINDOW_MAX_AGE,
  })
}

/** Expire all refresh-token cookie variants immediately (signout / session revoked). */
export function clearRefreshCookie(res: NextResponse): void {
  for (const cookieName of [RT_COOKIE, RT_SESSION_COOKIE, RT_MODE_COOKIE]) {
    res.cookies.set({
      name: cookieName,
      value: '',
      ...BASE_COOKIE_OPTS,
      maxAge: 0,
    })
  }
}

export function resolveRememberMeFromCookies(input: {
  sessionRt?: string | null
  persistentRt?: string | null
  modeCookie?: string | null
  hintedRememberMe?: boolean | null
}): { rememberMe: boolean; refreshToken: string | null } {
  const sessionRt = input.sessionRt ?? null
  const persistentRt = input.persistentRt ?? null
  const modeCookie = parseRefreshCookieMode(input.modeCookie ?? null)
  const hintedRememberMe = input.hintedRememberMe ?? null

  if (sessionRt && persistentRt) {
    const rememberMe =
      modeCookie === 'remember'
        ? true
        : modeCookie === 'session'
          ? false
          : hintedRememberMe ?? false
    return { rememberMe, refreshToken: rememberMe ? persistentRt : sessionRt }
  }

  if (sessionRt) {
    return { rememberMe: false, refreshToken: sessionRt }
  }

  if (persistentRt) {
    return { rememberMe: true, refreshToken: persistentRt }
  }

  return { rememberMe: hintedRememberMe ?? false, refreshToken: null }
}

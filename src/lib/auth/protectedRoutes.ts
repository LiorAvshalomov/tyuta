const PROTECTED_PREFIXES = [
  '/write',
  '/saved',
  '/notifications',
  '/settings',
  '/trash',
  '/notes',
  '/notebook',
  '/inbox',
] as const

const ENTRY_AUTH_PREFIXES = ['/auth/login', '/auth/register', '/auth/signup', '/login', '/register'] as const

const ALL_AUTH_PREFIXES = [
  '/auth/login',
  '/auth/register',
  '/auth/signup',
  '/auth/forgot-password',
  '/auth/reset-password',
  '/login',
  '/register',
] as const

export function isAdminPath(pathname: string): boolean {
  return pathname === '/admin' || pathname.startsWith('/admin/')
}

export function isEntryAuthPath(pathname: string): boolean {
  return ENTRY_AUTH_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`))
}

export function isAuthPath(pathname: string): boolean {
  return ALL_AUTH_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`))
}

export function isProtectedPath(pathname: string): boolean {
  return PROTECTED_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`))
}

export function buildLoginRedirect(pathname: string): string {
  const qs = new URLSearchParams()
  qs.set('next', pathname)
  return `/auth/login?${qs.toString()}`
}

export function getSafePostAuthRedirect(rawNext: string | null, fallback = '/'): string {
  // Reject empty, non-relative, protocol-relative (//), and backslash-bypass (/\ → // in browsers)
  if (!rawNext || !rawNext.startsWith('/') || rawNext.startsWith('//') || rawNext.includes('\\')) return fallback
  if (isAuthPath(rawNext)) return fallback
  return rawNext
}

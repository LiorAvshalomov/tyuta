const SB_ORIGINS = [
  'https://dowhdgcvxgzaikmpnchv.supabase.co',
  'https://ckhhngglsipovvvgailq.supabase.co',
]

const SB_WSS = SB_ORIGINS.map((origin) => origin.replace('https://', 'wss://'))

export type HeaderPair = {
  key: string
  value: string
}

type MutableHeadersResponse = {
  headers: {
    set(key: string, value: string): void
  }
}

function normalizeSiteUrl(value: string | undefined): string {
  const trimmed = (value ?? 'https://tyuta.net').trim().replace(/\/+$/, '')
  if (!trimmed) return 'https://tyuta.net'
  return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`
}

const SITE_URL = normalizeSiteUrl(process.env.NEXT_PUBLIC_SITE_URL)
const CSP_REPORT_ENDPOINT = `${SITE_URL}/api/internal/csp-report`
const CSP_REPORT_GROUP = 'csp-endpoint'
const STRICT_CSP_REPORT_ONLY_ENABLED =
  process.env.NODE_ENV === 'production' || process.env.NEXT_PUBLIC_ENABLE_CSP_REPORT_ONLY === '1'
const SENSITIVE_DOCUMENT_PREFIXES = [
  '/admin',
  '/auth',
  '/login',
  '/register',
  '/write',
  '/settings',
  '/inbox',
  '/notes',
  '/notebook',
  '/saved',
  '/trash',
  '/notifications',
] as const
const NO_EMBED_DOCUMENT_PREFIXES = [
  '/admin',
  '/auth',
  '/login',
  '/register',
  '/settings',
  '/inbox',
  '/notes',
  '/notebook',
  '/saved',
  '/trash',
  '/notifications',
] as const
const NONCE_ENFORCED_DOCUMENT_PREFIXES = [
  '/admin',
  '/auth',
  '/login',
  '/register',
  '/write',
  '/settings',
  '/inbox',
  '/notes',
  '/notebook',
  '/saved',
  '/trash',
  '/notifications',
] as const
type SharedDirectiveOptions = {
  allowFrames?: boolean
  allowAnalytics?: boolean
  allowRichContentImages?: boolean
}

function sharedDirectives(options: SharedDirectiveOptions = {}): string[] {
  const allowFrames = options.allowFrames ?? true
  const allowAnalytics = options.allowAnalytics ?? true
  const allowRichContentImages = options.allowRichContentImages ?? true
  const imgSrc = [
    "'self'",
    'data:',
    'blob:',
    ...SB_ORIGINS,
    'https://api.dicebear.com',
    ...(allowRichContentImages
      ? ['https://pixabay.com', 'https://cdn.pixabay.com', 'https://images.pexels.com', 'https://i.ytimg.com']
      : []),
    ...(allowAnalytics ? ['https://www.google-analytics.com'] : []),
  ].join(' ')

  const connectSrc = [
    "'self'",
    ...SB_ORIGINS,
    ...SB_WSS,
    ...(allowAnalytics ? ['https://www.google-analytics.com', 'https://region1.google-analytics.com'] : []),
  ].join(' ')

  return [
    "default-src 'self'",
    `img-src ${imgSrc}`,
    "font-src 'self'",
    `connect-src ${connectSrc}`,
    allowFrames ? "frame-src https://www.youtube.com https://www.youtube-nocookie.com" : "frame-src 'none'",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "manifest-src 'self'",
    "media-src 'self' blob:",
    "object-src 'none'",
    "script-src-attr 'none'",
    "worker-src 'none'",
  ]
}

function matchesRoutePrefix(pathname: string, prefixes: readonly string[]): boolean {
  return prefixes.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`))
}

export function isSensitiveDocumentPath(pathname: string): boolean {
  return matchesRoutePrefix(pathname, SENSITIVE_DOCUMENT_PREFIXES)
}

export function shouldBlockEmbedsForPath(pathname: string): boolean {
  return matchesRoutePrefix(pathname, NO_EMBED_DOCUMENT_PREFIXES)
}

export function isNonceCSPEnabled(): boolean {
  return process.env.NODE_ENV === 'production' && process.env.TYUTA_ENFORCE_NONCE_CSP === '1'
}

export function shouldUseNonceCSPForPath(pathname: string): boolean {
  return isNonceCSPEnabled() && matchesRoutePrefix(pathname, NONCE_ENFORCED_DOCUMENT_PREFIXES)
}

export function buildCSP(options: SharedDirectiveOptions = {}): string {
  // Fallback policy for normal deployments. App Router streaming injects inline scripts,
  // so enforcement keeps unsafe-inline unless nonce enforcement is explicitly tested.
  // 'upgrade-insecure-requests' is enforcement-only (invalid in report-only policies).
  return [
    ...sharedDirectives(options),
    `script-src 'unsafe-inline' 'self'${(options.allowAnalytics ?? true) ? ' https://www.googletagmanager.com' : ''}`,
    "style-src 'self' 'unsafe-inline'",
    'upgrade-insecure-requests',
    `report-uri ${CSP_REPORT_ENDPOINT}`,
    `report-to ${CSP_REPORT_GROUP}`,
  ].join('; ')
}

export function buildNonceCSP(nonce: string, options: SharedDirectiveOptions = {}): string {
  const allowAnalytics = options.allowAnalytics ?? false
  const allowRichContentImages = options.allowRichContentImages ?? false
  return [
    ...sharedDirectives({ ...options, allowAnalytics, allowRichContentImages }),
    `script-src 'self' 'nonce-${nonce}'${allowAnalytics ? ' https://www.googletagmanager.com' : ''}`,
    "style-src 'self' 'unsafe-inline'",
    'upgrade-insecure-requests',
    `report-uri ${CSP_REPORT_ENDPOINT}`,
    `report-to ${CSP_REPORT_GROUP}`,
  ].join('; ')
}


// Stricter policy served Report-Only so we can observe what would break without 'unsafe-inline'
// on style-src before ever enforcing it. Kept separate from enforced CSP.
export function buildReportOnlyCSP(): string {
  return [
    ...sharedDirectives(),
    // Report-Only stays stricter than fallback enforcement so violations surface before rollout.
    "script-src 'self' https://www.googletagmanager.com",
    "script-src-elem 'self' https://www.googletagmanager.com",
    "style-src 'self'",
    "style-src-elem 'self'",
    "style-src-attr 'none'",
    "require-trusted-types-for 'script'",
    "trusted-types tyuta nextjs#bundler default",
    `report-uri ${CSP_REPORT_ENDPOINT}`,
    `report-to ${CSP_REPORT_GROUP}`,
  ].join('; ')
}

// Modern Reporting API replacement for Report-To (now supported in Chromium-based browsers).
// Declares a named endpoint referenced by `report-to` in CSP.
export function buildReportingEndpoints(): string {
  return `${CSP_REPORT_GROUP}="${CSP_REPORT_ENDPOINT}"`
}

export const BASE_SECURITY_HEADERS: HeaderPair[] = [
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), payment=()' },
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
  { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
  { key: 'Origin-Agent-Cluster', value: '?1' },
  { key: 'X-DNS-Prefetch-Control', value: 'off' },
  { key: 'X-Permitted-Cross-Domain-Policies', value: 'none' },
  { key: 'Reporting-Endpoints', value: buildReportingEndpoints() },
]

export const DOCUMENT_SECURITY_HEADERS: HeaderPair[] = [
  ...BASE_SECURITY_HEADERS,
  { key: 'Content-Security-Policy', value: buildCSP() },
]

export const API_SECURITY_HEADERS: HeaderPair[] = [
  ...BASE_SECURITY_HEADERS,
  { key: 'Content-Security-Policy', value: "default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'" },
]

export const ADMIN_API_SECURITY_HEADERS: HeaderPair[] = [
  ...API_SECURITY_HEADERS,
  { key: 'Cache-Control', value: 'no-store, max-age=0' },
  { key: 'Pragma', value: 'no-cache' },
]

export const PRIVATE_API_SECURITY_HEADERS: HeaderPair[] = [
  ...API_SECURITY_HEADERS,
  { key: 'Cache-Control', value: 'no-store, max-age=0' },
]

export function applyHeaderPairs(res: MutableHeadersResponse, headers: HeaderPair[]): void {
  for (const header of headers) {
    res.headers.set(header.key, header.value)
  }
}

export function applyDocumentSecurityHeaders(res: MutableHeadersResponse): void {
  applyHeaderPairs(res, DOCUMENT_SECURITY_HEADERS)
}

export function applyDocumentSecurityHeadersForPath(res: MutableHeadersResponse, pathname: string): void {
  applyHeaderPairs(res, BASE_SECURITY_HEADERS)
  const allowFrames = !shouldBlockEmbedsForPath(pathname)
  res.headers.set('Content-Security-Policy', buildCSP({
    allowFrames,
    allowAnalytics: !isSensitiveDocumentPath(pathname),
    allowRichContentImages: allowFrames,
  }))
  if (STRICT_CSP_REPORT_ONLY_ENABLED && isSensitiveDocumentPath(pathname)) {
    res.headers.set('Content-Security-Policy-Report-Only', buildReportOnlyCSP())
  }
}

export function applyNonceDocumentSecurityHeadersForPath(
  res: MutableHeadersResponse,
  pathname: string,
  nonce: string,
): void {
  applyHeaderPairs(res, BASE_SECURITY_HEADERS)
  const allowFrames = !shouldBlockEmbedsForPath(pathname)
  res.headers.set('Content-Security-Policy', buildNonceCSP(nonce, {
    allowFrames,
    allowAnalytics: !isSensitiveDocumentPath(pathname),
    allowRichContentImages: allowFrames,
  }))
  if (STRICT_CSP_REPORT_ONLY_ENABLED && isSensitiveDocumentPath(pathname)) {
    res.headers.set('Content-Security-Policy-Report-Only', buildReportOnlyCSP())
  }
}

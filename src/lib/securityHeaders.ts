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

const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL ?? 'https://tyuta.net').replace(/\/$/, '')
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
  '/notebook',
  '/saved',
  '/trash',
  '/notifications',
] as const

function sharedDirectives(): string[] {
  const imgSrc = [
    "'self'",
    'data:',
    'blob:',
    ...SB_ORIGINS,
    'https://api.dicebear.com',
    'https://pixabay.com',
    'https://cdn.pixabay.com',
    'https://images.pexels.com',
    'https://i.ytimg.com',
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
    `img-src ${imgSrc}`,
    "font-src 'self'",
    `connect-src ${connectSrc}`,
    "frame-src https://www.youtube.com https://www.youtube-nocookie.com",
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

export function buildCSP(): string {
  // 'unsafe-inline' is required in script-src because Next.js App Router RSC streaming
  // injects executable inline scripts ($RC/$RV/self.__next_f.push). Nonces would force every
  // page to be dynamic and break ISR/static optimization.
  // 'upgrade-insecure-requests' is enforcement-only (invalid in report-only policies).
  return [
    ...sharedDirectives(),
    "script-src 'unsafe-inline' 'self' https://www.googletagmanager.com",
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
    // script-src and style-src keep 'unsafe-inline' — RSC streaming and Tailwind both require it.
    // Report-Only policy currently mirrors the enforced CSP; tighten only after confirming zero violations.
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

export const API_SECURITY_HEADERS: HeaderPair[] = [...BASE_SECURITY_HEADERS]

export function applyHeaderPairs(res: MutableHeadersResponse, headers: HeaderPair[]): void {
  for (const header of headers) {
    res.headers.set(header.key, header.value)
  }
}

export function applyDocumentSecurityHeaders(res: MutableHeadersResponse): void {
  applyHeaderPairs(res, DOCUMENT_SECURITY_HEADERS)
}

export function applyDocumentSecurityHeadersForPath(res: MutableHeadersResponse, pathname: string): void {
  applyDocumentSecurityHeaders(res)
  if (STRICT_CSP_REPORT_ONLY_ENABLED && isSensitiveDocumentPath(pathname)) {
    res.headers.set('Content-Security-Policy-Report-Only', buildReportOnlyCSP())
  }
}

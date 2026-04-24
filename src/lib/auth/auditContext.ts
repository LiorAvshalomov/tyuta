// Shared audit context builder for auth_audit_log inserts.
//
// In Israel, CGNAT (בזק/HOT/Partner) means many users share the same IP.
// accept_language + parsed UA + full XFF chain significantly improve
// the ability to distinguish between events from the same IP.

type AuditContext = {
  ip: string
  user_agent: string | null
  metadata_base: Record<string, unknown>
}

const UA_BROWSER: [RegExp, string][] = [
  [/edg\//i,                 'Edge'],
  [/chrome|chromium|crios/i, 'Chrome'],
  [/firefox|fxios/i,         'Firefox'],
  [/safari/i,                'Safari'],
  [/opera|opr\//i,           'Opera'],
]

const UA_OS: [RegExp, string][] = [
  [/windows nt 1[01]/i, 'Windows 10/11'],
  [/windows nt/i,       'Windows'],
  [/mac os x|macos/i,   'macOS'],
  [/android/i,          'Android'],
  [/iphone|ipad/i,      'iOS'],
  [/linux/i,            'Linux'],
]

function parseUaBrowser(ua: string): string | null {
  for (const [re, name] of UA_BROWSER) if (re.test(ua)) return name
  return null
}

function parseUaOs(ua: string): string | null {
  for (const [re, name] of UA_OS) if (re.test(ua)) return name
  return null
}

export function buildAuditContext(req: Request): AuditContext {
  const xff = req.headers.get('x-forwarded-for') ?? ''
  const ip = xff.split(',')[0]?.trim() || req.headers.get('x-real-ip') || 'unknown'
  const ua = req.headers.get('user-agent') ?? null
  const lang = req.headers.get('accept-language')?.slice(0, 80) ?? null

  // Full XFF chain only when there are multiple hops — helps detect shared NAT/CDN IPs
  const xffChain = xff.includes(',') ? xff.slice(0, 200) : null

  const base: Record<string, unknown> = {}
  if (lang)     base.accept_language = lang
  if (xffChain) base.xff_chain = xffChain
  if (ua) {
    const browser = parseUaBrowser(ua)
    const os = parseUaOs(ua)
    if (browser) base.ua_browser = browser
    if (os)      base.ua_os = os
    if (/mobile|android|iphone/i.test(ua)) base.ua_mobile = true
  }

  return { ip, user_agent: ua, metadata_base: base }
}

// Merge event-specific fields with the base context.
// Returns null only when the merged result is truly empty.
export function mergeAuditMetadata(
  base: Record<string, unknown>,
  extra: Record<string, unknown> | null,
): Record<string, unknown> | null {
  const merged = extra ? { ...base, ...extra } : base
  return Object.keys(merged).length > 0 ? merged : null
}

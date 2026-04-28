type EmailRiskDecision =
  | { action: 'allow'; domain: string; source: 'local' | 'blocklist' | 'fallback' }
  | { action: 'block'; domain: string; reason: 'disposable_email'; source: 'local' | 'blocklist' }

const BLOCK_MESSAGE = 'אי אפשר להירשם עם כתובת אימייל זמנית. אפשר להשתמש בכתובת קבועה אחרת.'

const HIGH_CONFIDENCE_DISPOSABLE_DOMAINS = [
  '10minutemail.com',
  '20minutemail.com',
  'dispostable.com',
  'emailondeck.com',
  'fakeinbox.com',
  'getnada.com',
  'grr.la',
  'guerrillamail.com',
  'guerrillamailblock.com',
  'guerrillamail.net',
  'maildrop.cc',
  'mailinator.com',
  'mailnesia.com',
  'mail.tm',
  'minuteinbox.com',
  'moakt.com',
  'mugstock.com',
  'nada.email',
  'pokemail.net',
  'sharklasers.com',
  'tempmail.com',
  'tempmailo.com',
  'temp-mail.org',
  'tempail.com',
  'throwawaymail.com',
  'trashmail.com',
  'yopmail.com',
]

const LOCAL_BLOCKLIST = new Set(HIGH_CONFIDENCE_DISPOSABLE_DOMAINS)
const TRUSTED_CONSUMER_EMAIL_DOMAINS = new Set([
  'gmail.com',
  'googlemail.com',
  'icloud.com',
  'me.com',
  'mac.com',
  'outlook.com',
  'hotmail.com',
  'live.com',
  'msn.com',
  'yahoo.com',
  'ymail.com',
  'aol.com',
  'proton.me',
  'protonmail.com',
  'pm.me',
  'tutanota.com',
])
const DEFAULT_BLOCKLIST_URL = 'https://disposable.github.io/disposable-email-domains/domains.txt'
const REMOTE_BLOCKLIST_TTL_MS = 24 * 60 * 60_000
const FETCH_TIMEOUT_MS = 900

let remoteBlocklistCache: { domains: Set<string>; expiresAt: number } | null = null
let remoteBlocklistRefresh: Promise<Set<string> | null> | null = null

export function blockedEmailMessage(): string {
  return BLOCK_MESSAGE
}

export function extractEmailDomain(email: string): string | null {
  const trimmed = email.trim().toLowerCase()
  const at = trimmed.lastIndexOf('@')
  if (at <= 0 || at === trimmed.length - 1) return null
  const domain = trimmed.slice(at + 1).replace(/\.$/, '')
  if (!/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(domain)) return null
  return domain
}

function domainCandidates(domain: string): string[] {
  const labels = domain.split('.').filter(Boolean)
  const candidates: string[] = []
  for (let i = 0; i < labels.length - 1; i++) {
    candidates.push(labels.slice(i).join('.'))
  }
  return candidates
}

function envExtraDomains(): Set<string> {
  const raw = process.env.DISPOSABLE_EMAIL_EXTRA_DOMAINS
  if (!raw) return new Set()
  return new Set(
    raw
      .split(',')
      .map((domain) => domain.trim().toLowerCase())
      .filter((domain) => /^[a-z0-9.-]+\.[a-z]{2,}$/i.test(domain)),
  )
}

function hasBlockedCandidate(domain: string, blocklist: Set<string>): boolean {
  for (const candidate of domainCandidates(domain)) {
    if (blocklist.has(candidate)) return true
  }
  return false
}

async function fetchWithTimeout(url: string, init: RequestInit = {}): Promise<Response> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
  try {
    return await fetch(url, { ...init, signal: controller.signal })
  } finally {
    clearTimeout(timer)
  }
}

async function getRemoteBlocklist(): Promise<Set<string> | null> {
  const now = Date.now()
  if (remoteBlocklistCache && remoteBlocklistCache.expiresAt > now) {
    return remoteBlocklistCache.domains
  }

  if (remoteBlocklistRefresh) return remoteBlocklistRefresh

  remoteBlocklistRefresh = refreshRemoteBlocklist(now)
  try {
    return await remoteBlocklistRefresh
  } finally {
    remoteBlocklistRefresh = null
  }
}

async function refreshRemoteBlocklist(now: number): Promise<Set<string> | null> {
  const remoteUrl = process.env.DISPOSABLE_EMAIL_BLOCKLIST_URL ?? DEFAULT_BLOCKLIST_URL

  try {
    const res = await fetchWithTimeout(remoteUrl, {
      headers: { Accept: 'text/plain' },
      next: { revalidate: 86_400 },
    })
    if (!res.ok) return remoteBlocklistCache?.domains ?? null

    const text = await res.text()
    const domains = new Set<string>()
    for (const line of text.split('\n')) {
      const domain = line.trim().toLowerCase()
      if (domain && !domain.startsWith('#') && /^[a-z0-9.-]+\.[a-z]{2,}$/i.test(domain)) {
        domains.add(domain)
      }
    }
    if (domains.size === 0) return remoteBlocklistCache?.domains ?? null

    remoteBlocklistCache = { domains, expiresAt: now + REMOTE_BLOCKLIST_TTL_MS }
    return domains
  } catch {
    return remoteBlocklistCache?.domains ?? null
  }
}

export async function assessSignupEmail(email: string): Promise<EmailRiskDecision> {
  const domain = extractEmailDomain(email)
  if (!domain) {
    return { action: 'allow', domain: '', source: 'fallback' }
  }

  const localBlocklist = new Set([...LOCAL_BLOCKLIST, ...envExtraDomains()])
  if (hasBlockedCandidate(domain, localBlocklist)) {
    return { action: 'block', domain, reason: 'disposable_email', source: 'local' }
  }
  if (TRUSTED_CONSUMER_EMAIL_DOMAINS.has(domain)) {
    return { action: 'allow', domain, source: 'local' }
  }

  const remoteBlocklist = await getRemoteBlocklist()
  if (remoteBlocklist && hasBlockedCandidate(domain, remoteBlocklist)) {
    return { action: 'block', domain, reason: 'disposable_email', source: 'blocklist' }
  }

  return { action: 'allow', domain, source: 'fallback' }
}

import { NextResponse } from 'next/server'
import { rateLimit } from '@/lib/rateLimit'

export type RateLimitPolicy = {
  scope: string
  maxRequests: number
  windowMs: number
  message?: string
}

type RoutePolicyResolver = (pathname: string, method: string) => RateLimitPolicy | null

const DEFAULT_MESSAGE = 'יותר מדי בקשות. נסו שוב בעוד רגע.'
const PROTECTED_GATE_MESSAGE = 'יותר מדי ניסיונות גישה. נסו שוב בעוד רגע.'

function isMutationMethod(method: string): boolean {
  const normalized = method.toUpperCase()
  return normalized === 'POST' || normalized === 'PUT' || normalized === 'PATCH' || normalized === 'DELETE'
}

function getPathname(req: Request): string {
  try {
    return new URL(req.url).pathname.toLowerCase()
  } catch {
    return '/'
  }
}

export function getClientIp(req: Request): string {
  // x-real-ip is set by Vercel infrastructure and cannot be spoofed by the client.
  // Prefer it over x-forwarded-for whose first entry IS client-controlled.
  const xri = req.headers.get('x-real-ip')?.trim()
  if (xri) return xri

  // cf-connecting-ip is set by Cloudflare (not client-spoofable).
  const cf = req.headers.get('cf-connecting-ip')?.trim()
  if (cf) return cf

  // Last resort: rightmost XFF entry is infrastructure-added (harder to spoof
  // than the leftmost, which the client controls).
  const xff = req.headers.get('x-forwarded-for')
  if (xff) {
    const last = xff.split(',').at(-1)?.trim()
    if (last) return last
  }

  return 'unknown'
}

export function getRetryAfterSeconds(retryAfterMs: number): string {
  return String(Math.max(1, Math.ceil(retryAfterMs / 1000)))
}

export function buildRateLimitResponse(message: string, retryAfterMs: number): NextResponse {
  return NextResponse.json(
    {
      ok: false,
      error: {
        code: 'rate_limited',
        message,
      },
      retryAfterSeconds: Math.max(1, Math.ceil(retryAfterMs / 1000)),
    },
    {
      status: 429,
      headers: {
        'Retry-After': getRetryAfterSeconds(retryAfterMs),
      },
    },
  )
}

async function applyPolicy(key: string, policy: RateLimitPolicy): Promise<NextResponse | null> {
  const result = await rateLimit(key, {
    maxRequests: policy.maxRequests,
    windowMs: policy.windowMs,
  })

  if (result.allowed) return null

  return buildRateLimitResponse(
    policy.message ?? DEFAULT_MESSAGE,
    result.retryAfterMs,
  )
}

export async function enforceIpRateLimit(
  req: Request,
  policy: RateLimitPolicy,
): Promise<NextResponse | null> {
  const ip = getClientIp(req)
  return applyPolicy(`${policy.scope}:${ip}`, policy)
}

export async function enforceActorRouteRateLimit(
  req: Request,
  actorId: string | null | undefined,
  resolvePolicy: RoutePolicyResolver,
): Promise<NextResponse | null> {
  const policy = resolvePolicy(getPathname(req), req.method)
  if (!policy) return null

  const actorKey = actorId?.trim() || getClientIp(req)
  return applyPolicy(`${policy.scope}:${actorKey}`, policy)
}

export function resolveProtectedGatePolicy(
  scopePrefix: 'admin' | 'authed',
  method: string,
): RateLimitPolicy {
  if (isMutationMethod(method)) {
    return {
      scope: `${scopePrefix}_gate_write`,
      maxRequests: 120,
      windowMs: 60_000,
      message: PROTECTED_GATE_MESSAGE,
    }
  }

  return {
    scope: `${scopePrefix}_gate_read`,
    maxRequests: 300,
    windowMs: 60_000,
    message: PROTECTED_GATE_MESSAGE,
  }
}

export function resolveAdminRoutePolicy(pathname: string, method: string): RateLimitPolicy | null {
  const normalizedMethod = method.toUpperCase()

  // These endpoints keep their own tighter, route-specific limits.
  if (pathname === '/api/admin/inbox/broadcast' || pathname === '/api/admin/system/send') {
    return null
  }

  if (!isMutationMethod(normalizedMethod)) {
    if (
      pathname === '/api/admin/dashboard' ||
      pathname === '/api/admin/stats' ||
      pathname === '/api/admin/security' ||
      pathname === '/api/admin/moderation/stats'
    ) {
      return {
        scope: 'admin_analytics_read',
        maxRequests: 30,
        windowMs: 60_000,
        message: 'ריענון מהיר מדי של מסכי הניהול. נסו שוב בעוד רגע.',
      }
    }

    if (pathname.startsWith('/api/admin/inbox')) {
      return {
        scope: 'admin_inbox_read',
        maxRequests: 90,
        windowMs: 60_000,
        message: 'יותר מדי ריענוני תיבות ניהול. נסו שוב בעוד רגע.',
      }
    }

    if (pathname.startsWith('/api/admin/users/search')) {
      return {
        scope: 'admin_user_search',
        maxRequests: 45,
        windowMs: 60_000,
        message: 'יותר מדי חיפושי משתמשים בזמן קצר. נסו שוב בעוד רגע.',
      }
    }

    return {
      scope: 'admin_read',
      maxRequests: 180,
      windowMs: 60_000,
      message: 'יותר מדי בקשות קריאה למסכי הניהול. נסו שוב בעוד רגע.',
    }
  }

  if (
    pathname.includes('/purge') ||
    pathname.includes('/delete') ||
    pathname.includes('/ban') ||
    pathname.includes('/suspend') ||
    pathname.includes('/takedown') ||
    pathname.includes('/resolve')
  ) {
    return {
      scope: 'admin_sensitive_write',
      maxRequests: 20,
      windowMs: 10 * 60_000,
      message: 'בוצעו יותר מדי פעולות ניהול רגישות בזמן קצר. נסו שוב בעוד כמה דקות.',
    }
  }

  if (pathname.startsWith('/api/admin/inbox')) {
    return {
      scope: 'admin_inbox_write',
      maxRequests: 45,
      windowMs: 60_000,
      message: 'יותר מדי פעולות בתיבת הניהול. נסו שוב בעוד רגע.',
    }
  }

  return {
    scope: 'admin_write',
    maxRequests: 80,
    windowMs: 60_000,
    message: 'יותר מדי פעולות ניהול בזמן קצר. נסו שוב בעוד רגע.',
  }
}

export function resolveAuthedRoutePolicy(pathname: string, method: string): RateLimitPolicy | null {
  const normalizedMethod = method.toUpperCase()

  if (!isMutationMethod(normalizedMethod)) {
    return {
      scope: 'authed_read',
      maxRequests: 240,
      windowMs: 60_000,
      message: 'יותר מדי בקשות מהחשבון הזה. נסו שוב בעוד רגע.',
    }
  }

  if (pathname.startsWith('/api/storage/') || pathname.startsWith('/api/media/')) {
    return {
      scope: 'authed_media_write',
      maxRequests: 60,
      windowMs: 60_000,
      message: 'יותר מדי פעולות מדיה בזמן קצר. נסו שוב בעוד רגע.',
    }
  }

  if (pathname.startsWith('/api/profile/')) {
    return {
      scope: 'authed_profile_write',
      maxRequests: 40,
      windowMs: 5 * 60_000,
      message: 'יותר מדי עדכוני פרופיל בזמן קצר. נסו שוב בעוד כמה דקות.',
    }
  }

  return {
    scope: 'authed_write',
    maxRequests: 120,
    windowMs: 60_000,
    message: 'יותר מדי פעולות בזמן קצר. נסו שוב בעוד רגע.',
  }
}

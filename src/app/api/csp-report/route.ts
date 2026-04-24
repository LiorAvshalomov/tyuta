import { NextRequest, NextResponse } from 'next/server'
import { rateLimit } from '@/lib/rateLimit'

/**
 * CSP violation report receiver.
 *
 * Browsers POST here when a script/style is blocked by Content-Security-Policy.
 * Reports are logged to Vercel function logs for monitoring.
 * The endpoint intentionally returns 204 with no body.
 */
export const runtime = 'edge'

export async function POST(req: NextRequest) {
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown'
  const limited = await rateLimit(`csp-public:${ip}`, { maxRequests: 100, windowMs: 60_000 })
  if (!limited.allowed) return new NextResponse(null, { status: 204 })

  try {
    const body = await req.text()
    if (body.length < 4096) {
      console.warn('[CSP violation]', body)
    } else {
      console.warn('[CSP violation] oversized payload', body.length, 'bytes')
    }
  } catch {
    // Malformed or empty report body — ignore silently.
  }
  return new NextResponse(null, { status: 204 })
}

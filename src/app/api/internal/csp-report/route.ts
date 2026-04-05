import { NextRequest, NextResponse } from 'next/server'
import { rateLimit } from '@/lib/rateLimit'

/**
 * POST /api/internal/csp-report
 *
 * Receives Content-Security-Policy violation reports from browsers.
 * The browser sends these automatically when a CSP directive is violated
 * and the policy includes `report-uri /api/internal/csp-report`.
 *
 * Payload format (application/csp-report):
 *   { "csp-report": { "document-uri", "violated-directive", "blocked-uri", ... } }
 *
 * This endpoint intentionally:
 *   - Returns 204 immediately (no body) — spec-compliant, no unnecessary data
 *   - Logs violations to console for Vercel log aggregation
 *   - Never throws or errors (browser ignores non-2xx but we want clean logs)
 *
 * No auth required — browsers send reports unauthenticated per the CSP spec.
 * Rate-limited per IP to prevent log flooding.
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown'
  const limited = await rateLimit(`csp:${ip}`, { maxRequests: 100, windowMs: 60_000 })
  if (!limited.allowed) return new NextResponse(null, { status: 204 })

  try {
    const body = await req.text()
    // Log for Vercel / server log aggregation — keep payload bounded
    if (body.length < 4096) {
      console.warn('[csp-report]', body)
    } else {
      console.warn('[csp-report] oversized payload', body.length, 'bytes')
    }
  } catch {
    // Ignore parse errors — still return 204
  }

  return new NextResponse(null, { status: 204 })
}

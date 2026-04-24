import { createHash } from 'crypto'
import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { rateLimit } from '@/lib/rateLimit'
import { escapeHtml, sendTelegramMessage } from '@/lib/telegram'

export const runtime = 'nodejs'

const MAX_REPORT_BYTES = 4096
const MAX_FIELD_LENGTH = 240

type CspReportPayload = {
  documentUri: string
  effectiveDirective: string
  violatedDirective: string | null
  blockedUri: string
  sourceFile: string | null
  lineNumber: number | null
  columnNumber: number | null
  disposition: string | null
  sample: string | null
}

type RecordedCspReport = {
  id: string
  fingerprint: string
  route_path: string
  effective_directive: string
  blocked_uri: string
  count: number
  last_seen_at: string
  should_notify: boolean
}

function serviceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return null
  return createClient(url, key, { auth: { persistSession: false } })
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}

function compactText(value: unknown, maxLength = MAX_FIELD_LENGTH): string | null {
  if (typeof value !== 'string') return null
  const compact = value.replace(/[\u0000-\u001F\u007F]/g, '').replace(/\s+/g, ' ').trim()
  if (!compact) return null
  return compact.slice(0, maxLength)
}

function compactNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? Math.max(0, Math.floor(value)) : null
}

function pathFromUri(value: string | null): string {
  if (!value) return '/'
  try {
    const url = new URL(value)
    return url.pathname || '/'
  } catch {
    if (value.startsWith('/')) return value.split('?')[0]?.slice(0, MAX_FIELD_LENGTH) || '/'
    return '/'
  }
}

function normalizeBlockedUri(value: string | null): string {
  if (!value) return 'unknown'
  const lower = value.toLowerCase()
  if (['inline', 'eval', 'self', 'data', 'blob'].includes(lower)) return lower
  if (lower.startsWith('data:')) return 'data:'
  if (lower.startsWith('blob:')) return 'blob:'
  try {
    const url = new URL(value)
    return url.origin
  } catch {
    return value.slice(0, MAX_FIELD_LENGTH)
  }
}

function normalizeSourceFile(value: string | null): string | null {
  if (!value) return null
  try {
    const url = new URL(value)
    return `${url.origin}${url.pathname}`.slice(0, MAX_FIELD_LENGTH)
  } catch {
    return value.startsWith('/') ? value.slice(0, MAX_FIELD_LENGTH) : null
  }
}

function userAgentFamily(req: NextRequest): string | null {
  const ua = req.headers.get('user-agent') ?? ''
  if (/edg\//i.test(ua)) return 'Edge'
  if (/chrome|chromium|crios/i.test(ua)) return 'Chrome'
  if (/firefox|fxios/i.test(ua)) return 'Firefox'
  if (/safari/i.test(ua)) return 'Safari'
  return compactText(ua, 80)
}

function parseReportObject(value: unknown): CspReportPayload | null {
  if (!isRecord(value)) return null

  const report = isRecord(value['csp-report'])
    ? value['csp-report']
    : isRecord(value.body)
      ? value.body
      : value

  const documentUri = compactText(report['document-uri'] ?? report.documentURL ?? report.documentUri)
  const effectiveDirective = compactText(report['effective-directive'] ?? report.effectiveDirective)
  const blockedUri = compactText(report['blocked-uri'] ?? report.blockedURL ?? report.blockedUri)

  if (!documentUri || !effectiveDirective || !blockedUri) return null

  return {
    documentUri,
    effectiveDirective,
    violatedDirective: compactText(report['violated-directive'] ?? report.violatedDirective),
    blockedUri,
    sourceFile: compactText(report['source-file'] ?? report.sourceFile),
    lineNumber: compactNumber(report['line-number'] ?? report.lineNumber),
    columnNumber: compactNumber(report['column-number'] ?? report.columnNumber),
    disposition: compactText(report.disposition),
    sample: compactText(report.sample, 160),
  }
}

function parseReports(raw: string): CspReportPayload[] {
  const parsed = JSON.parse(raw) as unknown
  const items = Array.isArray(parsed) ? parsed : [parsed]
  return items.map(parseReportObject).filter((item): item is CspReportPayload => item !== null).slice(0, 10)
}

function fingerprintFor(report: CspReportPayload): string {
  const routePath = pathFromUri(report.documentUri)
  const blocked = normalizeBlockedUri(report.blockedUri)
  return createHash('sha256')
    .update(`${routePath}|${report.effectiveDirective}|${blocked}`)
    .digest('hex')
}

async function recordReport(req: NextRequest, report: CspReportPayload): Promise<RecordedCspReport | null> {
  const client = serviceClient()
  if (!client) return null

  const routePath = pathFromUri(report.documentUri)
  const { data, error } = await client.rpc('record_csp_violation_report', {
    p_fingerprint: fingerprintFor(report),
    p_route_path: routePath,
    p_document_path: routePath,
    p_effective_directive: report.effectiveDirective,
    p_violated_directive: report.violatedDirective,
    p_blocked_uri: normalizeBlockedUri(report.blockedUri),
    p_source_file: normalizeSourceFile(report.sourceFile),
    p_line_number: report.lineNumber,
    p_column_number: report.columnNumber,
    p_disposition: report.disposition,
    p_sample: report.sample,
    p_user_agent_family: userAgentFamily(req),
  })

  if (error || !Array.isArray(data) || !isRecord(data[0])) {
    if (error) console.warn('[csp-report] persistence skipped', error.message)
    return null
  }

  return data[0] as RecordedCspReport
}

async function notifyTelegram(recorded: RecordedCspReport): Promise<void> {
  if (!recorded.should_notify) return

  await sendTelegramMessage([
    '<b>CSP Report-Only</b>',
    `Route: <code>${escapeHtml(recorded.route_path)}</code>`,
    `Directive: <code>${escapeHtml(recorded.effective_directive)}</code>`,
    `Blocked: <code>${escapeHtml(recorded.blocked_uri)}</code>`,
    `Count: <code>${recorded.count}</code>`,
  ].join('\n'))
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown'
  const limited = await rateLimit(`csp:${ip}`, { maxRequests: 100, windowMs: 60_000 })
  if (!limited.allowed) return new NextResponse(null, { status: 204 })

  try {
    const body = await req.text()
    if (body.length > MAX_REPORT_BYTES) {
      console.warn('[csp-report] oversized payload', body.length, 'bytes')
      return new NextResponse(null, { status: 204 })
    }

    const reports = parseReports(body)
    for (const report of reports) {
      const recorded = await recordReport(req, report)
      if (recorded) {
        await notifyTelegram(recorded)
      } else {
        console.warn('[csp-report]', {
          routePath: pathFromUri(report.documentUri),
          effectiveDirective: report.effectiveDirective,
          blockedUri: normalizeBlockedUri(report.blockedUri),
        })
      }
    }
  } catch {
    // Malformed reports are ignored; browsers do not need a response body.
  }

  return new NextResponse(null, { status: 204 })
}

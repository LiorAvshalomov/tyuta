import { NextResponse } from 'next/server'
import { requireAdminFromRequest } from '@/lib/admin/requireAdminFromRequest'

const PAGE_SIZE = 50
const VALID_STATUSES = new Set(['all', 'new', 'known', 'ignored', 'fixed'])

type CspReportRow = {
  id: string
  route_path: string
  document_path: string
  effective_directive: string
  violated_directive: string | null
  blocked_uri: string
  source_file: string | null
  line_number: number | null
  column_number: number | null
  disposition: string | null
  status: string
  sample: string | null
  user_agent_family: string | null
  count: number
  first_seen_at: string
  last_seen_at: string
  last_telegram_at: string | null
}

function safeText(value: string): string {
  return value.replace(/[%_\\]/g, '\\$&').slice(0, 120)
}

function isMissingTableError(message: string): boolean {
  return message.includes('csp_violation_reports') || message.includes('record_csp_violation_report')
}

export async function GET(req: Request) {
  const gate = await requireAdminFromRequest(req)
  if (!gate.ok) return gate.response

  const url = new URL(req.url)
  const page = Math.max(1, parseInt(url.searchParams.get('page') ?? '1', 10))
  const status = url.searchParams.get('status') ?? 'all'
  const route = (url.searchParams.get('route') ?? '').trim()

  let query = gate.admin
    .from('csp_violation_reports')
    .select(
      'id,route_path,document_path,effective_directive,violated_directive,blocked_uri,source_file,line_number,column_number,disposition,status,sample,user_agent_family,count,first_seen_at,last_seen_at,last_telegram_at',
      { count: 'exact' },
    )
    .order('last_seen_at', { ascending: false })
    .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1)

  if (VALID_STATUSES.has(status) && status !== 'all') {
    query = query.eq('status', status)
  }
  if (route) {
    query = query.ilike('route_path', `%${safeText(route)}%`)
  }

  const { data, error, count } = await query
  if (error) {
    if (isMissingTableError(error.message)) {
      return NextResponse.json({ rows: [], total: 0, page, pageSize: PAGE_SIZE, setupRequired: true })
    }
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({
    rows: (data ?? []) as CspReportRow[],
    total: count ?? 0,
    page,
    pageSize: PAGE_SIZE,
    setupRequired: false,
  })
}

const VALID_UPDATE_STATUSES = new Set(['new', 'known', 'ignored', 'fixed'])
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function PATCH(req: Request) {
  const gate = await requireAdminFromRequest(req)
  if (!gate.ok) return gate.response

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'invalid json' }, { status: 400 })
  }

  if (
    typeof body !== 'object' ||
    body === null ||
    typeof (body as Record<string, unknown>).id !== 'string' ||
    typeof (body as Record<string, unknown>).status !== 'string'
  ) {
    return NextResponse.json({ error: 'id and status are required' }, { status: 400 })
  }

  const { id, status } = body as { id: string; status: string }

  if (!UUID_RE.test(id)) {
    return NextResponse.json({ error: 'invalid id' }, { status: 400 })
  }

  if (!VALID_UPDATE_STATUSES.has(status)) {
    return NextResponse.json({ error: 'invalid status' }, { status: 400 })
  }

  const { error } = await gate.admin
    .from('csp_violation_reports')
    .update({ status, updated_at: new Date().toISOString() })
    .eq('id', id)

  if (error) {
    if (isMissingTableError(error.message)) {
      return NextResponse.json({ error: 'table not set up yet' }, { status: 503 })
    }
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}

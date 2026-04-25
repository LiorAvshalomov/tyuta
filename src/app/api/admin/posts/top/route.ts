import { NextResponse } from 'next/server'
import { requireAdminFromRequest } from '@/lib/admin/requireAdminFromRequest'

function mustISO(raw: string | null, fallback: Date): string {
  if (!raw) return fallback.toISOString()
  const parsed = new Date(raw)
  return Number.isNaN(parsed.getTime()) ? fallback.toISOString() : parsed.toISOString()
}

export async function GET(req: Request) {
  const gate = await requireAdminFromRequest(req)
  if (!gate.ok) return gate.response

  const url = new URL(req.url)
  const now = new Date()
  const startFallback = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)

  const start = mustISO(url.searchParams.get('start'), startFallback)
  const end   = mustISO(url.searchParams.get('end'),   now)
  const limit = Math.min(Math.max(parseInt(url.searchParams.get('limit') ?? '20', 10) || 20, 1), 100)

  const { data, error } = await gate.admin.rpc('admin_top_posts', {
    p_start: start,
    p_end:   end,
    p_limit: limit,
  }) as { data: unknown; error: { message: string } | null }

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json(data ?? [], { headers: { 'Cache-Control': 'no-store' } })
}

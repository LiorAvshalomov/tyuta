import { NextResponse } from 'next/server'

import { loadDashboardPayload } from '@/lib/admin/dashboardData'
import { requireAdminFromRequest } from '@/lib/admin/requireAdminFromRequest'

type Bucket = 'day' | 'week' | 'month'

function pickBucket(raw: string | null): Bucket {
  if (raw === 'week' || raw === 'month') return raw
  return 'day'
}

function mustISO(raw: string | null, fallback: Date): string {
  if (!raw) return fallback.toISOString()
  const parsed = new Date(raw)
  return Number.isNaN(parsed.getTime()) ? fallback.toISOString() : parsed.toISOString()
}

export async function GET(req: Request) {
  const gate = await requireAdminFromRequest(req)
  if (!gate.ok) return gate.response

  const url = new URL(req.url)
  const bucket = pickBucket(url.searchParams.get('bucket'))
  const now = new Date()
  const startFallback = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)

  try {
    const payload = await loadDashboardPayload(gate.admin, {
      bucket,
      start: mustISO(url.searchParams.get('start'), startFallback),
      end: mustISO(url.searchParams.get('end'), now),
    })

    return NextResponse.json(payload)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to load dashboard'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

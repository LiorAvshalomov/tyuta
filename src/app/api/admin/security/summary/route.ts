import { NextResponse } from 'next/server'
import { requireAdminFromRequest } from '@/lib/admin/requireAdminFromRequest'

export async function GET(req: Request) {
  const gate = await requireAdminFromRequest(req)
  if (!gate.ok) return gate.response

  const { data, error } = await gate.admin.rpc('admin_security_summary') as {
    data: unknown
    error: { message: string } | null
  }

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json(data ?? {}, { headers: { 'Cache-Control': 'no-store' } })
}

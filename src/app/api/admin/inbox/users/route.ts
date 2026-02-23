import { NextResponse } from 'next/server'
import { requireAdminFromRequest } from '@/lib/admin/requireAdminFromRequest'

function getQueryParam(req: Request, key: string): string {
  const url = new URL(req.url)
  return (url.searchParams.get(key) ?? '').trim()
}

export async function GET(req: Request) {
  const auth = await requireAdminFromRequest(req)
  if (!auth.ok) return auth.response

  // Strip PostgREST filter meta-characters to prevent filter injection
  const q = getQueryParam(req, 'q').replace(/[%_\\(),."']/g, '')
  if (q.length < 2) {
    return NextResponse.json({ users: [] })
  }

  // Search by username / display_name
  const { data, error } = await auth.admin
    .from('profiles')
    .select('id, username, display_name, avatar_url')
    .or(`username.ilike.%${q}%,display_name.ilike.%${q}%`)
    .limit(20)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ users: data ?? [] })
}

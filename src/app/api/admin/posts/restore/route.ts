import { NextResponse, type NextRequest } from 'next/server'
import { requireAdminFromRequest } from '@/lib/admin/requireAdminFromRequest'

export async function POST(req: NextRequest) {
  const res = await requireAdminFromRequest(req)
  if (!res.ok) {
    return NextResponse.json({ ok: false, error: res.message }, { status: res.status })
  }

  const body = await req.json().catch(() => ({}))
  const postId = (body?.post_id ?? '').toString()
  if (!postId) return NextResponse.json({ ok: false, error: 'Missing post_id' }, { status: 400 })

  const { error } = await res.admin
    .from('posts')
    .update({ deleted_at: null, deleted_by: null, deleted_reason: null })
    .eq('id', postId)

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

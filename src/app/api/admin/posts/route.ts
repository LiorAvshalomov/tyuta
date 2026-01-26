import { NextResponse, type NextRequest } from 'next/server'
import { requireAdminFromRequest } from '@/lib/admin/requireAdminFromRequest'

export async function GET(req: NextRequest) {
  const res = await requireAdminFromRequest(req)
  if (!res.ok) {
    return NextResponse.json({ ok: false, error: res.message }, { status: res.status })
  }

  const url = new URL(req.url)
  const q = (url.searchParams.get('q') ?? '').trim()
  const filter = url.searchParams.get('filter') ?? 'all'
  const limit = Math.min(Math.max(parseInt(url.searchParams.get('limit') ?? '50', 10) || 50, 1), 200)

  let query = res.admin
    .from('posts')
    .select('id, author_id, title, slug, status, published_at, created_at, deleted_at, deleted_reason')
    .order('created_at', { ascending: false })
    .limit(limit)

  if (filter === 'deleted') query = query.not('deleted_at', 'is', null)
  if (filter === 'active') query = query.is('deleted_at', null)
  if (filter === 'published') query = query.eq('status', 'published').is('deleted_at', null)
  if (filter === 'draft') query = query.neq('status', 'published').is('deleted_at', null)

  if (q) {
    // search in title + slug
    query = query.or(`title.ilike.%${q}%,slug.ilike.%${q}%`)
  }

  const { data: posts, error } = await query
  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  }

  const authorIds = Array.from(new Set((posts ?? []).map((p: any) => p.author_id).filter(Boolean)))
  const { data: profiles } = authorIds.length
    ? await res.admin.from('profiles').select('id, username, display_name, avatar_url').in('id', authorIds)
    : { data: [] as any[] }

  const byId = new Map<string, any>()
  ;(profiles ?? []).forEach((p: any) => byId.set(p.id, p))

  const enriched = (posts ?? []).map((p: any) => ({ ...p, author_profile: byId.get(p.author_id) ?? null }))
  return NextResponse.json({ ok: true, posts: enriched })
}

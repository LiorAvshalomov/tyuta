import type { NextRequest } from 'next/server'
import { requireAdminFromRequest } from '@/lib/admin/requireAdminFromRequest'
import { adminError, adminOk } from '@/lib/admin/adminHttp'

const VALID_FILTERS = new Set(['all', 'deleted', 'active', 'published', 'draft'])

type PostRow = {
  id: string
  author_id: string
  title: string | null
  slug: string | null
  status: string | null
  published_at: string | null
  created_at: string | null
  deleted_at: string | null
  deleted_reason: string | null
  moderated_at: string | null
  moderated_reason: string | null
}

type ProfileRow = {
  id: string
  username: string | null
  display_name: string | null
  avatar_url: string | null
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === 'object' && !Array.isArray(v)
}

export async function GET(req: NextRequest) {
  const auth = await requireAdminFromRequest(req)
  if (!auth.ok) return auth.response

  const url = new URL(req.url)
  const q = (url.searchParams.get('q') ?? '').trim()
  const rawFilter = (url.searchParams.get('filter') ?? 'all').toLowerCase()
  const filter = VALID_FILTERS.has(rawFilter) ? rawFilter : 'all'
  const rawLimit = parseInt(url.searchParams.get('limit') ?? '50', 10)
  const limit = Math.min(Math.max(Number.isFinite(rawLimit) ? rawLimit : 50, 1), 200)

  let query = auth.admin
    .from('posts')
    .select('id, author_id, title, slug, status, published_at, created_at, deleted_at, deleted_reason, moderated_at, moderated_reason')
    .order('created_at', { ascending: false })
    .limit(limit)

  const isModeratedExpr = 'moderated_at.not.is.null'
  const isUserDeletedExpr = 'deleted_at.not.is.null'

  if (filter === 'deleted') {
    // Deleted tab = user trash OR admin temporary delete (moderated)
    query = query.or(`${isUserDeletedExpr},${isModeratedExpr},status.eq.moderated`)
  }

  if (filter === 'active') {
    query = query.is('deleted_at', null).is('moderated_at', null).neq('status', 'moderated')
  }

  if (filter === 'published') {
    query = query.eq('status', 'published').is('deleted_at', null).is('moderated_at', null)
  }

  if (filter === 'draft') {
    // Draft tab excludes published and excludes admin-moderated (which belongs in Deleted)
    query = query
      .neq('status', 'published')
      .neq('status', 'moderated')
      .is('deleted_at', null)
      .is('moderated_at', null)
  }

  if (q) {
    // Strip PostgREST filter meta-characters to prevent filter injection
    const qSafe = q.replace(/[%_\\(),."']/g, '')
    if (qSafe) query = query.or(`title.ilike.%${qSafe}%,slug.ilike.%${qSafe}%`)
  }

  const { data, error } = await query
  if (error) return adminError(error.message, 500, 'db_error')

  const posts = (Array.isArray(data) ? data : []) as unknown[]
  const postRows: PostRow[] = posts
    .map((v) => (isRecord(v) ? (v as unknown as PostRow) : null))
    .filter((v): v is PostRow => Boolean(v && typeof v.id === 'string' && typeof v.author_id === 'string'))

  const authorIds = Array.from(new Set(postRows.map((p) => p.author_id).filter((id) => typeof id === 'string' && id.length > 0)))
  const { data: profData, error: profErr } = authorIds.length
    ? await auth.admin.from('profiles').select('id, username, display_name, avatar_url').in('id', authorIds)
    : { data: [], error: null }

  if (profErr) return adminError(profErr.message, 500, 'db_error')

  const profiles = (Array.isArray(profData) ? profData : []) as unknown[]
  const byId = new Map<string, ProfileRow>()
  for (const v of profiles) {
    if (!isRecord(v)) continue
    const p = v as unknown as ProfileRow
    if (typeof p.id === 'string') byId.set(p.id, p)
  }

  const enriched = postRows.map((p) => ({ ...p, author: byId.get(p.author_id) ?? null }))
  return adminOk({ posts: enriched })
}

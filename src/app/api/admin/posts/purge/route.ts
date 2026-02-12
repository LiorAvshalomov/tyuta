import type { NextRequest } from 'next/server'
import { requireAdminFromRequest } from '@/lib/admin/requireAdminFromRequest'
import { adminError, adminOk } from '@/lib/admin/adminHttp'

const MAX_REASON_LEN = 500

type PostLite = {
  id: string
  author_id: string
  title: string | null
  slug: string | null
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === 'object' && !Array.isArray(v)
}

function pickString(body: unknown, key: string): string {
  if (!isRecord(body)) return ''
  const v = body[key]
  return typeof v === 'string' ? v.trim() : ''
}

export async function POST(req: NextRequest) {
  const auth = await requireAdminFromRequest(req)
  if (!auth.ok) return auth.response

  const body: unknown = await req.json().catch(() => null)
  const postId = pickString(body, 'post_id')
  const reason = pickString(body, 'reason')

  if (!postId) return adminError('Missing post_id', 400, 'bad_request')
  if (!reason || reason.length < 3) return adminError('Reason must be at least 3 characters.', 400, 'bad_request')
  if (reason.length > MAX_REASON_LEN) return adminError('Reason is too long.', 400, 'bad_request')

  const { data, error: postErr } = await auth.admin
    .from('posts')
    .select('id, author_id, title, slug')
    .eq('id', postId)
    .maybeSingle()

  if (postErr) return adminError(postErr.message, 500, 'db_error')

  const post = (data as unknown) as PostLite | null
  if (!post) return adminError('Post not found', 404, 'not_found')

  // Hard delete: remove dependencies then the post itself.
  // Expand this list as you add new related tables.
  const tasks: Array<() => Promise<void>> = [
    async () => {
      await auth.admin.from('comments').delete().eq('post_id', postId)
    },
    async () => {
      await auth.admin.from('post_bookmarks').delete().eq('post_id', postId)
    },
    async () => {
      await auth.admin.from('post_reaction_votes').delete().eq('post_id', postId)
    },
    async () => {
      await auth.admin.from('post_votes').delete().eq('post_id', postId)
    },
    async () => {
      await auth.admin.from('post_tags').delete().eq('post_id', postId)
    },
    async () => {
      await auth.admin.from('moderation_actions').delete().eq('post_id', postId)
    },
    async () => {
      await auth.admin.from('notifications').delete().eq('entity_type', 'post').eq('entity_id', postId)
    },
  ]

  for (const t of tasks) {
    try {
      await t()
    } catch {
      // ignore best-effort cleanup failures
    }
  }

  const { error: delErr } = await auth.admin.from('posts').delete().eq('id', postId)
  if (delErr) return adminError(delErr.message, 500, 'db_error')

  // Optional audit trail
  try {
    await auth.admin.from('moderation_actions').insert({
      actor_id: auth.user.id,
      target_user_id: post.author_id,
      post_id: post.id,
      action: 'post_purged',
      reason,
      created_at: new Date().toISOString(),
    } as never)
  } catch {
    // ignore
  }

  return adminOk({})
}

import type { NextRequest } from 'next/server'
import { requireAdminFromRequest } from '@/lib/admin/requireAdminFromRequest'
import { adminError, adminOk } from '@/lib/admin/adminHttp'
import { cleanupPostOwnedAssets } from '@/lib/storage/postAssetLifecycle'
import { revalidatePath } from 'next/cache'
import { revalidatePublicProfileForUserId } from '@/lib/revalidatePublicProfile'

const MAX_REASON_LEN = 500

type PostLite = {
  id: string
  author_id: string
  title: string | null
  slug: string | null
  cover_image_url: string | null
  channel_id: string | null
  status: string | null
  published_at: string | null
  is_anonymous: boolean | null
  created_at: string | null
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
    .select('id, author_id, title, slug, cover_image_url, channel_id, status, published_at, is_anonymous, created_at')
    .eq('id', postId)
    .maybeSingle()

  if (postErr) return adminError(postErr.message, 500, 'db_error')

  const post = (data as unknown) as PostLite | null
  if (!post) return adminError('Post not found', 404, 'not_found')

  let storage: { postAssets: number; postCovers: number }
  try {
    storage = await cleanupPostOwnedAssets(auth.admin, {
      authorId: post.author_id,
      postId: post.id,
      coverImageUrl: post.cover_image_url,
    })
  } catch (error) {
    return adminError(
      error instanceof Error ? error.message : 'Storage cleanup failed',
      500,
      'storage_cleanup_failed',
    )
  }

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

  // Notify post author before hard-deleting the row (best effort)
  try {
    const notifPayload: Record<string, unknown> = {
      post_id: post.id,
      post_title: post.title,
      post_slug: post.slug,
      reason,
      hard_delete: true,
    }

    await auth.admin.from('notifications').insert({
      user_id: post.author_id,
      actor_id: null,
      type: 'post_deleted',
      entity_type: 'post',
      entity_id: post.id,
      payload: notifPayload,
      is_read: false,
      created_at: new Date().toISOString(),
    })
  } catch {
    // best effort — don't fail the purge
  }

  // Audit logs BEFORE delete — any FK to posts.id must resolve while row still exists
  const auditTs = new Date().toISOString()

  try {
    await auth.admin.from('deletion_events').insert({
      action: 'admin_hard_delete',
      actor_user_id: auth.user.id,
      actor_kind: 'admin',
      target_post_id: post.id,
      post_snapshot: {
        title: post.title,
        slug: post.slug,
        author_id: post.author_id,
        channel_id: post.channel_id,
        status: post.status,
        published_at: post.published_at,
        is_anonymous: post.is_anonymous,
        created_at: post.created_at,
      },
      reason,
      created_at: auditTs,
    })
  } catch {
    // best effort — don't block the purge
  }

  try {
    await auth.admin.from('moderation_actions').insert({
      actor_id: auth.user.id,
      target_user_id: post.author_id,
      post_id: post.id,
      action: 'post_purged',
      reason,
      created_at: auditTs,
    } as never)
  } catch {
    // ignore if table/column schema differs
  }

  const { error: delErr } = await auth.admin.from('posts').delete().eq('id', postId)
  if (delErr) return adminError(delErr.message, 500, 'db_error')

  revalidatePath('/')
  revalidatePath('/c/release')
  revalidatePath('/c/stories')
  revalidatePath('/c/magazine')
  if (post.slug) revalidatePath(`/post/${post.slug}`)
  await revalidatePublicProfileForUserId(auth.admin, post.author_id)

  return adminOk({ storage })
}

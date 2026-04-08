import { NextRequest, NextResponse } from 'next/server'
import type { SupabaseClient } from '@supabase/supabase-js'
import { requireAdminFromRequest } from '@/lib/admin/requireAdminFromRequest'
import {
  fetchUserProfileSnapshot,
  logUserModerationAction,
} from '@/lib/admin/logUserModerationAction'
import { cleanupPostOwnedAssets } from '@/lib/storage/postAssetLifecycle'
import { revalidatePath } from 'next/cache'

type Body = {
  user_id?: string
  confirm?: boolean
  /** "anonymize" (default) = scrub PII + ban; "hard" = full cascade delete */
  mode?: 'anonymize' | 'hard'
  /** Required for irreversible modes. */
  reason?: string
}

type Counts = Record<string, number>

// ── Helpers ──────────────────────────────────────────────────────

/** Delete rows where column = value. Returns error string on failure. */
async function deleteEq(
  client: SupabaseClient,
  table: string,
  column: string,
  value: string,
  counts: Counts,
): Promise<string | null> {
  const { error, count } = await client
    .from(table)
    .delete({ count: 'exact' })
    .eq(column, value)
  if (error) return `${table}(${column}): ${error.message}`
  counts[`${table}(${column})`] = count ?? 0
  return null
}

/** Delete rows where column IN values (chunked to 100). Returns error string on failure. */
async function deleteIn(
  client: SupabaseClient,
  table: string,
  column: string,
  values: string[],
  counts: Counts,
): Promise<string | null> {
  if (values.length === 0) { counts[`${table}(${column})`] = 0; return null }
  let total = 0
  for (let i = 0; i < values.length; i += 100) {
    const { error, count } = await client
      .from(table)
      .delete({ count: 'exact' })
      .in(column, values.slice(i, i + 100))
    if (error) return `${table}(${column}): ${error.message}`
    total += count ?? 0
  }
  counts[`${table}(${column})`] = total
  return null
}

/** Remove all files under a storage prefix. Best-effort; returns file count. */
async function cleanBucketPrefix(
  client: SupabaseClient,
  bucket: string,
  prefix: string,
): Promise<number> {
  try {
    const { data } = await client.storage.from(bucket).list(prefix, { limit: 1000 })
    if (!data || data.length === 0) return 0
    const paths = data.map((f: { name: string }) => `${prefix}/${f.name}`)
    await client.storage.from(bucket).remove(paths)
    return paths.length
  } catch {
    return 0
  }
}

// ── Route handler ────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const auth = await requireAdminFromRequest(req)
  if (!auth.ok) return auth.response

  let body: Body = {}
  try {
    body = (await req.json()) as Body
  } catch {
    return NextResponse.json({ ok: false, error: 'invalid JSON' }, { status: 400 })
  }

  const userId = (body.user_id ?? '').trim()
  if (!userId) return NextResponse.json({ ok: false, error: 'missing user_id' }, { status: 400 })
  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
  if (!UUID_RE.test(userId)) return NextResponse.json({ ok: false, error: 'invalid user_id' }, { status: 400 })
  if (body.confirm !== true) return NextResponse.json({ ok: false, error: 'missing confirm' }, { status: 400 })

  const mode = body.mode ?? 'anonymize'
  const reason = (body.reason ?? '').trim()

  if (mode === 'anonymize' && reason.length < 10) {
    return NextResponse.json(
      { ok: false, error: 'anonymize requires reason (min 10 characters)' },
      { status: 400 },
    )
  }

  // Hard delete requires a reason (min 15 chars)
  if (mode === 'hard' && reason.length < 15) {
    return NextResponse.json(
      { ok: false, error: 'hard delete requires reason (min 15 characters)' },
      { status: 400 },
    )
  }

  const db = auth.admin
  const targetProfile = await fetchUserProfileSnapshot(db, userId)

  // ── ANONYMIZE MODE ────────────────────────────────────────────
  if (mode === 'anonymize') {
    const anonUsername = `deleted-${userId.slice(0, 8)}`
    const auditRow = await logUserModerationAction({
      admin: db,
      actorId: auth.user.id,
      targetUserId: userId,
      action: 'user_anonymize',
      reason,
      strict: true,
      fallbackReasonSuffix: `replacement_username:${anonUsername}`,
      metadata: {
        source: 'admin_users',
        target_profile: targetProfile,
        replacement_username: anonUsername,
      },
    })

    const { error: profileErr } = await db
      .from('profiles')
      .update({
        username: anonUsername,
        display_name: '[נמחק]',
        bio: null,
        avatar_url: null,
        is_anonymous: true,
        birthdate: null,
        show_online_status: false,
        personal_is_shared: false,
        personal_about: null,
        personal_age: null,
        personal_occupation: null,
        personal_writing_about: null,
        personal_books: null,
        personal_favorite_category: null,
        personal_updated_at: new Date().toISOString(),
      })
      .eq('id', userId)

    if (profileErr) {
      return NextResponse.json(
        { ok: false, error: `profile anonymize: ${profileErr.message}` },
        { status: 500 },
      )
    }

    // Mark banned to block login (RLS + SuspensionSync enforce this)
    await db
      .from('user_moderation')
      .upsert(
        {
          user_id: userId,
          is_banned: true,
          ban_reason: 'account deleted (anonymized)',
          banned_at: new Date().toISOString(),
          banned_by: auth.user.id,
          is_suspended: false,
          reason: null,
          suspended_at: null,
          suspended_by: null,
          updated_at: new Date().toISOString(),
        } as never,
        { onConflict: 'user_id' },
      )

    // Remove avatar (PII)
    await cleanBucketPrefix(db, 'avatars', userId)

    if (auditRow.id && auditRow.metadataPersisted) {
      await db
        .from('moderation_actions')
        .update({
          metadata: {
            source: 'admin_users',
            target_profile: targetProfile,
            replacement_username: anonUsername,
            avatar_removed: true,
          },
        } as never)
        .eq('id', auditRow.id)
    }

    return NextResponse.json({ ok: true, mode: 'anonymize', username: anonUsername })
  }

  // ── HARD DELETE MODE ──────────────────────────────────────────

  // Extract request metadata
  const requestIp = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    ?? req.headers.get('x-real-ip')
    ?? 'unknown'
  const userAgent = req.headers.get('user-agent') ?? 'unknown'

  // MANDATORY: insert moderation_actions log BEFORE any deletion.
  // If this fails, abort immediately — no deletion without audit trail.
  let logRowId: string | null = null
  let logMetadataPersisted = false
  try {
    const auditRow = await logUserModerationAction({
      admin: db,
      actorId: auth.user.id,
      targetUserId: userId,
      action: 'hard_delete_user',
      reason,
      strict: true,
      fallbackReasonSuffix: `ip:${requestIp} | ua:${userAgent.slice(0, 120)}`,
      metadata: {
        source: 'admin_users',
        target_profile: targetProfile,
        request_ip: requestIp,
        user_agent: userAgent,
      },
    })
    logRowId = auditRow.id
    logMetadataPersisted = auditRow.metadataPersisted
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: `moderation log failed — aborting: ${error instanceof Error ? error.message : 'unknown error'}`,
      },
      { status: 500 },
    )
  }

  const counts: Counts = {}
  let err: string | null

  // Phase 0: Fetch user's post IDs
  const { data: userPosts, error: postsErr } = await db
    .from('posts')
    .select('id, slug, title, cover_image_url, status, published_at, created_at, is_anonymous')
    .eq('author_id', userId)

  if (postsErr) {
    return NextResponse.json(
      { ok: false, error: `fetch posts: ${postsErr.message}` },
      { status: 500 },
    )
  }
  const postRows = ((userPosts ?? []) as Array<{ id: string; cover_image_url?: string | null }>)
    .map((post) => ({
      id: typeof post.id === 'string' ? post.id : '',
      slug: typeof (post as { slug?: string | null }).slug === 'string' ? (post as { slug?: string | null }).slug ?? null : null,
      title: typeof (post as { title?: string | null }).title === 'string' ? (post as { title?: string | null }).title ?? null : null,
      cover_image_url: typeof post.cover_image_url === 'string' ? post.cover_image_url : null,
      status: typeof (post as { status?: string | null }).status === 'string' ? (post as { status?: string | null }).status ?? null : null,
      published_at: typeof (post as { published_at?: string | null }).published_at === 'string' ? (post as { published_at?: string | null }).published_at ?? null : null,
      created_at: typeof (post as { created_at?: string | null }).created_at === 'string' ? (post as { created_at?: string | null }).created_at ?? null : null,
      is_anonymous: typeof (post as { is_anonymous?: boolean | null }).is_anonymous === 'boolean' ? (post as { is_anonymous?: boolean | null }).is_anonymous ?? null : null,
    }))
    .filter((post) => post.id)
  const postIds = postRows.map((post) => post.id)

  // Phase 0b: Fetch comment IDs on user's posts (for comment_likes cleanup)
  let commentIdsOnPosts: string[] = []
  if (postIds.length > 0) {
    const collected: string[] = []
    for (let i = 0; i < postIds.length; i += 100) {
      const { data: cData, error: cErr } = await db
        .from('comments')
        .select('id')
        .in('post_id', postIds.slice(i, i + 100))
      if (cErr) {
        return NextResponse.json(
          { ok: false, error: `fetch comments: ${cErr.message}` },
          { status: 500 },
        )
      }
      if (cData) collected.push(...cData.map((c: { id: string }) => c.id))
    }
    commentIdsOnPosts = collected
  }

  // Phase 0c: Fetch community note IDs
  const { data: noteData, error: noteErr } = await db
    .from('community_notes')
    .select('id')
    .eq('user_id', userId)

  if (noteErr) {
    return NextResponse.json(
      { ok: false, error: `fetch notes: ${noteErr.message}` },
      { status: 500 },
    )
  }
  const noteIds = (noteData ?? []).map((n: { id: string }) => n.id)

  const precomputedStorage: Record<string, number> = {}
  precomputedStorage.avatars = await cleanBucketPrefix(db, 'avatars', userId)
  let precomputedAssetCount = 0
  let precomputedCoverCount = 0
  for (const post of postRows) {
    try {
      const counts = await cleanupPostOwnedAssets(db, {
        authorId: userId,
        postId: post.id,
        coverImageUrl: post.cover_image_url,
      })
      precomputedAssetCount += counts.postAssets
      precomputedCoverCount += counts.postCovers
    } catch (error) {
      return NextResponse.json(
        { ok: false, error: error instanceof Error ? error.message : 'storage cleanup failed' },
        { status: 500 },
      )
    }
  }
  precomputedStorage['post-assets'] = precomputedAssetCount
  precomputedStorage['post-covers'] = precomputedCoverCount

  // ── Phase 1: Others' interactions on user's posts ──────────────

  err = await deleteIn(db, 'comment_likes', 'comment_id', commentIdsOnPosts, counts)
  if (err) return NextResponse.json({ ok: false, error: err }, { status: 500 })

  for (let i = 0; i < postIds.length; i += 100) {
    const ids = postIds.slice(i, i + 100)
    const { error, count } = await db
      .from('notifications')
      .delete({ count: 'exact' })
      .eq('entity_type', 'post')
      .in('entity_id', ids)
    if (error) {
      return NextResponse.json(
        { ok: false, error: `notifications(entity_id): ${error.message}` },
        { status: 500 },
      )
    }
    counts['notifications(entity_id)'] = (counts['notifications(entity_id)'] ?? 0) + (count ?? 0)
  }

  err = await deleteIn(db, 'comments', 'post_id', postIds, counts)
  if (err) return NextResponse.json({ ok: false, error: err }, { status: 500 })

  err = await deleteIn(db, 'post_reaction_votes', 'post_id', postIds, counts)
  if (err) return NextResponse.json({ ok: false, error: err }, { status: 500 })

  err = await deleteIn(db, 'post_votes', 'post_id', postIds, counts)
  if (err) return NextResponse.json({ ok: false, error: err }, { status: 500 })

  err = await deleteIn(db, 'post_bookmarks', 'post_id', postIds, counts)
  if (err) return NextResponse.json({ ok: false, error: err }, { status: 500 })

  err = await deleteIn(db, 'post_tags', 'post_id', postIds, counts)
  if (err) return NextResponse.json({ ok: false, error: err }, { status: 500 })

  // ── Phase 2: User's own interactions ───────────────────────────

  err = await deleteEq(db, 'comment_likes', 'user_id', userId, counts)
  if (err) return NextResponse.json({ ok: false, error: err }, { status: 500 })

  err = await deleteEq(db, 'post_reaction_votes', 'voter_id', userId, counts)
  if (err) return NextResponse.json({ ok: false, error: err }, { status: 500 })

  err = await deleteEq(db, 'post_votes', 'voter_id', userId, counts)
  if (err) return NextResponse.json({ ok: false, error: err }, { status: 500 })

  err = await deleteEq(db, 'user_follows', 'follower_id', userId, counts)
  if (err) return NextResponse.json({ ok: false, error: err }, { status: 500 })

  err = await deleteEq(db, 'user_follows', 'following_id', userId, counts)
  if (err) return NextResponse.json({ ok: false, error: err }, { status: 500 })

  err = await deleteEq(db, 'notifications', 'user_id', userId, counts)
  if (err) return NextResponse.json({ ok: false, error: err }, { status: 500 })

  err = await deleteEq(db, 'notifications', 'actor_id', userId, counts)
  if (err) return NextResponse.json({ ok: false, error: err }, { status: 500 })

  err = await deleteEq(db, 'conversation_members', 'user_id', userId, counts)
  if (err) return NextResponse.json({ ok: false, error: err }, { status: 500 })

  err = await deleteEq(db, 'messages', 'sender_id', userId, counts)
  if (err) return NextResponse.json({ ok: false, error: err }, { status: 500 })

  // ── Phase 3: Community notes ───────────────────────────────────

  err = await deleteEq(db, 'community_notes_moderation_log', 'note_user_id', userId, counts)
  if (err) return NextResponse.json({ ok: false, error: err }, { status: 500 })

  err = await deleteIn(db, 'community_notes_moderation_log', 'note_id', noteIds, counts)
  if (err) return NextResponse.json({ ok: false, error: err }, { status: 500 })

  err = await deleteEq(db, 'community_notes', 'user_id', userId, counts)
  if (err) return NextResponse.json({ ok: false, error: err }, { status: 500 })

  // ── Phase 4: Storage cleanup (before deleting post rows) ───────

  const storage: Record<string, number> = {
    avatars: precomputedStorage.avatars ?? 0,
    'post-assets': precomputedStorage['post-assets'] ?? 0,
    'post-covers': precomputedStorage['post-covers'] ?? 0,
  }

  // ── Phase 5: Posts ─────────────────────────────────────────────

  if (postRows.length > 0) {
    const deletionAuditIso = new Date().toISOString()
    try {
      for (let i = 0; i < postRows.length; i += 100) {
        const chunkRows = postRows.slice(i, i + 100)
        await db.from('deletion_events').insert(
          chunkRows.map((post) => ({
            action: 'admin_hard_delete',
            actor_user_id: auth.user.id,
            actor_kind: 'admin',
            target_post_id: post.id,
            post_snapshot: {
              title: post.title,
              slug: post.slug,
              author_id: userId,
              status: post.status,
              published_at: post.published_at,
              is_anonymous: post.is_anonymous,
              created_at: post.created_at,
            },
            reason,
            created_at: deletionAuditIso,
          })),
        )
      }
    } catch {
      // best effort
    }
  }

  err = await deleteEq(db, 'posts', 'author_id', userId, counts)
  if (err) return NextResponse.json({ ok: false, error: err }, { status: 500 })

  revalidatePath('/')
  revalidatePath('/c/release')
  revalidatePath('/c/stories')
  revalidatePath('/c/magazine')
  revalidatePath('/sitemap.xml')
  for (const post of postRows) {
    if (post.slug) revalidatePath(`/post/${post.slug}`)
  }

  // ── Phase 6: Profile ──────────────────────────────────────────

  err = await deleteEq(db, 'profiles', 'id', userId, counts)
  if (err) return NextResponse.json({ ok: false, error: err }, { status: 500 })

  // ── Phase 7: Auth user (last — no FK deps remain) ─────────────

  const { error: delErr } = await db.auth.admin.deleteUser(userId)
  if (delErr) {
    return NextResponse.json(
      { ok: false, error: `auth.deleteUser: ${delErr.message}`, partial_cleanup: counts },
      { status: 500 },
    )
  }
  counts['auth.users'] = 1

  if (logRowId) {
    if (logMetadataPersisted) {
      await db
        .from('moderation_actions')
        .update({
          metadata: {
            source: 'admin_users',
            target_profile: targetProfile,
            request_ip: requestIp,
            user_agent: userAgent,
            counts,
            storage,
          },
        } as never)
        .eq('id', logRowId)
    } else {
      await db
        .from('moderation_actions')
        .update({
          reason: `${reason} | counts:${JSON.stringify(counts)} | storage:${JSON.stringify(storage)}`,
        })
        .eq('id', logRowId)
    }
  }

  return NextResponse.json({ ok: true, mode: 'hard', counts, storage })
}

import { NextRequest, NextResponse } from 'next/server'
import type { SupabaseClient } from '@supabase/supabase-js'
import { requireAdminFromRequest } from '@/lib/admin/requireAdminFromRequest'

type Body = {
  user_id?: string
  confirm?: boolean
  /** "anonymize" (default) = scrub PII + ban; "hard" = full cascade delete */
  mode?: 'anonymize' | 'hard'
  /** Required for mode="hard". Min 15 characters. */
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
  if (body.confirm !== true) return NextResponse.json({ ok: false, error: 'missing confirm' }, { status: 400 })

  const mode = body.mode ?? 'anonymize'
  const reason = (body.reason ?? '').trim()

  // Hard delete requires a reason (min 15 chars)
  if (mode === 'hard' && reason.length < 15) {
    return NextResponse.json(
      { ok: false, error: 'hard delete requires reason (min 15 characters)' },
      { status: 400 },
    )
  }

  // Safety gate: must be suspended first
  const { data: mod, error: mErr } = await auth.admin
    .from('user_moderation')
    .select('is_suspended')
    .eq('user_id', userId)
    .maybeSingle()

  if (mErr) return NextResponse.json({ ok: false, error: mErr.message }, { status: 500 })
  if (!mod?.is_suspended) {
    return NextResponse.json({ ok: false, error: 'user must be suspended before delete' }, { status: 400 })
  }

  const db = auth.admin

  // ── ANONYMIZE MODE ────────────────────────────────────────────
  if (mode === 'anonymize') {
    const anonUsername = `deleted-${userId.slice(0, 8)}`

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
      .update({
        is_banned: true,
        ban_reason: 'account deleted (anonymized)',
        banned_at: new Date().toISOString(),
        banned_by: auth.user.id,
        is_suspended: false,
        updated_at: new Date().toISOString(),
      })
      .eq('user_id', userId)

    // Remove avatar (PII)
    await cleanBucketPrefix(db, 'avatars', userId)

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
  // NOTE: moderation_actions has no metadata column; counts are returned in API
  // response. To persist counts, add a `metadata jsonb` column to this table.
  const { data: logRow, error: logErr } = await db
    .from('moderation_actions')
    .insert({
      actor_id: auth.user.id,
      target_user_id: userId,
      action: 'hard_delete_user',
      reason: `${reason} | ip:${requestIp} | ua:${userAgent.slice(0, 120)}`,
    })
    .select('id')
    .single()

  if (logErr || !logRow) {
    return NextResponse.json(
      { ok: false, error: `moderation log failed — aborting: ${logErr?.message ?? 'no row returned'}` },
      { status: 500 },
    )
  }

  const counts: Counts = {}
  let err: string | null

  // Phase 0: Fetch user's post IDs
  const { data: userPosts, error: postsErr } = await db
    .from('posts')
    .select('id')
    .eq('author_id', userId)

  if (postsErr) {
    return NextResponse.json(
      { ok: false, error: `fetch posts: ${postsErr.message}` },
      { status: 500 },
    )
  }
  const postIds = (userPosts ?? []).map((p: { id: string }) => p.id)

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

  // ── Phase 1: Others' interactions on user's posts ──────────────

  err = await deleteIn(db, 'comment_likes', 'comment_id', commentIdsOnPosts, counts)
  if (err) return NextResponse.json({ ok: false, error: err }, { status: 500 })

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

  const storage: Record<string, number> = {}
  storage.avatars = await cleanBucketPrefix(db, 'avatars', userId)
  let assetCount = 0
  let coverCount = 0
  for (const postId of postIds) {
    assetCount += await cleanBucketPrefix(db, 'post-assets', `${userId}/${postId}`)
    coverCount += await cleanBucketPrefix(db, 'post-covers', `${userId}/${postId}`)
    coverCount += await cleanBucketPrefix(db, 'post-covers', postId)
  }
  storage['post-assets'] = assetCount
  storage['post-covers'] = coverCount

  // ── Phase 5: Posts ─────────────────────────────────────────────

  err = await deleteEq(db, 'posts', 'author_id', userId, counts)
  if (err) return NextResponse.json({ ok: false, error: err }, { status: 500 })

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

  // Best-effort: update moderation_actions log with final counts
  await db
    .from('moderation_actions')
    .update({
      reason: `${reason} | counts:${JSON.stringify(counts)} | storage:${JSON.stringify(storage)}`,
    })
    .eq('id', (logRow as { id: string }).id)

  return NextResponse.json({ ok: true, mode: 'hard', counts, storage })
}

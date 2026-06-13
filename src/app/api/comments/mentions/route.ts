import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requireUserFromRequest } from '@/lib/auth/requireUserFromRequest'
import { rejectLargeRequestBody } from '@/lib/requestBodyLimit'
import { getClientIp } from '@/lib/requestRateLimit'
import { rateLimit } from '@/lib/rateLimit'

const MAX_REQUEST_BODY_BYTES = 4096
const MAX_MENTIONS_PER_COMMENT = 8
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const USERNAME_MENTION_RE = /(^|[^a-zA-Z0-9_])@([a-z0-9_]{3,20})(?=$|[^a-zA-Z0-9_])/gi
const NO_STORE_HEADERS = { 'Cache-Control': 'no-store' }

type CommentRow = {
  id: string
  author_id: string
  post_id: string
  content: string
  parent_comment_id: string | null
}

type PostRow = {
  id: string
  slug: string | null
  title: string | null
  status: string | null
  deleted_at?: string | null
}

type ProfileRow = {
  id: string
  username: string | null
  display_name: string | null
  avatar_url: string | null
  is_anonymous?: boolean | null
}

type ModerationRow = {
  user_id: string
  is_suspended: boolean | null
  is_banned: boolean | null
}

function serviceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return null
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

function stringValue(value: unknown): string | null {
  return typeof value === 'string' ? value : null
}

function uniqueStrings(values: string[]): string[] {
  const seen = new Set<string>()
  const result: string[] = []
  for (const value of values) {
    if (seen.has(value)) continue
    seen.add(value)
    result.push(value)
  }
  return result
}

function selectedMentionIds(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return uniqueStrings(
    value
      .filter((item): item is string => typeof item === 'string' && UUID_RE.test(item))
      .slice(0, MAX_MENTIONS_PER_COMMENT),
  )
}

function extractMentionUsernames(content: string): string[] {
  const matches: string[] = []
  for (const match of content.matchAll(USERNAME_MENTION_RE)) {
    const username = match[2]?.toLowerCase()
    if (username) matches.push(username)
  }
  return uniqueStrings(matches).slice(0, MAX_MENTIONS_PER_COMMENT)
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function contentContainsMentionLabel(content: string, label: string): boolean {
  const trimmed = label.trim()
  if (!trimmed) return false
  const re = new RegExp(`(^|[^\\p{L}\\p{N}_])@${escapeRegExp(trimmed)}(?=$|[^\\p{L}\\p{N}_])`, 'iu')
  return re.test(content)
}

function rateLimited(retryAfterMs: number) {
  return NextResponse.json(
    { ok: false, error: { code: 'rate_limited' } },
    {
      status: 429,
      headers: {
        ...NO_STORE_HEADERS,
        'Retry-After': String(Math.max(1, Math.ceil(retryAfterMs / 1000))),
      },
    },
  )
}

export async function POST(req: NextRequest) {
  const auth = await requireUserFromRequest(req)
  if (!auth.ok) return auth.response

  const tooLarge = rejectLargeRequestBody(req, MAX_REQUEST_BODY_BYTES)
  if (tooLarge) return tooLarge

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ ok: false, error: { code: 'bad_json' } }, { status: 400, headers: NO_STORE_HEADERS })
  }

  if (!isRecord(body)) {
    return NextResponse.json({ ok: false, error: { code: 'bad_request' } }, { status: 400, headers: NO_STORE_HEADERS })
  }

  const commentId = stringValue(body.comment_id)
  if (!commentId || !UUID_RE.test(commentId)) {
    return NextResponse.json({ ok: false, error: { code: 'invalid_comment_id' } }, { status: 400, headers: NO_STORE_HEADERS })
  }

  const ip = getClientIp(req)
  const [userLimit, ipLimit] = await Promise.all([
    rateLimit(`comment-mentions:user:${auth.user.id}`, { maxRequests: 20, windowMs: 60_000 }),
    rateLimit(`comment-mentions:ip:${ip}`, { maxRequests: 80, windowMs: 60_000 }),
  ])
  if (!userLimit.allowed) return rateLimited(userLimit.retryAfterMs)
  if (!ipLimit.allowed) return rateLimited(ipLimit.retryAfterMs)

  const { data: commentData, error: commentError } = await auth.supabase
    .from('comments')
    .select('id, author_id, post_id, content, parent_comment_id')
    .eq('id', commentId)
    .maybeSingle()

  if (commentError) {
    return NextResponse.json({ ok: false, error: { code: 'comment_lookup_failed' } }, { status: 500, headers: NO_STORE_HEADERS })
  }

  const comment = commentData as CommentRow | null
  if (!comment) {
    return NextResponse.json({ ok: false, error: { code: 'comment_not_found' } }, { status: 404, headers: NO_STORE_HEADERS })
  }

  if (comment.author_id !== auth.user.id) {
    return NextResponse.json({ ok: false, error: { code: 'forbidden' } }, { status: 403, headers: NO_STORE_HEADERS })
  }

  const usernames = extractMentionUsernames(comment.content)
  const requestedIds = selectedMentionIds(body.mention_user_ids)
  if (usernames.length === 0 && requestedIds.length === 0) {
    return NextResponse.json({ ok: true, notified: 0 }, { headers: NO_STORE_HEADERS })
  }

  const service = serviceClient()
  if (!service) {
    return NextResponse.json({ ok: false, error: { code: 'server_not_configured' } }, { status: 500, headers: NO_STORE_HEADERS })
  }

  const { data: postData, error: postError } = await service
    .from('posts')
    .select('id, slug, title, status, deleted_at')
    .eq('id', comment.post_id)
    .maybeSingle()

  if (postError) {
    return NextResponse.json({ ok: false, error: { code: 'post_lookup_failed' } }, { status: 500, headers: NO_STORE_HEADERS })
  }

  const post = postData as PostRow | null
  if (!post || post.status !== 'published' || post.deleted_at) {
    return NextResponse.json({ ok: true, notified: 0 }, { headers: NO_STORE_HEADERS })
  }

  const profileMap = new Map<string, ProfileRow>()
  const select = 'id, username, display_name, avatar_url, is_anonymous'

  if (usernames.length > 0) {
    const { data, error } = await service
      .from('profiles_public')
      .select(select)
      .in('username', usernames)

    if (error) {
      return NextResponse.json({ ok: false, error: { code: 'profile_lookup_failed' } }, { status: 500, headers: NO_STORE_HEADERS })
    }

    for (const row of (data ?? []) as ProfileRow[]) {
      if (row.id) profileMap.set(row.id, row)
    }
  }

  if (requestedIds.length > 0) {
    const { data, error } = await service
      .from('profiles_public')
      .select(select)
      .in('id', requestedIds)

    if (error) {
      return NextResponse.json({ ok: false, error: { code: 'profile_lookup_failed' } }, { status: 500, headers: NO_STORE_HEADERS })
    }

    for (const row of (data ?? []) as ProfileRow[]) {
      if (row.id) profileMap.set(row.id, row)
    }
  }

  const candidateIds = Array.from(profileMap.keys())
  if (candidateIds.length === 0) {
    return NextResponse.json({ ok: true, notified: 0 }, { headers: NO_STORE_HEADERS })
  }

  const { data: moderationRows } = await service
    .from('user_moderation')
    .select('user_id, is_suspended, is_banned')
    .in('user_id', candidateIds)

  const blocked = new Set(
    ((moderationRows ?? []) as ModerationRow[])
      .filter((row) => row.is_suspended === true || row.is_banned === true)
      .map((row) => row.user_id),
  )

  const recipients = candidateIds
    .map((id) => profileMap.get(id))
    .filter((profile): profile is ProfileRow => {
      if (!profile?.id || !profile.username) return false
      if (profile.id === auth.user.id) return false
      if (profile.is_anonymous === true) return false
      if (blocked.has(profile.id)) return false
      return (
        contentContainsMentionLabel(comment.content, profile.username) ||
        (!!profile.display_name && contentContainsMentionLabel(comment.content, profile.display_name))
      )
    })
    .slice(0, MAX_MENTIONS_PER_COMMENT)

  if (recipients.length === 0) {
    return NextResponse.json({ ok: true, notified: 0 }, { headers: NO_STORE_HEADERS })
  }

  const rows = recipients.map((profile) => ({
    user_id: profile.id,
    actor_id: auth.user.id,
    type: 'comment',
    entity_type: 'comment',
    entity_id: comment.id,
    payload: {
      action: 'comment_mention',
      post_id: comment.post_id,
      post_slug: post.slug ?? '',
      post_title: post.title ?? '',
      comment_id: comment.id,
      parent_comment_id: comment.parent_comment_id,
      mention_username: profile.username,
      mention_display_name: profile.display_name,
      from_user_id: auth.user.id,
      comment_text: comment.content.slice(0, 280),
    },
    is_read: false,
    read_at: null,
  }))

  const { error: insertError } = await service
    .from('notifications')
    .upsert(rows, { onConflict: 'user_id,type,actor_id,entity_id' })

  if (insertError) {
    return NextResponse.json({ ok: false, error: { code: 'notification_insert_failed' } }, { status: 500, headers: NO_STORE_HEADERS })
  }

  return NextResponse.json({ ok: true, notified: rows.length }, { headers: NO_STORE_HEADERS })
}

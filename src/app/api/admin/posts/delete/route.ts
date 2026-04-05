import type { NextRequest } from "next/server"
import type { SupabaseClient } from "@supabase/supabase-js"
import { revalidatePath } from "next/cache"
import { requireAdminFromRequest } from "@/lib/admin/requireAdminFromRequest"
import { adminError, adminOk } from "@/lib/admin/adminHttp"
import { copyPublicCoverToPrivate, removePostCoverPublicObject } from "@/lib/storage/postCoverLifecycle"
import { removePublishedPostInlineImages } from "@/lib/storage/postInlineLifecycle"
import { revalidatePublicProfileForUserId } from "@/lib/revalidatePublicProfile"

const MAX_REASON_LEN = 500

type PostRow = {
  id: string
  author_id: string
  title: string | null
  slug: string | null
  cover_image_url: string | null
  status: string | null
  published_at: string | null
  deleted_at: string | null
  moderated_at: string | null
  channel_id: string | null
  is_anonymous: boolean | null
  created_at: string | null
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === "object" && !Array.isArray(v)
}

function pickString(obj: unknown, key: string): string {
  if (!isRecord(obj)) return ""
  const v = obj[key]
  return typeof v === "string" ? v.trim() : ""
}

export async function POST(req: NextRequest) {
  const auth = await requireAdminFromRequest(req)
  if (!auth.ok) return auth.response

  // Use a non-generic SupabaseClient here to avoid `never` explosions in admin routes.
  const sb = auth.admin as unknown as SupabaseClient

  const body: unknown = await req.json().catch(() => null)

  const postId = pickString(body, "post_id")
  const reason = pickString(body, "reason")

  if (!postId) return adminError("Missing post_id", 400, "bad_request")
  if (!reason || reason.length < 3) return adminError("Reason must be at least 3 characters.", 400, "bad_request")
  if (reason.length > MAX_REASON_LEN) return adminError("Reason is too long.", 400, "bad_request")

  // Load post (need author + title + previous state)
  const { data: postRaw, error: postErr } = await sb
    .from("posts")
    .select("id, author_id, title, slug, cover_image_url, status, published_at, deleted_at, moderated_at, channel_id, is_anonymous, created_at")
    .eq("id", postId)
    .maybeSingle()

  if (postErr) return adminError(postErr.message, 500, "db_error")

  const post = postRaw as unknown as PostRow | null
  if (!post) return adminError("Post not found", 404, "not_found")
  if (post.deleted_at) return adminError("Post already soft-deleted by user.", 400, "bad_request")
  if (post.moderated_at) return adminError("Post already moderated/hidden by admin.", 400, "bad_request")

  const now = new Date().toISOString()
  let coverWarning: string | null = null
  let inlineWarning: string | null = null
  let removedPublicInlineImages = 0
  let quarantinedCover: Awaited<ReturnType<typeof copyPublicCoverToPrivate>>
  try {
    quarantinedCover = await copyPublicCoverToPrivate(sb, {
      authorId: post.author_id,
      postId: post.id,
      coverImageUrl: post.cover_image_url,
    })
  } catch (error) {
    return adminError(
      error instanceof Error ? error.message : "Cover quarantine failed",
      500,
      "cover_quarantine_failed",
    )
  }

  // Admin soft-hide (NOT user trash):
  // - keep deleted_at NULL
  // - set status='moderated' and published_at NULL
  // - store previous values for admin-only restore
  const updatePayload = {
    moderated_at: now,
    moderated_by: auth.user.id,
    moderated_reason: reason,
    prev_status: post.status,
    prev_published_at: post.published_at,
    status: "moderated",
    published_at: null,
    cover_image_url: quarantinedCover?.privatePath ?? post.cover_image_url,
    updated_at: now,
  }

  const { error: updErr } = await sb.from("posts").update(updatePayload).eq("id", postId)
  if (updErr) return adminError(updErr.message, 500, "db_error")

  if (quarantinedCover) {
    try {
      await removePostCoverPublicObject(sb, quarantinedCover.publicPath)
    } catch (error) {
      coverWarning = error instanceof Error ? error.message : "Public cover cleanup failed"
    }
  }

  try {
    removedPublicInlineImages = await removePublishedPostInlineImages(sb, post.id)
  } catch (error) {
    inlineWarning = error instanceof Error ? error.message : "Public inline cleanup failed"
  }

  // Invalidate ISR cache for all public post lists immediately.
  revalidatePath("/")
  revalidatePath("/c/release")
  revalidatePath("/c/stories")
  revalidatePath("/c/magazine")
  if (post.slug) revalidatePath(`/post/${post.slug}`)
  await revalidatePublicProfileForUserId(sb, post.author_id)

  // Notify post author (system notification) - best effort
  const notifPayload = {
    post_id: post.id,
    post_title: post.title,
    post_slug: post.slug,
    reason,
  }

  const { error: notifErr } = await sb.from("notifications").insert({
    user_id: post.author_id,
    actor_id: null,
    type: "post_deleted",
    entity_type: "post",
    entity_id: post.id,
    payload: notifPayload,
    is_read: false,
    created_at: now,
  })

  if (notifErr) {
    return adminOk({
      removed_public_inline_images: removedPublicInlineImages,
      warning: [coverWarning, inlineWarning, `Notification warning: ${notifErr.message}`]
        .filter(Boolean)
        .join(". "),
    })
  }

  // Audit: deletion_events (immutable history)
  try {
    await sb.from("deletion_events").insert({
      action: "admin_soft_hide",
      actor_user_id: auth.user.id,
      actor_kind: "admin",
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
      created_at: now,
    })
  } catch {
    // best effort
  }

  // Audit: moderation_actions (legacy, keep for backward compat)
  try {
    await sb.from("moderation_actions").insert({
      actor_id: auth.user.id,
      target_user_id: post.author_id,
      post_id: post.id,
      action: "post_hidden",
      reason,
      created_at: now,
    })
  } catch {
    // ignore
  }

  const warnings = [coverWarning, inlineWarning].filter(Boolean)
  return adminOk({
    removed_public_inline_images: removedPublicInlineImages,
    ...(warnings.length > 0 ? { warning: warnings.join(". ") } : {}),
  })
}

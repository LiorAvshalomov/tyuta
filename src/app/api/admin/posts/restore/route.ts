import type { NextRequest } from "next/server"
import { revalidatePath } from "next/cache"
import { requireAdminFromRequest } from "@/lib/admin/requireAdminFromRequest"
import { adminError, adminOk } from "@/lib/admin/adminHttp"
import { promotePrivateCoverToPublic, removePostAssetObject } from "@/lib/storage/postCoverLifecycle"
import {
  removePublishedPostInlineImages,
  syncPublishedPostInlineImages,
} from "@/lib/storage/postInlineLifecycle"
import { revalidatePublicProfileForUserId } from "@/lib/revalidatePublicProfile"

function pickString(body: unknown, key: string): string {
  if (!body || typeof body !== "object") return ""
  const v = (body as Record<string, unknown>)[key]
  return typeof v === "string" ? v.trim() : ""
}

type PostRestoreRow = {
  id: string
  author_id: string
  slug: string | null
  status: string | null
  cover_image_url: string | null
  content_json: unknown
  deleted_at: string | null
  moderated_at: string | null
  prev_status: string | null
  prev_published_at: string | null
}

export async function POST(req: NextRequest) {
  const auth = await requireAdminFromRequest(req)
  if (!auth.ok) return auth.response

  const body: unknown = await req.json().catch(() => null)
  const postId = pickString(body, "post_id")
  if (!postId) return adminError("Missing post_id", 400, "bad_request")

  const { data, error: postErr } = await auth.admin
    .from("posts")
    .select("id, author_id, slug, status, cover_image_url, content_json, deleted_at, moderated_at, prev_status, prev_published_at")
    .eq("id", postId)
    .maybeSingle()

  if (postErr) return adminError(postErr.message, 500, "db_error")

  const post = data as unknown as PostRestoreRow | null
  if (!post) return adminError("Post not found", 404, "not_found")

  const now = new Date().toISOString()

  // Restore admin-moderated hide (soft, admin-only)
  if (post.moderated_at) {
    const status = post.prev_status ?? "draft"
    const published_at = status === "published" ? (post.prev_published_at ?? now) : null
    const privateCoverPath = status === "published" &&
      post.cover_image_url &&
      !String(post.cover_image_url).startsWith("http")
      ? post.cover_image_url
      : null
    let restoredCoverUrl = post.cover_image_url

    if (privateCoverPath) {
      try {
        const promoted = await promotePrivateCoverToPublic(auth.admin, {
          postId: post.id,
          sourcePath: privateCoverPath,
          removeSource: false,
        })
        if (!promoted.publicUrl) {
          return adminError("Cover restore failed", 500, "cover_restore_failed")
        }
        restoredCoverUrl = promoted.publicUrl
      } catch (error) {
        return adminError(
          error instanceof Error ? error.message : "Cover restore failed",
          500,
          "cover_restore_failed",
        )
      }
    }

    const { error: updErr } = await auth.admin
      .from("posts")
      .update({
        moderated_at: null,
        moderated_by: null,
        moderated_reason: null,
        prev_status: null,
        prev_published_at: null,
        status,
        published_at,
        cover_image_url: restoredCoverUrl,
        updated_at: now,
      } as never)
      .eq("id", postId)

    if (updErr) return adminError(updErr.message, 500, "db_error")
    if (privateCoverPath) {
      try {
        await removePostAssetObject(auth.admin, privateCoverPath)
      } catch {
        // best effort
      }
    }
    let inlineWarning: string | null = null
    let publicInline = { uploaded: 0, removed: 0, retained: 0 }
    try {
      publicInline = status === "published"
        ? await syncPublishedPostInlineImages(auth.admin, {
            authorId: post.author_id,
            postId: post.id,
            content: post.content_json,
          })
        : {
            uploaded: 0,
            removed: await removePublishedPostInlineImages(auth.admin, post.id),
            retained: 0,
          }
    } catch (error) {
      inlineWarning = error instanceof Error ? error.message : "Public inline sync failed"
    }
  revalidatePath("/")
  revalidatePath("/c/release")
  revalidatePath("/c/stories")
  revalidatePath("/c/magazine")
  revalidatePath("/sitemap.xml")
  if (post.slug) revalidatePath(`/post/${post.slug}`)
    await revalidatePublicProfileForUserId(auth.admin, post.author_id)
    return adminOk({
      restored: true,
      mode: "admin_soft",
      public_inline: publicInline,
      ...(inlineWarning ? { warning: inlineWarning } : {}),
    })
  }

  // Restore user trash delete
  if (post.deleted_at) {
    const shouldBePublic = post.status === "published"
    const privateCoverPath = shouldBePublic &&
      post.cover_image_url &&
      !String(post.cover_image_url).startsWith("http")
      ? post.cover_image_url
      : null
    let restoredCoverUrl = post.cover_image_url

    if (privateCoverPath) {
      try {
        const promoted = await promotePrivateCoverToPublic(auth.admin, {
          postId: post.id,
          sourcePath: privateCoverPath,
          removeSource: false,
        })
        if (!promoted.publicUrl) {
          return adminError("Cover restore failed", 500, "cover_restore_failed")
        }
        restoredCoverUrl = promoted.publicUrl
      } catch (error) {
        return adminError(
          error instanceof Error ? error.message : "Cover restore failed",
          500,
          "cover_restore_failed",
        )
      }
    }

    const { error: updErr } = await auth.admin
      .from("posts")
      .update({
        deleted_at: null,
        deleted_by: null,
        deleted_reason: null,
        cover_image_url: restoredCoverUrl,
        updated_at: now,
      } as never)
      .eq("id", postId)

    if (updErr) return adminError(updErr.message, 500, "db_error")
    if (privateCoverPath) {
      try {
        await removePostAssetObject(auth.admin, privateCoverPath)
      } catch {
        // best effort
      }
    }
    let inlineWarning: string | null = null
    let publicInline = { uploaded: 0, removed: 0, retained: 0 }
    try {
      publicInline = shouldBePublic
        ? await syncPublishedPostInlineImages(auth.admin, {
            authorId: post.author_id,
            postId: post.id,
            content: post.content_json,
          })
        : {
            uploaded: 0,
            removed: await removePublishedPostInlineImages(auth.admin, post.id),
            retained: 0,
          }
    } catch (error) {
      inlineWarning = error instanceof Error ? error.message : "Public inline sync failed"
    }
  revalidatePath("/")
  revalidatePath("/c/release")
  revalidatePath("/c/stories")
  revalidatePath("/c/magazine")
  revalidatePath("/sitemap.xml")
  if (post.slug) revalidatePath(`/post/${post.slug}`)
    await revalidatePublicProfileForUserId(auth.admin, post.author_id)
    return adminOk({
      restored: true,
      mode: "user_soft",
      public_inline: publicInline,
      ...(inlineWarning ? { warning: inlineWarning } : {}),
    })
  }

  return adminError("Post is not deleted or moderated.", 400, "bad_request")
}

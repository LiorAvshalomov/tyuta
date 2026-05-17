/**
 * Admin UI helpers.
 *
 * Admin API returns (by convention):
 *   success: { ok: true, ... }
 *   error:   { ok: false, error: { code: string, message: string }, ... }
 *
 * But older routes/components might still return `error: string`.
 */

import { mapUserFacingError } from "@/lib/mapSupabaseError"

export function getAdminErrorMessage(payload: unknown, fallback = "שגיאה"): string {
  if (!payload || typeof payload !== "object") return fallback

  const obj = payload as Record<string, unknown>
  const err = obj.error

  if (typeof err === "object" && err !== null) {
    const msg = (err as Record<string, unknown>).message
    if (typeof msg === "string" && msg.trim().length > 0) return mapUserFacingError(msg, fallback)
  }

  if (typeof err === "string" && err.trim().length > 0) return mapUserFacingError(err, fallback)

  return fallback
}

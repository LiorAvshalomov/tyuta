import type { PostgrestError } from '@supabase/supabase-js'

/**
 * Maps known DB-level throttle errors to user-friendly Hebrew messages.
 * Returns null if the error doesn't match any known code (caller falls back to raw message).
 */

const THROTTLE_MAP: Record<string, string> = {
  comment_rate_limit: '\u23F3 נראה שכתבת הרבה בבת אחת. בוא ניקח רגע נשימה ונמשיך עוד מעט 💛',
  post_rate_limit: '\u23F3 פרסמת כמה טיוטות מהר מדי. תן למילים רגע להתיישב ואז תמשיך ✍️',
  message_rate_limit: '\u23F3 שלחת הרבה הודעות ברצף. נחכה רגע ונמשיך בשיחה 🤍',
}

const MODERATION_MAP: Record<string, string> = {
  banned_users_system_only: 'החשבון נחסם. ניתן לפנות רק לתמיכת האתר.',
  suspended_users_system_only: 'החשבון מושעה. ניתן לפנות רק לתמיכת האתר.',
  system_user_not_configured: 'תקלה זמנית במערכת. נסה שוב מאוחר יותר.',
}

export function mapSupabaseError(error: PostgrestError | null): string | null {
  if (!error) return null

  const msg = error.message ?? ''
  for (const [code, userMsg] of Object.entries(THROTTLE_MAP)) {
    if (msg.includes(code)) return userMsg
  }

  return null
}

/**
 * Maps moderation-related RPC errors to user-friendly Hebrew messages.
 * Works on raw error message strings (not just PostgrestError).
 * Returns null if no known moderation error is found.
 */
export function mapModerationRpcError(message: string): string | null {
  for (const [code, userMsg] of Object.entries(MODERATION_MAP)) {
    if (message.includes(code)) return userMsg
  }
  return null
}

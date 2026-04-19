import type { PostgrestError } from '@supabase/supabase-js'

type SupabaseErrorLike = {
  message?: string | null
  details?: string | null
  hint?: string | null
  code?: string | null
}

/**
 * Maps known Supabase/PostgREST errors to user-friendly Hebrew messages.
 * Covers auth expiry, throttle triggers, and moderation blocks.
 */

const THROTTLE_MAP: Record<string, string> = {
  comment_rate_limit: '⏳ נראה שכתבת הרבה בבת אחת. בוא ניקח רגע ונמשיך עוד מעט.',
  post_rate_limit: '⏳ יצרת יותר מדי טיוטות בזמן קצר. נסו שוב בעוד כמה דקות.',
  message_rate_limit: '⏳ שלחת הרבה הודעות ברצף. נחכה רגע ונמשיך.',
  report_rate_limit: '⏳ נשלחו יותר מדי דיווחים בזמן קצר. נסו שוב בעוד כמה דקות.',
  follow_rate_limit: '⏳ בוצעו יותר מדי פעולות מעקב בזמן קצר. נסו שוב בעוד רגע.',
  bookmark_rate_limit: '⏳ שמרת או הסרת יותר מדי פוסטים בזמן קצר. נסו שוב בעוד רגע.',
  comment_like_rate_limit: '⏳ בוצעו יותר מדי לייקים לתגובות בזמן קצר. נסו שוב בעוד רגע.',
  reaction_rate_limit: '⏳ בוצעו יותר מדי ריאקציות בזמן קצר. נסו שוב בעוד רגע.',
  profile_update_rate_limit: '⏳ בוצעו יותר מדי עדכוני פרופיל בזמן קצר. נסו שוב בעוד כמה דקות.',
  post_edit_rate_limit: '⏳ שמרת יותר מדי שינויים בפוסט בזמן קצר. נסו שוב בעוד רגע.',
  post_tag_rate_limit: '⏳ בוצעו יותר מדי עדכוני תגיות בזמן קצר. נסו שוב בעוד רגע.',
  comment_edit_rate_limit: '⏳ ערכת יותר מדי תגובות בזמן קצר. נסו שוב בעוד רגע.',
  comment_delete_rate_limit: '⏳ מחקת יותר מדי תגובות בזמן קצר. נסו שוב בעוד רגע.',
  conversation_rate_limit: '⏳ פתחת יותר מדי שיחות בזמן קצר. נסו שוב בעוד רגע.',
  unsend_window_expired: 'לא ניתן לבטל הודעה לאחר 5 דקות משליחתה.',
  not_sender: 'לא ניתן למחוק הודעה שאינה שלך.',
  community_note_rate_limit: '⏳ פרסמת יותר מדי פתקים בזמן קצר. נסו שוב בעוד רגע.',
  notification_mutation_rate_limit: '⏳ בוצעו יותר מדי פעולות התראות בזמן קצר. נסו שוב בעוד רגע.',
  message_reaction_rate_limit: '⏳ בוצעו יותר מדי ריאקציות להודעות בזמן קצר. נסו שוב בעוד רגע.',
  avatar_upload_rate_limit: '⏳ הועלו יותר מדי תמונות פרופיל בזמן קצר. נסו שוב בעוד כמה דקות.',
  post_asset_upload_rate_limit: '⏳ הועלו יותר מדי קבצי פוסט בזמן קצר. נסו שוב בעוד רגע.',
  cover_upload_rate_limit: '⏳ הועלו יותר מדי תמונות קאבר בזמן קצר. נסו שוב בעוד רגע.',
}

const MODERATION_MAP: Record<string, string> = {
  banned_users_system_only: 'החשבון נחסם. ניתן לפנות רק לתמיכת האתר.',
  suspended_users_system_only: 'החשבון מושעה. ניתן לפנות רק לתמיכת האתר.',
  system_user_not_configured: 'תקלה זמנית במערכת. נסו שוב מאוחר יותר.',
}

export function mapSupabaseError(error: PostgrestError | SupabaseErrorLike | null): string | null {
  if (!error) return null

  const message = error.message ?? ''
  const details = error.details ?? ''
  const hint = error.hint ?? ''
  const code = error.code ?? ''
  const searchable = `${message}\n${details}\n${hint}`

  if (code === 'PGRST301' || searchable.includes('JWT expired')) {
    return 'תוקף ההתחברות פג. רעננו את הדף ונסו שוב.'
  }

  if (
    searchable.includes('invalid JWT') ||
    searchable.includes('JWSError') ||
    searchable.includes('invalid token')
  ) {
    return 'ההתחברות אינה תקינה. נסו להתנתק ולהתחבר מחדש.'
  }

  if (code === '42501' || searchable.includes('violates row-level security')) {
    return 'תוקף ההתחברות פג. רעננו את הדף ונסו שוב.'
  }

  for (const [throttleCode, userMessage] of Object.entries(THROTTLE_MAP)) {
    if (searchable.includes(throttleCode)) return userMessage
  }

  return null
}

export function mapModerationRpcError(message: string): string | null {
  for (const [code, userMessage] of Object.entries(MODERATION_MAP)) {
    if (message.includes(code)) return userMessage
  }

  return null
}

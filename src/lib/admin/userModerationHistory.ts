export const USER_HISTORY_ACTIONS = [
  'user_suspend',
  'user_unsuspend',
  'user_ban',
  'user_unban',
  'user_takedown',
  'user_restore_content',
  'user_purge_content',
  'user_anonymize',
  'hard_delete_user',
] as const

export type UserHistoryAction = (typeof USER_HISTORY_ACTIONS)[number]

const USER_HISTORY_ACTION_SET = new Set<string>(USER_HISTORY_ACTIONS)

export function isUserHistoryAction(action: string): action is UserHistoryAction {
  return USER_HISTORY_ACTION_SET.has(action)
}

export function getUserHistoryActionLabel(action: string): string {
  const labels: Record<UserHistoryAction, string> = {
    user_suspend: 'הגבלת משתמש',
    user_unsuspend: 'שחרור הגבלה',
    user_ban: 'חסימת משתמש',
    user_unban: 'הסרת חסימה',
    user_takedown: 'הסתרת תוכן',
    user_restore_content: 'שחזור תוכן מוסתר',
    user_purge_content: 'מחיקת תוכן לצמיתות',
    user_anonymize: 'אנונימיזציה',
    hard_delete_user: 'מחיקה מלאה',
  }

  return isUserHistoryAction(action) ? labels[action] : action
}

export function getUserHistoryActionClasses(action: string): string {
  const classes: Record<UserHistoryAction, string> = {
    user_suspend: 'bg-amber-50 text-amber-700 border-amber-200',
    user_unsuspend: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    user_ban: 'bg-red-50 text-red-700 border-red-200',
    user_unban: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    user_takedown: 'bg-orange-50 text-orange-700 border-orange-200',
    user_restore_content: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    user_purge_content: 'bg-red-100 text-red-800 border-red-300',
    user_anonymize: 'bg-neutral-900 text-white border-neutral-900',
    hard_delete_user: 'bg-red-100 text-red-800 border-red-300',
  }

  return isUserHistoryAction(action)
    ? classes[action]
    : 'bg-neutral-100 text-neutral-600 border-neutral-200'
}


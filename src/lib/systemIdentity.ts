export const SYSTEM_USER_ID: string = (process.env.NEXT_PUBLIC_SYSTEM_USER_ID ?? '').trim()

// Product-facing display for the system account.
export const SYSTEM_DISPLAY_NAME = 'מערכת האתר'

// Stable local asset for the system account.
export const SYSTEM_AVATAR = '/apple-touch-icon.png'

export type ResolvedIdentity = {
  displayName: string
  avatarUrl: string | null
  isSystem: boolean
}

export function resolveUserIdentity(params: {
  userId: string
  displayName?: string | null
  username?: string | null
  avatarUrl?: string | null
}): ResolvedIdentity {
  const { userId, displayName, username, avatarUrl } = params
  const isSystem = Boolean(SYSTEM_USER_ID) && userId === SYSTEM_USER_ID

  if (isSystem) {
    return {
      displayName: SYSTEM_DISPLAY_NAME,
      avatarUrl: SYSTEM_AVATAR,
      isSystem: true,
    }
  }

  return {
    displayName: (displayName ?? '').trim() || (username ?? '').trim() || 'משתמש',
    avatarUrl: avatarUrl ?? null,
    isSystem: false,
  }
}

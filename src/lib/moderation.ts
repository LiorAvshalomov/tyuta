export const MOD_SUSPENDED_KEY = 'pendemic:moderation:is_suspended'
export const MOD_BANNED_KEY = 'pendemic:moderation:is_banned'
export const MOD_REASON_KEY = 'pendemic:moderation:reason'
export const MOD_SUPPORT_CID_KEY = 'pendemic:moderation:support_conversation_id'

export type ModerationStatus = 'none' | 'suspended' | 'banned'

export function setSuspendedFlag(v: boolean): void {
  try {
    localStorage.setItem(MOD_SUSPENDED_KEY, v ? '1' : '0')
    if (!v && getBannedFlag() === false) localStorage.removeItem(MOD_REASON_KEY)
  } catch {
    // ignore
  }
}

export function getSuspendedFlag(): boolean {
  try {
    return localStorage.getItem(MOD_SUSPENDED_KEY) === '1'
  } catch {
    return false
  }
}

export function setBannedFlag(v: boolean): void {
  try {
    localStorage.setItem(MOD_BANNED_KEY, v ? '1' : '0')
    if (!v && getSuspendedFlag() === false) localStorage.removeItem(MOD_REASON_KEY)
  } catch {
    // ignore
  }
}

export function getBannedFlag(): boolean {
  try {
    return localStorage.getItem(MOD_BANNED_KEY) === '1'
  } catch {
    return false
  }
}

export function setModerationReason(reason: string | null): void {
  try {
    if (!reason) localStorage.removeItem(MOD_REASON_KEY)
    else localStorage.setItem(MOD_REASON_KEY, reason)
  } catch {
    // ignore
  }
}

export function getModerationReason(): string | null {
  try {
    return localStorage.getItem(MOD_REASON_KEY)
  } catch {
    return null
  }
}

export function setSupportConversationId(conversationId: string | null): void {
  try {
    if (!conversationId) localStorage.removeItem(MOD_SUPPORT_CID_KEY)
    else localStorage.setItem(MOD_SUPPORT_CID_KEY, conversationId)
  } catch {
    // ignore
  }
}

export function getSupportConversationId(): string | null {
  try {
    return localStorage.getItem(MOD_SUPPORT_CID_KEY)
  } catch {
    return null
  }
}

export function getModerationStatus(): ModerationStatus {
  if (getBannedFlag()) return 'banned'
  if (getSuspendedFlag()) return 'suspended'
  return 'none'
}

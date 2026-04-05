type AdminUserSearchHrefInput = {
  userId?: string | null
  displayName?: string | null
  username?: string | null
}

function normalizeQueryCandidate(value: string | null | undefined) {
  const trimmed = value?.trim() ?? ''
  return trimmed.length > 0 ? trimmed : null
}

export function buildAdminUserSearchHref({
  userId,
  displayName,
  username,
}: AdminUserSearchHrefInput) {
  const params = new URLSearchParams()
  params.set('tab', 'search')

  const preferredQuery =
    normalizeQueryCandidate(displayName) ??
    normalizeQueryCandidate(username) ??
    null

  if (preferredQuery) {
    params.set('q', preferredQuery)
  }

  if (userId) {
    params.set('focusUserId', userId)
  }

  return `/admin/users?${params.toString()}`
}

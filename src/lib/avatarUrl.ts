/** True when a src has already been routed through /api/media/avatar (legacy proxy path). */
export function isAvatarProxySrc(src: string | null | undefined): boolean {
  return (src ?? '').startsWith('/api/media/avatar')
}

export function dicebearInitialsUrl(seed: string, fallback = 'משתמש'): string {
  const normalized = seed.trim() || fallback
  return `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(normalized)}`
}

export function avatarProxySrc(url: string | null | undefined): string | null {
  const safeUrl = url?.trim()
  if (!safeUrl) return null
  if (isAvatarProxySrc(safeUrl)) return safeUrl

  const marker = '/storage/v1/object/public/'
  const idx = safeUrl.indexOf(marker)
  if (idx === -1) return safeUrl

  // Avatars live in a public bucket and already carry version params on update.
  // Serve them directly from Supabase CDN to avoid an unnecessary Vercel Function hop.
  return safeUrl
}

function absoluteUrl(baseUrl: string, pathOrUrl: string): string {
  if (pathOrUrl.startsWith('http')) return pathOrUrl
  if (!pathOrUrl.startsWith('/')) return `${baseUrl}/${pathOrUrl}`
  return `${baseUrl}${pathOrUrl}`
}

export function profileAvatarImageUrl(
  baseUrl: string,
  avatarUrl: string | null | undefined,
  seed: string,
  options: { stripQuery?: boolean } = {},
): string {
  const safeAvatar = avatarUrl?.trim()
  if (!safeAvatar) return dicebearInitialsUrl(seed)

  if (safeAvatar.startsWith('https://api.dicebear.com/7.x/initials/svg')) {
    return safeAvatar.includes('?seed=') ? safeAvatar : dicebearInitialsUrl(seed)
  }

  const cleaned = options.stripQuery ? safeAvatar.split('?')[0] : safeAvatar
  return absoluteUrl(baseUrl, cleaned)
}

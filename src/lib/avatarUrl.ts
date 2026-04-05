/** True when a src has already been routed through /api/media/avatar (legacy proxy path). */
export function isAvatarProxySrc(src: string | null | undefined): boolean {
  return (src ?? '').startsWith('/api/media/avatar')
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

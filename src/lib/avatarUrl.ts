/** True when a src has already been routed through /api/media/avatar (Supabase avatars). */
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

  const rawPath = safeUrl.slice(idx + marker.length)
  const qIdx = rawPath.indexOf('?')
  const path = qIdx === -1 ? rawPath : rawPath.slice(0, qIdx)
  const search = qIdx === -1 ? '' : rawPath.slice(qIdx + 1)
  const params = new URLSearchParams({ path })

  if (search) {
    const sourceParams = new URLSearchParams(search)
    sourceParams.forEach((value, key) => params.append(key, value))
  }

  return `/api/media/avatar?${params.toString()}`
}

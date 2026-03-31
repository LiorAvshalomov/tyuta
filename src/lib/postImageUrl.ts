/** True when a src has already been routed through /api/media/post-image. */
export function isPostImageProxySrc(src: string | null | undefined): boolean {
  return (src ?? '').startsWith('/api/media/post-image')
}

export function postImageStoragePath(
  path: string | null | undefined,
  src: string | null | undefined,
): string | null {
  const safePath = path?.trim()
  if (safePath) return safePath

  const safeSrc = src?.trim()
  if (!safeSrc || isPostImageProxySrc(safeSrc)) return null

  const markers = [
    '/storage/v1/object/sign/post-assets/',
    '/storage/v1/object/public/post-assets/',
  ]

  for (const marker of markers) {
    const idx = safeSrc.indexOf(marker)
    if (idx === -1) continue

    const rawPath = safeSrc.slice(idx + marker.length)
    const qIdx = rawPath.indexOf('?')
    const candidate = (qIdx === -1 ? rawPath : rawPath.slice(0, qIdx)).trim()
    if (candidate) return candidate
  }

  return null
}

/**
 * Convert a stable storage path from the private `post-assets` bucket into
 * a local proxy URL that can safely serve published inline post images.
 */
export function postImageProxySrc(
  path: string | null | undefined,
  postId: string | null | undefined,
): string | null {
  const safePath = path?.trim()
  const safePostId = postId?.trim()

  if (!safePath || !safePostId) return null
  if (isPostImageProxySrc(safePath)) return safePath

  const params = new URLSearchParams({ path: safePath, postId: safePostId })
  return `/api/media/post-image?${params.toString()}`
}

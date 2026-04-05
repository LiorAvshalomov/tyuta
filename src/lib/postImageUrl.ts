/** True when a src has already been routed through /api/media/post-image. */
export function isPostImageProxySrc(src: string | null | undefined): boolean {
  return (src ?? '').startsWith('/api/media/post-image')
}

const PUBLIC_POST_MEDIA_BUCKET = 'post-covers'
const INLINE_PREFIX = 'inline'

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

export function publicPostImagePath(
  privatePath: string | null | undefined,
  postId: string | null | undefined,
): string | null {
  const safePath = privatePath?.trim()
  const safePostId = postId?.trim()
  if (!safePath || !safePostId) return null

  const parts = safePath.split('/').filter(Boolean)
  if (parts.length < 3 || parts[1] !== safePostId) return null

  const suffix = parts.slice(2).join('/')
  if (!suffix) return null
  return `${safePostId}/${INLINE_PREFIX}/${suffix}`
}

export function postImagePublicSrc(
  privatePath: string | null | undefined,
  postId: string | null | undefined,
): string | null {
  const publicPath = publicPostImagePath(privatePath, postId)
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim()
  if (!publicPath || !supabaseUrl) return null
  return `${supabaseUrl}/storage/v1/object/public/${PUBLIC_POST_MEDIA_BUCKET}/${publicPath}`
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

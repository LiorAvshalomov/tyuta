/**
 * Convert a Supabase public storage URL into a local proxy URL.
 *
 * The proxy (src/app/api/media/cover/route.ts) re-serves the image with
 * `Cache-Control: public, max-age=31536000, immutable` so browsers and CDNs
 * cache covers for a full year (Supabase storage otherwise returns max-age=3600).
 * Covers are served as-is (no Next.js Image Optimization transforms) so
 * `<Image unoptimized>` is used at the call sites.
 *
 * Non-Supabase URLs (Pixabay, Pexels, etc.) are returned unchanged so they
 * still resolve directly against their own CDNs.
 */
/** True when a src has already been routed through /api/media/cover (Supabase storage). */
export function isProxySrc(src: string | null | undefined): boolean {
  return (src ?? '').startsWith('/api/media/cover')
}

export function coverProxySrc(url: string | null | undefined): string | null {
  const safeUrl = url?.trim()
  if (!safeUrl) return null
  if (isProxySrc(safeUrl)) return safeUrl

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

  return `/api/media/cover?${params.toString()}`
}

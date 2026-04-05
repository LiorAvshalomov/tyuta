/**
 * Resolve the best delivery URL for a post cover.
 *
 * Public covers already live in the `post-covers` bucket with a long-lived
 * cacheControl and a versioned public URL whenever the cover changes.
 * Serving them directly from Supabase CDN avoids an unnecessary Vercel
 * Function hop and reduces Fast Origin Transfer without weakening security.
 *
 * Legacy `/api/media/cover?...` paths are still preserved as-is, and
 * non-Supabase URLs (Pixabay, Pexels, etc.) remain untouched.
 */
/** True when a src has already been routed through /api/media/cover (Supabase storage). */
export function isProxySrc(src: string | null | undefined): boolean {
  return (src ?? '').startsWith('/api/media/cover')
}

/**
 * True when the URL points to a GIF file.
 * Works with both raw Supabase URLs and proxy URLs (/api/media/cover?path=...).
 */
export function isGifUrl(url: string | null | undefined): boolean {
  if (!url) return false
  if (isProxySrc(url)) {
    // Extract the real path from the proxy query string
    const qIdx = url.indexOf('?')
    const path = qIdx === -1 ? '' : (new URLSearchParams(url.slice(qIdx + 1)).get('path') ?? '')
    return path.toLowerCase().endsWith('.gif')
  }
  return url.split('?')[0].toLowerCase().endsWith('.gif')
}

export function coverProxySrc(url: string | null | undefined): string | null {
  const safeUrl = url?.trim()
  if (!safeUrl) return null
  if (isProxySrc(safeUrl)) return safeUrl

  const marker = '/storage/v1/object/public/'
  const idx = safeUrl.indexOf(marker)
  if (idx === -1) return safeUrl

  // Public post covers are already versioned on promote/restore and
  // uploaded with a 1-year cacheControl, so direct Supabase CDN delivery is
  // both cheaper and faster than proxying them through Vercel compute.
  return safeUrl
}

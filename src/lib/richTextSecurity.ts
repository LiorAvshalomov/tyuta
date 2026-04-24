const CONTROL_OR_BIDI_RE = /[\u0000-\u001F\u007F\u200E\u200F\u202A-\u202E]/g

export function sanitizeRichTextHref(href: unknown): string | null {
  if (typeof href !== 'string') return null

  const trimmed = href.replace(CONTROL_OR_BIDI_RE, '').trim()
  if (!trimmed) return null

  if (trimmed.startsWith('#')) return trimmed
  if (trimmed.startsWith('/') && !trimmed.startsWith('//') && !trimmed.startsWith('/\\')) {
    return trimmed
  }

  try {
    const url = new URL(trimmed)
    if (url.protocol === 'http:' || url.protocol === 'https:') return url.toString()
  } catch {
    return null
  }

  return null
}

export function sanitizeRichTextColor(color: unknown): string | null {
  if (typeof color !== 'string') return null
  const trimmed = color.replace(CONTROL_OR_BIDI_RE, '').trim()
  if (!trimmed || trimmed.length > 64) return null

  if (/^#(?:[0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(trimmed)) {
    return trimmed
  }

  if (/^rgba?\(\s*(?:\d{1,3}%?\s*,\s*){2}\d{1,3}%?(?:\s*,\s*(?:0|1|0?\.\d+|\d{1,3}%))?\s*\)$/i.test(trimmed)) {
    return trimmed
  }

  if (/^hsla?\(\s*\d{1,3}(?:deg)?\s*,\s*\d{1,3}%\s*,\s*\d{1,3}%(?:\s*,\s*(?:0|1|0?\.\d+|\d{1,3}%))?\s*\)$/i.test(trimmed)) {
    return trimmed
  }

  return null
}

export function toYouTubeNoCookieEmbed(src: unknown): string | null {
  if (typeof src !== 'string') return null

  try {
    const url = new URL(src.replace(CONTROL_OR_BIDI_RE, '').trim())
    const host = url.hostname.replace(/^www\./, '').toLowerCase()

    if (host === 'youtube-nocookie.com' && url.pathname.startsWith('/embed/')) {
      return url.toString()
    }
    if (host === 'youtube.com' && url.pathname.startsWith('/embed/')) {
      return `https://www.youtube-nocookie.com${url.pathname}${url.search}`
    }

    if (host === 'youtu.be') {
      const id = url.pathname.split('/').filter(Boolean)[0]
      if (!id || !/^[a-zA-Z0-9_-]{11}$/.test(id)) return null
      return `https://www.youtube-nocookie.com/embed/${id}`
    }

    if (host.endsWith('youtube.com')) {
      const videoId = url.searchParams.get('v')
      if (!videoId || !/^[a-zA-Z0-9_-]{11}$/.test(videoId)) return null
      return `https://www.youtube-nocookie.com/embed/${videoId}`
    }

    return null
  } catch {
    return null
  }
}

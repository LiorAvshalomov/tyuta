import React from 'react'

type Mark = {
  type: 'bold' | 'italic' | string
}

type Attrs = {
  level?: number
  src?: string
  alt?: string
  width?: number
  height?: number
  widthPercent?: number
}

export type RichNode = {
  type?: string
  text?: string
  marks?: Mark[]
  attrs?: Attrs
  content?: RichNode[]
}

type Props = {
  content: RichNode
}

function toYouTubeNoCookieEmbed(src: string): string | null {
  try {
    const url = new URL(src)
    const host = url.hostname.replace(/^www\./, '')

    // Already an embed URL
    if (host === 'youtube-nocookie.com' && url.pathname.startsWith('/embed/')) return url.toString()
    if (host === 'youtube.com' && url.pathname.startsWith('/embed/')) {
      return `https://www.youtube-nocookie.com${url.pathname}${url.search}`
    }

    // youtu.be/<id>
    if (host === 'youtu.be') {
      const id = url.pathname.split('/').filter(Boolean)[0]
      if (!id) return null
      return `https://www.youtube-nocookie.com/embed/${id}`
    }

    // youtube.com/watch?v=<id>
    if (host.endsWith('youtube.com')) {
      const v = url.searchParams.get('v')
      if (!v) return null
      return `https://www.youtube-nocookie.com/embed/${v}`
    }

    return null
  } catch {
    return null
  }
}

function renderText(node: RichNode, key: string) {
  const text = node.text ?? ''
  const marks = node.marks ?? []

  // TipTap may include "\n" inside text nodes (e.g. pasted content).
  // Convert them to <br/> so line breaks are preserved.
  const parts = text.split(/\n/)
  let out: React.ReactNode =
    parts.length <= 1
      ? text
      : parts.map((p, i) => (
          <React.Fragment key={`${key}-nl-${i}`}>
            {p}
            {i < parts.length - 1 ? <br /> : null}
          </React.Fragment>
        ))

  for (const mark of marks) {
    if (mark.type === 'bold') out = <strong key={`${key}-b`}>{out}</strong>
    if (mark.type === 'italic') out = <em key={`${key}-i`}>{out}</em>
  }

  return <React.Fragment key={key}>{out}</React.Fragment>
}

function renderNode(node: RichNode, key: string): React.ReactNode {
  if (!node || !node.type) return null

  if (node.type === 'text') return renderText(node, key)
  if (node.type === 'hardBreak') return <br key={key} />

  const children = (node.content ?? []).map((c, i) =>
    renderNode(c, `${key}-${i}`)
  )

  switch (node.type) {
    case 'doc':
      return <div key={key}>{children}</div>

    case 'paragraph': {
      const hasContent = Array.isArray(node.content) && node.content.length > 0
      return <p key={key}>{hasContent ? children : <br />}</p>
    }

    case 'heading': {
      const lvl = node.attrs?.level ?? 2
      if (lvl === 3) return <h3 key={key}>{children}</h3>
      if (lvl >= 4) return <h4 key={key}>{children}</h4>
      return <h2 key={key}>{children}</h2>
    }

    case 'blockquote':
      return <blockquote key={key}>{children}</blockquote>

    case 'bulletList':
      return <ul key={key}>{children}</ul>

    case 'orderedList':
      return <ol key={key}>{children}</ol>

    case 'listItem':
      return <li key={key}>{children}</li>

    case 'horizontalRule':
      return <hr key={key} />

    case 'image': {
  const attrs = node.attrs as Attrs | undefined
  const src = attrs?.src
  if (!src) return null
  // Only allow http/https — block data:, javascript:, and other schemes
  if (!/^https?:\/\//i.test(src)) return null

  const alt = attrs?.alt ?? ''

  const raw = attrs?.widthPercent
  const wp = raw === 33 || raw === 66 || raw === 100 ? raw : 100

  return (
    <div key={key} className="my-4" style={{ width: `${wp}%` }}>
      <img
        src={src}
        alt={alt}
        loading="lazy"
        style={{ width: '100%', height: 'auto', display: 'block' }}
        className="rounded-2xl"
      />
    </div>
  )
}

    // TipTap YouTube extension commonly emits a node type of "youtube".
    // Some setups may emit "youtubeVideo".
    case 'youtube':
    case 'youtubeVideo': {
      const src = (node.attrs as Attrs | undefined)?.src
      if (!src) return null
      const embed = toYouTubeNoCookieEmbed(src)
      if (!embed) return null
      return (
        <div key={key} className="my-4 overflow-hidden rounded-2xl">
          <div className="relative w-full" style={{ paddingTop: '56.25%' }}>
            <iframe
              src={embed}
              className="absolute inset-0 h-full w-full"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
              title="YouTube"
            />
          </div>
        </div>
      )
    }

    case 'relatedPosts': {
      const rawItems = (node.attrs as Record<string, unknown> | undefined)?.items
      if (!Array.isArray(rawItems) || rawItems.length === 0) return null
      const typedItems = rawItems as Array<{ id: string; slug: string; title: string }>
      return (
        <div
          key={key}
          dir="rtl"
          className="mt-8 pt-5 border-t border-neutral-200 dark:border-border"
        >
          <h3 style={{ fontSize: 18, fontWeight: 700, marginBottom: 12 }}>
            פרקים בסדרה
          </h3>
          <ol style={{ paddingRight: 20, listStyleType: 'decimal', margin: 0 }}>
            {typedItems.map((item, i) => (
              <li key={item.id || i} style={{ marginBottom: 6, lineHeight: 1.7 }}>
                <a
                  href={`/post/${item.slug}`}
                  className="text-blue-700 dark:text-blue-400"
                >
                  {item.title}
                </a>
              </li>
            ))}
          </ol>
        </div>
      )
    }

    default:
      return <span key={key}>{children}</span>
  }
}

export default function RichText({ content }: Props) {
  const normalized: RichNode =
    content && content.type === 'doc'
      ? content
      : { type: 'doc', content: [{ type: 'paragraph', content: [] }] }

return (
  <div
    dir="rtl"
    className="w-full max-w-[72ch] ml-auto text-right break-words text-[16px] leading-8 text-neutral-900 dark:text-foreground [&_p]:my-2 [&_p]:leading-5 [&_h2]:text-3xl [&_h2]:font-black [&_h2]:mt-10 [&_h2]:mb-4 [&_h3]:text-2xl [&_h3]:font-bold [&_h3]:mt-8 [&_h3]:mb-3 [&_h4]:text-xl [&_h4]:font-bold [&_h4]:mt-7 [&_h4]:mb-2 [&_ul]:my-4 [&_ul]:pr-6 [&_ul]:list-disc [&_ol]:my-4 [&_ol]:pr-6 [&_ol]:list-decimal [&_li]:my-1 [&_li]:leading-7 [&_a]:text-blue-700 dark:[&_a]:text-blue-400 [&_a]:underline-offset-4 hover:[&_a]:underline [&_blockquote]:my-6 [&_blockquote]:border-r-4 [&_blockquote]:border-neutral-300 dark:[&_blockquote]:border-neutral-600/50 [&_blockquote]:pr-4 [&_blockquote]:text-neutral-700 dark:[&_blockquote]:text-muted-foreground [&_img]:my-4 [&_img]:max-w-full [&_img]:rounded-2xl"
  >
    {renderNode(normalized, 'root')}
  </div>
  )
}
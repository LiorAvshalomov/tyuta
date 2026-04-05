import type { SupabaseClient } from '@supabase/supabase-js'
import { postImageStoragePath } from '@/lib/postImageUrl'

type PostOwnedAssetTarget = {
  authorId: string
  postId: string
  coverImageUrl?: string | null
}

export type PostAssetCleanupCounts = {
  postAssets: number
  postCovers: number
}

type PrunePostPrivateAssetsTarget = {
  authorId: string
  postId: string
  keepPaths: string[]
}

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size))
  return out
}

function extractPublicObjectPath(
  rawUrl: string | null | undefined,
  bucket: string,
): string | null {
  const safeUrl = rawUrl?.trim()
  if (!safeUrl) return null

  if (safeUrl.startsWith('/api/media/cover?')) {
    const qIdx = safeUrl.indexOf('?')
    if (qIdx !== -1) {
      const path = new URLSearchParams(safeUrl.slice(qIdx + 1)).get('path') ?? ''
      const marker = `${bucket}/`
      return path.startsWith(marker) ? path.slice(marker.length) : null
    }
  }

  const marker = `/storage/v1/object/public/${bucket}/`
  const idx = safeUrl.indexOf(marker)
  if (idx === -1) return null

  const rawPath = safeUrl.slice(idx + marker.length)
  const qIdx = rawPath.indexOf('?')
  const candidate = (qIdx === -1 ? rawPath : rawPath.slice(0, qIdx)).trim()
  return candidate || null
}

async function listPrefixPaths(
  client: SupabaseClient,
  bucket: string,
  prefix: string,
): Promise<string[]> {
  const safePrefix = prefix.trim().replace(/^\/+|\/+$/g, '')
  if (!safePrefix) return []

  const { data, error } = await client.storage.from(bucket).list(safePrefix, { limit: 1000 })
  if (error) {
    throw new Error(`${bucket} list failed for ${safePrefix}: ${error.message}`)
  }

  return (data ?? [])
    .map((file: { name?: string }) => file.name?.trim() ?? '')
    .filter(Boolean)
    .map((name) => `${safePrefix}/${name}`)
}

async function removePaths(
  client: SupabaseClient,
  bucket: string,
  paths: string[],
): Promise<number> {
  const deduped = Array.from(new Set(paths.map((path) => path.trim()).filter(Boolean)))
  if (deduped.length === 0) return 0

  for (const batch of chunk(deduped, 100)) {
    const { error } = await client.storage.from(bucket).remove(batch)
    if (error) {
      throw new Error(`${bucket} remove failed: ${error.message}`)
    }
  }

  return deduped.length
}

function privatePrefix(authorId: string, postId: string): string {
  return `${authorId.trim()}/${postId.trim()}/`
}

export function normalizeOwnedPrivatePostAssetPath(
  path: string | null | undefined,
  authorId: string,
  postId: string,
): string | null {
  const safePath = path?.trim()
  if (!safePath) return null
  return safePath.startsWith(privatePrefix(authorId, postId)) ? safePath : null
}

export function extractReferencedPostImagePaths(content: unknown): string[] {
  const paths = new Set<string>()

  const walk = (node: unknown) => {
    if (!node || typeof node !== 'object') return

    const current = node as {
      type?: string
      attrs?: Record<string, unknown>
      content?: unknown[]
    }

    const path = postImageStoragePath(
      typeof current.attrs?.path === 'string' ? current.attrs.path : null,
      typeof current.attrs?.src === 'string' ? current.attrs.src : null,
    )

    if (current.type === 'image' && path?.trim()) {
      paths.add(path.trim())
    }

    if (Array.isArray(current.content)) {
      current.content.forEach(walk)
    }
  }

  walk(content)
  return Array.from(paths)
}

export async function pruneUnusedPostPrivateAssets(
  client: SupabaseClient,
  target: PrunePostPrivateAssetsTarget,
): Promise<number> {
  const prefix = privatePrefix(target.authorId, target.postId).replace(/\/$/, '')
  const allPaths = await listPrefixPaths(client, 'post-assets', prefix)
  const keepSet = new Set(
    target.keepPaths
      .map((path) => normalizeOwnedPrivatePostAssetPath(path, target.authorId, target.postId))
      .filter((path): path is string => Boolean(path)),
  )

  const removeSet = allPaths.filter((path) => !keepSet.has(path))
  return removePaths(client, 'post-assets', removeSet)
}

export async function cleanupPostOwnedAssets(
  client: SupabaseClient,
  target: PostOwnedAssetTarget,
): Promise<PostAssetCleanupCounts> {
  const assetPaths = await listPrefixPaths(client, 'post-assets', `${target.authorId}/${target.postId}`)

  const coverPaths = new Set<string>()
  for (const path of await listPrefixPaths(client, 'post-covers', target.postId)) {
    coverPaths.add(path)
  }
  for (const path of await listPrefixPaths(client, 'post-covers', `${target.authorId}/${target.postId}`)) {
    coverPaths.add(path)
  }

  const exactCoverPath = extractPublicObjectPath(target.coverImageUrl, 'post-covers')
  if (exactCoverPath) coverPaths.add(exactCoverPath)

  const [postAssets, postCovers] = await Promise.all([
    removePaths(client, 'post-assets', assetPaths),
    removePaths(client, 'post-covers', Array.from(coverPaths)),
  ])

  return { postAssets, postCovers }
}

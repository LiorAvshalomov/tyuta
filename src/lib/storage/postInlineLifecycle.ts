import type { SupabaseClient } from '@supabase/supabase-js'
import { publicPostImagePath } from '@/lib/postImageUrl'
import { optimizePublicImageBuffer } from '@/lib/storage/publicImageOptimization'
import {
  extractReferencedPostImagePaths,
  normalizeOwnedPrivatePostAssetPath,
} from '@/lib/storage/postAssetLifecycle'
import { validateImageBuffer } from '@/lib/validateImage'

const PRIVATE_BUCKET = 'post-assets'
const PUBLIC_BUCKET = 'post-covers'
const INLINE_PREFIX = 'inline'
const MAX_INPUT_BYTES = 10 * 1024 * 1024
const PUBLIC_INLINE_MAX_WIDTH = 1600
const PUBLIC_INLINE_QUALITY = 82
const PUBLIC_INLINE_OPTIMIZE_MIN_BYTES = 2 * 1024 * 1024

type SyncPublishedInlineOptions = {
  authorId: string
  postId: string
  content: unknown
}

export type PublishedInlineSyncCounts = {
  uploaded: number
  removed: number
  retained: number
}

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size))
  return out
}

function publicInlinePrefix(postId: string): string {
  return `${postId.trim()}/${INLINE_PREFIX}`.replace(/^\/+|\/+$/g, '')
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

async function copyPrivateInlineToPublic(
  client: SupabaseClient,
  privatePath: string,
  publicPath: string,
): Promise<void> {
  const download = await client.storage.from(PRIVATE_BUCKET).download(privatePath)
  if (download.error || !download.data) {
    throw new Error(download.error?.message ?? `Failed to download ${privatePath}`)
  }
  if (download.data.size > MAX_INPUT_BYTES) {
    throw new Error(`Inline image exceeds the ${MAX_INPUT_BYTES / (1024 * 1024)} MB limit`)
  }

  const buffer = Buffer.from(await download.data.arrayBuffer())
  if (buffer.byteLength > MAX_INPUT_BYTES) {
    throw new Error(`Inline image exceeds the ${MAX_INPUT_BYTES / (1024 * 1024)} MB limit`)
  }

  const validated = validateImageBuffer(buffer)
  if (!validated.ok) {
    throw new Error(validated.error)
  }

  const optimized = await optimizePublicImageBuffer(buffer, validated.mimeType, {
    maxWidth: PUBLIC_INLINE_MAX_WIDTH,
    quality: PUBLIC_INLINE_QUALITY,
    minInputBytes: PUBLIC_INLINE_OPTIMIZE_MIN_BYTES,
  })

  const upload = await client.storage.from(PUBLIC_BUCKET).upload(publicPath, optimized.buffer, {
    upsert: true,
    cacheControl: '31536000',
    contentType: optimized.mimeType,
  })

  if (upload.error) {
    throw new Error(upload.error.message ?? `Failed to upload ${publicPath}`)
  }
}

function referencedOwnedPrivatePaths(options: SyncPublishedInlineOptions): string[] {
  return extractReferencedPostImagePaths(options.content)
    .map((path) => normalizeOwnedPrivatePostAssetPath(path, options.authorId, options.postId))
    .filter((path): path is string => Boolean(path))
}

export async function syncPublishedPostInlineImages(
  client: SupabaseClient,
  options: SyncPublishedInlineOptions,
): Promise<PublishedInlineSyncCounts> {
  const ownedPrivatePaths = referencedOwnedPrivatePaths(options)
  const desiredPairs = Array.from(
    new Map(
      ownedPrivatePaths
        .map((privatePath) => {
          const publicPath = publicPostImagePath(privatePath, options.postId)
          return publicPath ? [publicPath, privatePath] : null
        })
        .filter((pair): pair is [string, string] => Boolean(pair)),
    ).entries(),
  ).map(([publicPath, privatePath]) => ({ publicPath, privatePath }))

  const desiredSet = new Set(desiredPairs.map((pair) => pair.publicPath))
  const existingPaths = await listPrefixPaths(client, PUBLIC_BUCKET, publicInlinePrefix(options.postId))
  const existingSet = new Set(existingPaths)

  let uploaded = 0
  for (const pair of desiredPairs) {
    if (existingSet.has(pair.publicPath)) continue
    await copyPrivateInlineToPublic(client, pair.privatePath, pair.publicPath)
    uploaded++
  }

  const stalePaths = existingPaths.filter((path) => !desiredSet.has(path))
  const removed = await removePaths(client, PUBLIC_BUCKET, stalePaths)

  return {
    uploaded,
    removed,
    retained: desiredPairs.length - uploaded,
  }
}

export async function removePublishedPostInlineImages(
  client: SupabaseClient,
  postId: string,
): Promise<number> {
  const existingPaths = await listPrefixPaths(client, PUBLIC_BUCKET, publicInlinePrefix(postId))
  return removePaths(client, PUBLIC_BUCKET, existingPaths)
}

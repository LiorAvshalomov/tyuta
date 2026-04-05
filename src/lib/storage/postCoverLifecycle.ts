import { randomUUID } from 'node:crypto'
import type { SupabaseClient } from '@supabase/supabase-js'
import sharp from 'sharp'
import { validateImageBuffer } from '@/lib/validateImage'

const MAX_INPUT_BYTES = 15 * 1024 * 1024
const PUBLIC_BUCKET_MAX_BYTES = 5 * 1024 * 1024
const COMPRESS_MAX_WIDTH = 1600
const COMPRESS_QUALITY = 82

type PromoteCoverOptions = {
  postId: string
  sourcePath: string
  removeSource?: boolean
}

type QuarantineCoverOptions = {
  authorId: string
  postId: string
  coverImageUrl: string | null | undefined
}

export type PromoteCoverResult = {
  publicPath: string
  publicUrl: string | null
}

export type QuarantineCoverResult = {
  privatePath: string
  publicPath: string
}

function extensionForUpload(contentType: string | null | undefined, sourcePath: string): string {
  if (contentType === 'image/jpeg') return 'jpg'
  if (contentType === 'image/png') return 'png'
  if (contentType === 'image/webp') return 'webp'
  if (contentType === 'image/gif') return 'gif'

  const fallback = (sourcePath.split('.').pop() || 'jpg').toLowerCase()
  return ['jpg', 'jpeg', 'png', 'webp', 'gif'].includes(fallback) ? fallback : 'jpg'
}

function buildPublicCoverPath(postId: string, extension: string): string {
  const version = randomUUID().slice(0, 8)
  return `${postId}/cover-${version}.${extension}`
}

function isHttpUrl(value: string | null | undefined): boolean {
  return /^https?:\/\//i.test(value?.trim() ?? '')
}

function parsePublicCoverPath(coverImageUrl: string | null | undefined): string | null {
  const safeUrl = coverImageUrl?.trim()
  if (!safeUrl) return null

  if (safeUrl.startsWith('/api/media/cover?')) {
    const qIdx = safeUrl.indexOf('?')
    if (qIdx !== -1) {
      const path = new URLSearchParams(safeUrl.slice(qIdx + 1)).get('path') ?? ''
      const marker = 'post-covers/'
      if (path.startsWith(marker)) return path.slice(marker.length) || null
    }
  }

  const marker = '/storage/v1/object/public/post-covers/'
  const idx = safeUrl.indexOf(marker)
  if (idx === -1) return null

  const rawPath = safeUrl.slice(idx + marker.length)
  const qIdx = rawPath.indexOf('?')
  const candidate = (qIdx === -1 ? rawPath : rawPath.slice(0, qIdx)).trim()
  return candidate || null
}

function buildPrivateQuarantinePath(authorId: string, postId: string, extension: string): string {
  return `${authorId}/${postId}/cover-quarantine.${extension}`
}

async function removeObjects(
  client: SupabaseClient,
  bucket: string,
  paths: string[],
): Promise<void> {
  const deduped = Array.from(new Set(paths.map((path) => path.trim()).filter(Boolean)))
  if (deduped.length === 0) return

  const { error } = await client.storage.from(bucket).remove(deduped)
  if (error) {
    throw new Error(`${bucket} remove failed: ${error.message}`)
  }
}

async function listPublicCoverPaths(
  client: SupabaseClient,
  postId: string,
): Promise<string[]> {
  const { data, error } = await client.storage.from('post-covers').list(postId, { limit: 100 })
  if (error) {
    throw new Error(`post-covers list failed: ${error.message}`)
  }

  return (data ?? [])
    .map((entry) => entry.name?.trim() ?? '')
    .filter((name) => /^cover(?:[-.].+)?$/i.test(name))
    .map((name) => `${postId}/${name}`)
}

export async function promotePrivateCoverToPublic(
  client: SupabaseClient,
  options: PromoteCoverOptions,
): Promise<PromoteCoverResult> {
  const download = await client.storage.from('post-assets').download(options.sourcePath)
  if (download.error || !download.data) {
    throw new Error(download.error?.message ?? 'Failed to download private cover')
  }

  if (download.data.size > MAX_INPUT_BYTES) {
    throw new Error('Source cover exceeds the 15 MB limit')
  }

  const inputBuffer = Buffer.from(await download.data.arrayBuffer())
  const imageCheck = validateImageBuffer(inputBuffer)
  if (!imageCheck.ok) {
    throw new Error(imageCheck.error)
  }

  let outputBuffer = inputBuffer
  let contentType = imageCheck.mimeType
  let extension = extensionForUpload(contentType, options.sourcePath)

  if (outputBuffer.byteLength > PUBLIC_BUCKET_MAX_BYTES) {
    const compressed = await sharp(outputBuffer)
      .rotate()
      .resize({ width: COMPRESS_MAX_WIDTH, withoutEnlargement: true })
      .jpeg({ quality: COMPRESS_QUALITY })
      .toBuffer()
    outputBuffer = Buffer.from(compressed)

    contentType = 'image/jpeg'
    extension = 'jpg'
  }

  if (outputBuffer.byteLength > PUBLIC_BUCKET_MAX_BYTES) {
    throw new Error('Cover is still too large after optimization')
  }

  const publicPath = buildPublicCoverPath(options.postId, extension)
  const upload = await client.storage.from('post-covers').upload(publicPath, outputBuffer, {
    cacheControl: '31536000',
    contentType,
  })

  if (upload.error) {
    throw new Error(upload.error.message ?? 'Failed to upload public cover')
  }

  const stalePaths = (await listPublicCoverPaths(client, options.postId))
    .filter((path) => path !== publicPath)
  if (stalePaths.length > 0) {
    try {
      await removeObjects(client, 'post-covers', stalePaths)
    } catch {
      // best effort
    }
  }

  if (options.removeSource) {
    try {
      await removeObjects(client, 'post-assets', [options.sourcePath])
    } catch {
      // best effort
    }
  }

  const { data: pub } = client.storage.from('post-covers').getPublicUrl(publicPath)
  return {
    publicPath,
    publicUrl: pub.publicUrl ?? null,
  }
}

export async function copyPublicCoverToPrivate(
  client: SupabaseClient,
  options: QuarantineCoverOptions,
): Promise<QuarantineCoverResult | null> {
  const publicPath = parsePublicCoverPath(options.coverImageUrl)
  if (!publicPath || !isHttpUrl(options.coverImageUrl)) return null

  const download = await client.storage.from('post-covers').download(publicPath)
  if (download.error || !download.data) {
    throw new Error(download.error?.message ?? 'Failed to download public cover')
  }

  if (download.data.size > MAX_INPUT_BYTES) {
    throw new Error('Public cover exceeds the 15 MB limit')
  }

  const inputBuffer = Buffer.from(await download.data.arrayBuffer())
  const imageCheck = validateImageBuffer(inputBuffer)
  if (!imageCheck.ok) {
    throw new Error(imageCheck.error)
  }

  const privatePath = buildPrivateQuarantinePath(
    options.authorId,
    options.postId,
    extensionForUpload(imageCheck.mimeType, publicPath),
  )

  const upload = await client.storage.from('post-assets').upload(privatePath, inputBuffer, {
    upsert: true,
    cacheControl: '3600',
    contentType: imageCheck.mimeType,
  })

  if (upload.error) {
    throw new Error(upload.error.message ?? 'Failed to upload private cover copy')
  }

  return { privatePath, publicPath }
}

export async function removePostCoverPublicObject(
  client: SupabaseClient,
  publicPath: string,
): Promise<void> {
  await removeObjects(client, 'post-covers', [publicPath])
}

export async function removePostAssetObject(
  client: SupabaseClient,
  privatePath: string,
): Promise<void> {
  await removeObjects(client, 'post-assets', [privatePath])
}

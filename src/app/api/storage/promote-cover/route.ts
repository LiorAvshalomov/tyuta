import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import sharp from 'sharp'
import { requireUserFromRequest } from '@/lib/auth/requireUserFromRequest'

export const runtime = 'nodejs'

// Promote a private draft cover from `post-assets` to the public `post-covers`
// bucket. Files up to the public bucket limit are copied as-is; only oversized
// covers are compressed on the server before upload.

const MAX_INPUT_BYTES = 15 * 1024 * 1024
const PUBLIC_BUCKET_MAX_BYTES = 5 * 1024 * 1024
const COMPRESS_MAX_WIDTH = 1600
const COMPRESS_QUALITY = 82

function extensionForUpload(contentType: string | null | undefined, sourcePath: string): string {
  if (contentType === 'image/jpeg') return 'jpg'
  if (contentType === 'image/png') return 'png'
  if (contentType === 'image/webp') return 'webp'
  if (contentType === 'image/gif') return 'gif'

  const fallback = (sourcePath.split('.').pop() || 'jpg').toLowerCase()
  return ['jpg', 'jpeg', 'png', 'webp', 'gif'].includes(fallback) ? fallback : 'jpg'
}

function alternateCoverPaths(postId: string, currentPath: string): string[] {
  const candidates = [
    `${postId}/cover.jpg`,
    `${postId}/cover.jpeg`,
    `${postId}/cover.png`,
    `${postId}/cover.webp`,
    `${postId}/cover.gif`,
  ]

  return candidates.filter(path => path !== currentPath)
}

export async function POST(req: Request) {
  try {
    const auth = await requireUserFromRequest(req)
    if (!auth.ok) return auth.response

    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>
    const postId = typeof body.postId === 'string' ? body.postId : ''
    const sourcePath = typeof body.sourcePath === 'string' ? body.sourcePath : ''

    if (!postId || !sourcePath) {
      return NextResponse.json({ error: 'חסרים פרמטרים (postId, sourcePath)' }, { status: 400 })
    }

    const expectedPrefix = `${auth.user.id}/`
    if (!sourcePath.startsWith(expectedPrefix)) {
      return NextResponse.json({ error: 'sourcePath אינו שייך למשתמש המחובר' }, { status: 403 })
    }
    if (sourcePath.includes('..') || sourcePath.includes('//')) {
      return NextResponse.json({ error: 'sourcePath לא תקין' }, { status: 400 })
    }

    const { data: post } = await auth.supabase
      .from('posts')
      .select('id, author_id')
      .eq('id', postId)
      .maybeSingle()

    if (!post || post.author_id !== auth.user.id) {
      return NextResponse.json({ error: 'אין הרשאה לפעולה זו' }, { status: 403 })
    }

    const url = process.env.NEXT_PUBLIC_SUPABASE_URL
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
    if (!url || !serviceKey) {
      return NextResponse.json({ error: 'חסרה קונפיגורציית Supabase בשרת' }, { status: 500 })
    }

    const supabase = createClient(url, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    })

    const download = await supabase.storage.from('post-assets').download(sourcePath)
    if (download.error || !download.data) {
      return NextResponse.json({ error: download.error?.message ?? 'לא הצלחתי להוריד את הקאבר' }, { status: 400 })
    }

    if (download.data.size > MAX_INPUT_BYTES) {
      return NextResponse.json({ error: 'תמונת המקור גדולה מדי (מקסימום 15 MB)' }, { status: 400 })
    }

    const inputBuffer = Buffer.from(await download.data.arrayBuffer())

    let outputBuffer: Buffer = inputBuffer
    let contentType = download.data.type || 'image/jpeg'
    let publicPath = `${postId}/cover.${extensionForUpload(contentType, sourcePath)}`

    if (inputBuffer.byteLength > PUBLIC_BUCKET_MAX_BYTES) {
      try {
        outputBuffer = await sharp(inputBuffer)
          .rotate()
          .resize({ width: COMPRESS_MAX_WIDTH, withoutEnlargement: true })
          .jpeg({ quality: COMPRESS_QUALITY })
          .toBuffer()
      } catch {
        return NextResponse.json({ error: 'שגיאה בדחיסת התמונה' }, { status: 400 })
      }

      contentType = 'image/jpeg'
      publicPath = `${postId}/cover.jpg`
    }

    if (outputBuffer.byteLength > PUBLIC_BUCKET_MAX_BYTES) {
      return NextResponse.json({ error: 'הקאבר עדיין גדול מדי אחרי אופטימיזציה' }, { status: 400 })
    }

    const upload = await supabase.storage.from('post-covers').upload(publicPath, outputBuffer, {
      upsert: true,
      cacheControl: '31536000',
      contentType,
    })

    if (upload.error) {
      return NextResponse.json(
        { error: upload.error.message ?? 'לא הצלחתי להעלות את הקאבר הציבורי' },
        { status: 400 },
      )
    }

    try {
      await supabase.storage.from('post-assets').remove([sourcePath])
    } catch {
      // ignore
    }

    const stalePublicPaths = alternateCoverPaths(postId, publicPath)
    if (stalePublicPaths.length > 0) {
      void supabase.storage.from('post-covers').remove(stalePublicPaths)
    }

    const version = Date.now()
    const { data: pub } = supabase.storage.from('post-covers').getPublicUrl(publicPath)
    const publicUrl = pub.publicUrl ? `${pub.publicUrl}?v=${version}` : null
    return NextResponse.json({ publicUrl })
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'שגיאה' }, { status: 500 })
  }
}

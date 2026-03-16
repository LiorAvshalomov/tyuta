import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import sharp from 'sharp'
import { requireUserFromRequest } from '@/lib/auth/requireUserFromRequest'

// sharp uses native binaries — must run in Node.js, not Edge.
export const runtime = 'nodejs'

// Promote a private draft cover from `post-assets` to the public `post-covers` bucket.
// Compresses the image to JPEG (max 1600 px wide, quality 80) before uploading,
// reducing typical cover sizes from ~9 MB to < 300 KB.
// Uses the service role key on the server to avoid Storage RLS errors.

const MAX_INPUT_BYTES = 15 * 1024 * 1024 // 15 MB source limit
const COMPRESS_MAX_WIDTH = 1600
const COMPRESS_QUALITY = 80

export async function POST(req: Request) {
  try {
    // Authenticate the user
    const auth = await requireUserFromRequest(req)
    if (!auth.ok) return auth.response

    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>

    const postId = typeof body.postId === 'string' ? body.postId : ''
    const sourcePath = typeof body.sourcePath === 'string' ? body.sourcePath : ''

    if (!postId || !sourcePath) {
      return NextResponse.json({ error: 'חסרים פרמטרים (postId, sourcePath)' }, { status: 400 })
    }

    // C1 FIX: Hard-bind sourcePath to the authenticated user's folder.
    // Prevents reading/promoting/deleting files belonging to other users
    // even when the attacker knows the path.
    const expectedPrefix = `${auth.user.id}/`
    if (!sourcePath.startsWith(expectedPrefix)) {
      return NextResponse.json({ error: 'sourcePath אינו שייך למשתמש המחובר' }, { status: 403 })
    }

    // Also reject path traversal attempts
    if (sourcePath.includes('..') || sourcePath.includes('//')) {
      return NextResponse.json({ error: 'sourcePath לא תקין' }, { status: 400 })
    }

    // Verify the user owns this post
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

    // Compress: resize to max 1600 px wide, convert to JPEG quality 80, strip metadata.
    // This reduces typical uploads from ~9 MB to < 300 KB.
    const inputBuffer = Buffer.from(await download.data.arrayBuffer())
    let outputBuffer: Buffer
    try {
      outputBuffer = await sharp(inputBuffer)
        .rotate()                                              // auto-rotate using EXIF orientation, then strip tag
        .resize({ width: COMPRESS_MAX_WIDTH, withoutEnlargement: true })
        .jpeg({ quality: COMPRESS_QUALITY })
        .toBuffer()
    } catch {
      return NextResponse.json({ error: 'שגיאה בדחיסת התמונה — ייתכן שהפורמט אינו נתמך' }, { status: 400 })
    }

    const publicPath = `${postId}/cover.jpg`
    const version = Date.now()
    const contentType = 'image/jpeg'

    const upload = await supabase.storage.from('post-covers').upload(publicPath, outputBuffer, {
      upsert: true,
      cacheControl: '31536000',
      contentType,
    })

    if (upload.error) {
      return NextResponse.json(
        { error: upload.error.message ?? 'לא הצלחתי להעלות את הקאבר הציבורי' },
        { status: 400 }
      )
    }

    // Best-effort cleanup (ignore errors).
    try {
      await supabase.storage.from('post-assets').remove([sourcePath])
    } catch {
      // ignore
    }

    const { data: pub } = supabase.storage.from('post-covers').getPublicUrl(publicPath)
    const publicUrl = pub.publicUrl ? `${pub.publicUrl}?v=${version}` : null
    return NextResponse.json({ publicUrl })
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'שגיאה' }, { status: 500 })
  }
}

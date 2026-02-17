import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requireUserFromRequest } from '@/lib/auth/requireUserFromRequest'

// Promote a private draft cover from `post-assets` to the public `post-covers` bucket.
// Uses the service role key on the server to avoid Storage RLS errors.

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

    const ext = (sourcePath.split('.').pop() || 'jpg').toLowerCase()
    const publicPath = `${postId}/cover.${ext}`

    const upload = await supabase.storage.from('post-covers').upload(publicPath, download.data, {
      upsert: true,
      // Browser File/Blob may carry a .type, Node Blob usually doesn't; best-effort.
      contentType: download.data.type || undefined,
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
    return NextResponse.json({ publicUrl: pub.publicUrl ?? null })
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'שגיאה' }, { status: 500 })
  }
}

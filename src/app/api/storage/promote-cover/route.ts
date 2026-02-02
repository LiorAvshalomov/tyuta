import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

// Promote a private draft cover from `post-assets` to the public `post-covers` bucket.
// Uses the service role key on the server to avoid Storage RLS errors.

export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>

    const postId = typeof body.postId === 'string' ? body.postId : ''
    const sourcePath = typeof body.sourcePath === 'string' ? body.sourcePath : ''

    if (!postId || !sourcePath) {
      return NextResponse.json({ error: 'חסרים פרמטרים (postId, sourcePath)' }, { status: 400 })
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
      contentType: (download.data as any)?.type || undefined,
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
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? 'שגיאה' }, { status: 500 })
  }
}

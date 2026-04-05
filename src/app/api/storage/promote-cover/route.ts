import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requireUserFromRequest } from '@/lib/auth/requireUserFromRequest'
import { promotePrivateCoverToPublic } from '@/lib/storage/postCoverLifecycle'
import { rateLimit } from '@/lib/rateLimit'

export const runtime = 'nodejs'

const POST_ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function POST(req: Request) {
  try {
    const auth = await requireUserFromRequest(req)
    if (!auth.ok) return auth.response

    // Rate limit: 10 cover promotions per minute per user (storage download + upload)
    const rl = await rateLimit(`promote-cover:${auth.user.id}`, { maxRequests: 10, windowMs: 60_000 })
    if (!rl.allowed) {
      return NextResponse.json({ error: 'יותר מדי בקשות' }, { status: 429 })
    }

    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>
    const postId = typeof body.postId === 'string' ? body.postId : ''
    const sourcePath = typeof body.sourcePath === 'string' ? body.sourcePath : ''

    if (!postId || !sourcePath) {
      return NextResponse.json({ error: 'חסרים פרמטרים (postId, sourcePath)' }, { status: 400 })
    }

    if (!POST_ID_RE.test(postId)) {
      return NextResponse.json({ error: 'postId לא תקין' }, { status: 400 })
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

    const promoted = await promotePrivateCoverToPublic(supabase, {
      postId,
      sourcePath,
      removeSource: true,
    })

    return NextResponse.json({ publicUrl: promoted.publicUrl })
  } catch (error: unknown) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'שגיאה' },
      { status: 500 },
    )
  }
}

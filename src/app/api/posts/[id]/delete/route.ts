import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { revalidatePath } from 'next/cache'
import { requireUserFromRequest } from '@/lib/auth/requireUserFromRequest'

function serviceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return null
  return createClient(url, key, { auth: { persistSession: false } })
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireUserFromRequest(req)
  if (!auth.ok) return auth.response

  const { id } = await ctx.params
  const postId = (id ?? '').toString().trim()
  if (!postId) {
    return NextResponse.json({ error: { code: 'bad_request', message: 'missing post id' } }, { status: 400 })
  }

  // Ensure the post exists and is owned by the requester
  const { data: post, error: postErr } = await auth.supabase
    .from('posts')
    .select('id, author_id, slug, deleted_at')
    .eq('id', postId)
    .maybeSingle()

  if (postErr) {
    return NextResponse.json({ error: { code: 'db_error', message: postErr.message } }, { status: 500 })
  }
  if (!post) {
    return NextResponse.json({ error: { code: 'not_found', message: 'post not found' } }, { status: 404 })
  }
  if (post.author_id !== auth.user.id) {
    return NextResponse.json({ error: { code: 'forbidden', message: 'not your post' } }, { status: 403 })
  }
  if (post.deleted_at) {
    return NextResponse.json({ error: { code: 'bad_request', message: 'post already deleted' } }, { status: 400 })
  }

  const now = new Date().toISOString()
  const { error: updErr } = await auth.supabase
    .from('posts')
    .update({ deleted_at: now })
    .eq('id', postId)

  if (updErr) {
    return NextResponse.json({ error: { code: 'db_error', message: updErr.message } }, { status: 500 })
  }

  // Invalidate ISR cache for all public post lists immediately.
  revalidatePath('/')
  revalidatePath('/c/release')
  revalidatePath('/c/stories')
  revalidatePath('/c/magazine')

  // Remove notifications that point to this post (they become dead links otherwise).
  // Needs Service Role because notifications belong to other users.
  const svc = serviceClient()
  if (svc) {
    try {
      await svc.from('notifications').delete().eq('entity_type', 'post').eq('entity_id', postId)
    } catch {
      // non-fatal
    }
  }

  return NextResponse.json({ ok: true })
}

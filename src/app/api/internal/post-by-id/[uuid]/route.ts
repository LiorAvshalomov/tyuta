import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const runtime = 'nodejs'

type RouteParams = { params: Promise<{ uuid: string }> }

export async function GET(req: NextRequest, { params }: RouteParams) {
  const { uuid } = await params

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (supabaseUrl && key) {
    const supabase = createClient(supabaseUrl, key, { auth: { persistSession: false } })

    // 1) Check slug_redirects table — old UUID slugs (pre-migration) map here.
    //    Before the Hebrew-slug migration, posts used a client-generated UUID as their
    //    slug (different from the post's DB id). The migration changed slug in-place,
    //    so old external URLs (/post/<old-slug-uuid>) must be looked up via this table.
    const { data: redirect } = await supabase
      .from('slug_redirects')
      .select('new_slug')
      .eq('old_slug', uuid)
      .maybeSingle<{ new_slug: string }>()

    if (redirect?.new_slug) {
      return NextResponse.redirect(
        new URL(`/post/${encodeURIComponent(redirect.new_slug)}`, req.url),
        301,
      )
    }

    // 2) Fallback: check if uuid matches a post's id directly (future-proof, in case
    //    any tool or deep link ever uses the DB id instead of the slug).
    //    Only resolve published, non-deleted posts to prevent leaking draft/deleted slugs.
    const { data: byId } = await supabase
      .from('posts')
      .select('slug')
      .eq('id', uuid)
      .eq('status', 'published')
      .is('deleted_at', null)
      .maybeSingle<{ slug: string }>()

    if (byId?.slug && byId.slug !== uuid) {
      return NextResponse.redirect(
        new URL(`/post/${encodeURIComponent(byId.slug)}`, req.url),
        301,
      )
    }
  }

  // Not found in either table — fall through to the post page (will show "not found").
  // ?nr=1 prevents the rewrite from looping back to this handler.
  const fallback = new URL(`/post/${uuid}`, req.url)
  fallback.searchParams.set('nr', '1')
  return NextResponse.redirect(fallback, 307)
}

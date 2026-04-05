import { NextRequest, NextResponse } from 'next/server'
import { requireAdminFromRequest } from '@/lib/admin/requireAdminFromRequest'

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const gate = await requireAdminFromRequest(req)
  if (!gate.ok) return gate.response

  const { id } = await params
  const index = parseInt(req.nextUrl.searchParams.get('index') ?? '0', 10)

  const { data: msg, error } = await gate.admin
    .from('contact_messages')
    .select('attachment_paths')
    .eq('id', id)
    .single()

  if (error || !msg) {
    return NextResponse.json({ error: 'not found' }, { status: 404 })
  }

  const paths = msg.attachment_paths as string[] | null
  if (!paths || paths.length === 0) {
    return NextResponse.json({ error: 'no attachments' }, { status: 404 })
  }

  const path = paths[index]
  if (!path) {
    return NextResponse.json({ error: 'index out of range' }, { status: 404 })
  }

  const { data: signed, error: signErr } = await gate.admin.storage
    .from('contact-attachments')
    .createSignedUrl(path, 300)

  if (signErr || !signed?.signedUrl) {
    return NextResponse.json({ error: 'failed to create signed url' }, { status: 500 })
  }

  return NextResponse.json({ url: signed.signedUrl })
}

import { NextResponse, type NextRequest } from 'next/server'
import { requireAdminFromRequest } from '@/lib/admin/requireAdminFromRequest'

export async function POST(req: NextRequest) {
  const res = await requireAdminFromRequest(req)
  if (!res.ok) {
    return NextResponse.json({ ok: false, error: res.message }, { status: res.status })
  }

  const body = await req.json().catch(() => ({}))
  const mode = (body?.mode ?? 'user').toString() // 'user' | 'all'
  const username = (body?.username ?? '').toString().trim()
  const userId = (body?.user_id ?? '').toString().trim()
  const title = (body?.title ?? '').toString().trim()
  const message = (body?.message ?? '').toString().trim()

  if (!title || title.length < 2) return NextResponse.json({ ok: false, error: 'כותרת קצרה מדי.' }, { status: 400 })
  if (!message || message.length < 2) return NextResponse.json({ ok: false, error: 'הודעה קצרה מדי.' }, { status: 400 })

  let targetIds: string[] = []

  if (mode === 'all') {
    // small community MVP: send to all profiles
    const { data, error } = await res.admin.from('profiles').select('id')
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
    targetIds = (data ?? []).map((r: any) => r.id)
  } else {
    if (userId) {
      targetIds = [userId]
    } else if (username) {
      const { data, error } = await res.admin.from('profiles').select('id').eq('username', username).maybeSingle()
      if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
      if (!data?.id) return NextResponse.json({ ok: false, error: 'לא נמצא משתמש עם ה-username הזה.' }, { status: 404 })
      targetIds = [data.id]
    } else {
      return NextResponse.json({ ok: false, error: 'חסר username או user_id.' }, { status: 400 })
    }
  }

  const now = new Date().toISOString()
  const rows = targetIds.map((uid) => ({
    user_id: uid,
    actor_id: null,
    type: 'system_message',
    entity_type: null,
    entity_id: null,
    payload: { title, message },
    is_read: false,
    created_at: now,
  }))

  // Insert in chunks to avoid payload limits
  const chunkSize = 500
  for (let i = 0; i < rows.length; i += chunkSize) {
    const chunk = rows.slice(i, i + chunkSize)
    const { error } = await res.admin.from('notifications').insert(chunk)
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true, sent: rows.length })
}

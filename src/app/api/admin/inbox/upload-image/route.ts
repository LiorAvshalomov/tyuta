import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requireAdminFromRequest } from '@/lib/admin/requireAdminFromRequest'
import { validateImageBuffer } from '@/lib/validateImage'

const BUCKET = 'admin-inbox-images'
const MAX_FILE_SIZE = 5 * 1024 * 1024
const ALLOWED_MIME = new Set(['image/jpeg', 'image/png', 'image/gif', 'image/webp'])

export async function POST(req: Request): Promise<NextResponse> {
  const auth = await requireAdminFromRequest(req)
  if (!auth.ok) return auth.response

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!supabaseUrl || !serviceRole) {
    return NextResponse.json({ error: 'השרת אינו מוגדר כראוי.' }, { status: 500 })
  }

  let formData: FormData
  try {
    formData = await req.formData()
  } catch {
    return NextResponse.json({ error: 'טופס לא תקין.' }, { status: 400 })
  }

  const file = formData.get('file') as File | null
  if (!file || file.size === 0) {
    return NextResponse.json({ error: 'לא נבחר קובץ.' }, { status: 400 })
  }
  if (file.size > MAX_FILE_SIZE) {
    return NextResponse.json({ error: 'הקובץ גדול מדי (מקסימום 5MB).' }, { status: 400 })
  }
  if (!ALLOWED_MIME.has(file.type)) {
    return NextResponse.json({ error: 'סוג קובץ לא נתמך.' }, { status: 400 })
  }

  const bytes = await file.arrayBuffer()
  const imageCheck = validateImageBuffer(Buffer.from(bytes))
  if (!imageCheck.ok) {
    return NextResponse.json({ error: imageCheck.error }, { status: 400 })
  }

  const rawExt = file.name.split('.').pop()?.toLowerCase() ?? ''
  const ext = /^[a-z0-9]{1,8}$/.test(rawExt) ? rawExt : 'bin'
  const storagePath = `${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`

  const svc = createClient(supabaseUrl, serviceRole, { auth: { persistSession: false } })
  const { error: uploadErr } = await svc.storage
    .from(BUCKET)
    .upload(storagePath, bytes, { contentType: file.type, upsert: false })

  if (uploadErr) {
    return NextResponse.json({ error: 'שגיאה בהעלאת הקובץ.' }, { status: 500 })
  }

  // Private bucket — generate a long-lived signed URL (1 year).
  // The URL itself is the access token: only the message recipient who
  // receives the [img:URL] body can view the image.
  const ONE_YEAR_SECONDS = 365 * 24 * 60 * 60
  const { data: signedData, error: signErr } = await svc.storage
    .from(BUCKET)
    .createSignedUrl(storagePath, ONE_YEAR_SECONDS)

  if (signErr || !signedData?.signedUrl) {
    return NextResponse.json({ error: 'שגיאה ביצירת קישור לתמונה.' }, { status: 500 })
  }

  return NextResponse.json({ url: signedData.signedUrl })
}

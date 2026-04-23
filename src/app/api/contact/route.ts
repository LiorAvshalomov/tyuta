import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requireUserFromRequest } from '@/lib/auth/requireUserFromRequest'
import { rateLimit } from '@/lib/rateLimit'
import { buildRateLimitResponse } from '@/lib/requestRateLimit'
import { validateImageBuffer } from '@/lib/validateImage'
import { sendTelegramMessage, sendTelegramPhoto, escapeHtml } from '@/lib/telegram'

async function sendContactTelegramNotification(
  userId: string,
  email: string | null,
  subject: string,
  message: string,
  attachmentPaths: string[],
): Promise<void> {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY
    if (!supabaseUrl || !serviceRole) return

    const svc = createClient(supabaseUrl, serviceRole, { auth: { persistSession: false } })

    const { data: profileData } = await svc
      .from('profiles')
      .select('display_name, username')
      .eq('id', userId)
      .maybeSingle()

    const p = profileData as { display_name: string | null; username: string | null } | null
    // display_name/username come from DB but escape defensively for HTML sink.
    const displayName = escapeHtml(p?.display_name ?? '')
    const username = escapeHtml(p?.username ?? '')
    const fromStr = displayName
      ? `${displayName}${username ? ` (@${username})` : ''}`
      : username ? `@${username}` : userId.slice(0, 8)

    const lines = [
      '🔔 <b>התראה חדשה – Tyuta</b>',
      '',
      '📩 <b>צור קשר</b>',
      `👤 <b>מאת:</b> ${fromStr}`,
      email ? `📧 <b>אימייל:</b> ${escapeHtml(email)}` : null,
      `📋 <b>נושא:</b> ${escapeHtml(subject)}`,
      '',
      '💬 <b>הודעה:</b>',
      escapeHtml(message),
      attachmentPaths.length > 0 ? `\n📎 ${attachmentPaths.length} קבצים מצורפים` : null,
    ].filter(Boolean).join('\n')

    await sendTelegramMessage(lines)

    for (const path of attachmentPaths) {
      const { data: signed } = await svc.storage
        .from('contact-attachments')
        .createSignedUrl(path, 3600)
      if (signed?.signedUrl) {
        await sendTelegramPhoto(signed.signedUrl, `📎 קובץ מצורף מ-${fromStr}`)
      }
    }
  } catch {
    // never throw from notification
  }
}

const MAX_FILE_SIZE = 5 * 1024 * 1024
const MAX_FILES = 5
const ALLOWED_MIME = new Set(['image/jpeg', 'image/png', 'image/gif', 'image/webp'])
const BUCKET = 'contact-attachments'

export async function POST(req: NextRequest): Promise<NextResponse> {
  const ip =
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    req.headers.get('x-real-ip') ??
    'unknown'

  const rl = await rateLimit(`contact:${ip}`, { maxRequests: 3, windowMs: 5 * 60_000 })
  if (!rl.allowed) {
    return buildRateLimitResponse('יותר מדי בקשות. נסו שוב בעוד כמה דקות.', rl.retryAfterMs)
  }

  const gate = await requireUserFromRequest(req)
  if (!gate.ok) return gate.response

  const userId = gate.user.id

  let formData: FormData
  try {
    formData = await req.formData()
  } catch {
    return NextResponse.json({ error: 'טופס לא תקין.' }, { status: 400 })
  }

  const subject = ((formData.get('subject') as string | null) ?? '').trim()
  const message = ((formData.get('message') as string | null) ?? '').trim()
  const email = ((formData.get('email') as string | null) ?? '').trim() || null
  const files = (formData.getAll('files') as File[]).filter((file) => file.size > 0)

  if (subject.length < 2 || subject.length > 120) {
    return NextResponse.json({ error: 'נושא חייב להכיל בין 2 ל-120 תווים.' }, { status: 400 })
  }
  if (message.length < 10 || message.length > 5000) {
    return NextResponse.json({ error: 'הודעה חייבת להכיל בין 10 ל-5000 תווים.' }, { status: 400 })
  }
  if (files.length > MAX_FILES) {
    return NextResponse.json({ error: `ניתן לצרף עד ${MAX_FILES} תמונות.` }, { status: 400 })
  }

  for (const file of files) {
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: `הקובץ "${file.name}" גדול מדי (מקסימום 5MB).` },
        { status: 400 },
      )
    }
    if (!ALLOWED_MIME.has(file.type)) {
      return NextResponse.json(
        { error: `סוג קובץ לא נתמך עבור "${file.name}".` },
        { status: 400 },
      )
    }
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!supabaseUrl || !serviceRole) {
    return NextResponse.json({ error: 'השרת אינו מוגדר כראוי.' }, { status: 500 })
  }

  const service = createClient(supabaseUrl, serviceRole, { auth: { persistSession: false } })

  const uploadedPaths: string[] = []

  for (const file of files) {
    const ext = file.name.split('.').pop()?.toLowerCase() ?? 'bin'
    const storagePath = `${userId}/${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`
    const bytes = await file.arrayBuffer()

    // file.type is client-controlled, so validate the actual bytes.
    const imageCheck = validateImageBuffer(Buffer.from(bytes))
    if (!imageCheck.ok) {
      if (uploadedPaths.length) void service.storage.from(BUCKET).remove(uploadedPaths)
      return NextResponse.json({ error: imageCheck.error }, { status: 400 })
    }

    const { error: uploadErr } = await service.storage
      .from(BUCKET)
      .upload(storagePath, bytes, { contentType: file.type, upsert: false })

    if (uploadErr) {
      if (uploadedPaths.length) {
        void service.storage.from(BUCKET).remove(uploadedPaths)
      }
      return NextResponse.json({ error: 'שגיאה בהעלאת הקובץ.' }, { status: 500 })
    }

    uploadedPaths.push(storagePath)
  }

  const { error: insertErr } = await service.from('contact_messages').insert({
    user_id: userId,
    email,
    subject,
    message,
    attachment_paths: uploadedPaths.length > 0 ? uploadedPaths : null,
  })

  if (insertErr) {
    if (uploadedPaths.length) {
      void service.storage.from(BUCKET).remove(uploadedPaths)
    }
    return NextResponse.json({ error: 'שגיאה בשמירת ההודעה.' }, { status: 500 })
  }

  void sendContactTelegramNotification(userId, email, subject, message, uploadedPaths)

  return NextResponse.json({ ok: true })
}

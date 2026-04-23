const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN ?? ''
const CHAT_ID = process.env.TELEGRAM_CHAT_ID ?? ''

/**
 * Escape user-controlled strings before embedding in a Telegram HTML message.
 * Telegram HTML supports only <b>, <i>, <u>, <s>, <code>, <pre>, <a> — everything
 * else is either rejected or interpreted. Escape the five XML special chars to be safe.
 */
export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function enabled() {
  return Boolean(BOT_TOKEN && CHAT_ID)
}

export async function sendTelegramMessage(text: string): Promise<void> {
  if (!enabled()) return
  try {
    await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        chat_id: CHAT_ID,
        text,
        parse_mode: 'HTML',
      }),
    })
  } catch {
    // fire-and-forget, never throw
  }
}

export async function sendTelegramPhoto(photoUrl: string, caption: string): Promise<void> {
  if (!enabled()) return
  try {
    await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendPhoto`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        chat_id: CHAT_ID,
        photo: photoUrl,
        caption,
        parse_mode: 'HTML',
      }),
    })
  } catch {
    // fire-and-forget, never throw
  }
}

export async function sendTelegramDocument(docUrl: string, caption?: string): Promise<void> {
  if (!enabled()) return
  try {
    await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendDocument`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        chat_id: CHAT_ID,
        document: docUrl,
        caption: caption ?? '',
        parse_mode: 'HTML',
      }),
    })
  } catch {
    // fire-and-forget, never throw
  }
}

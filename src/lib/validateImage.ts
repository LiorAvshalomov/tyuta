/**
 * Server-side image validation via magic bytes.
 *
 * Never trust file.type or Content-Type headers — they are client-controlled.
 * This utility reads the actual first bytes of a buffer to determine the real
 * file format, then checks it against the explicit allowlist.
 *
 * Allowed: JPEG · PNG · GIF (87a + 89a) · WebP
 * Blocked: SVG and everything else (SVG can contain <script> and execute XSS)
 */

export const ALLOWED_IMAGE_TYPES = new Set<string>([
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
])

type ValidationResult =
  | { ok: true; mimeType: string }
  | { ok: false; error: string }

/**
 * Detect format from magic bytes and validate against the allowlist.
 * Returns the canonical MIME type on success, or an error message on failure.
 */
export function validateImageBuffer(buf: Buffer | Uint8Array): ValidationResult {
  const b = buf instanceof Buffer ? buf : Buffer.from(buf)

  if (b.length < 12) {
    return { ok: false, error: 'הקובץ קצר מדי לזיהוי.' }
  }

  // JPEG: FF D8 FF
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) {
    return { ok: true, mimeType: 'image/jpeg' }
  }

  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 &&
    b[4] === 0x0d && b[5] === 0x0a && b[6] === 0x1a && b[7] === 0x0a
  ) {
    return { ok: true, mimeType: 'image/png' }
  }

  // GIF87a: 47 49 46 38 37 61 / GIF89a: 47 49 46 38 39 61
  if (
    b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x38 &&
    (b[4] === 0x37 || b[4] === 0x39) && b[5] === 0x61
  ) {
    return { ok: true, mimeType: 'image/gif' }
  }

  // WebP: RIFF at [0..3] + WEBP at [8..11]
  if (
    b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 &&
    b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50
  ) {
    return { ok: true, mimeType: 'image/webp' }
  }

  return {
    ok: false,
    error: 'סוג קובץ לא נתמך. מותרות תמונות JPEG, PNG, GIF ו-WebP בלבד.',
  }
}

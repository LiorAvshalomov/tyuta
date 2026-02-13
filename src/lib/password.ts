export const PASSWORD_HINT_HE = 'לפחות 8 תווים, עם אותיות ומספרים'

/**
 * Requirements:
 * - min 8 chars
 * - must include at least one letter and one digit
 */
export function validatePassword(pw: string): { ok: true } | { ok: false; message: string } {
  if (pw.length < 8) return { ok: false, message: PASSWORD_HINT_HE }
  const hasLetter = /[A-Za-z]/.test(pw)
  const hasDigit = /\d/.test(pw)
  if (!hasLetter || !hasDigit) return { ok: false, message: PASSWORD_HINT_HE }
  return { ok: true }
}

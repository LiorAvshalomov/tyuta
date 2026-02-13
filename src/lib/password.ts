export const PASSWORD_HINT_HE = 'מינימום 8 תווים. חובה אותיות ומספרים.'

export function validatePassword(
  password: string
): { ok: true } | { ok: false; message: string } {
  if (password.length < 8) {
    return { ok: false, message: 'הסיסמה חייבת להיות לפחות 8 תווים.' }
  }

  const hasLetter = /[A-Za-z]/.test(password)
  const hasDigit = /\d/.test(password)

  if (!hasLetter || !hasDigit) {
    return { ok: false, message: 'הסיסמה חייבת לכלול גם אותיות וגם מספרים.' }
  }

  return { ok: true }
}

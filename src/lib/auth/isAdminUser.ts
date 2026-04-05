export function isAdminUser(userId: string): boolean {
  return (process.env.ADMIN_USER_IDS ?? '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean)
    .includes(userId)
}

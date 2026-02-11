export type SuspensionStatus = {
  isSuspended: boolean
  reason: string | null
  suspendedAt: string | null
  suspendedBy: string | null
}

export function isLikelyUuid(v: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v)
}

export function normalizeString(v: unknown): string | null {
  return typeof v === 'string' ? v : null
}

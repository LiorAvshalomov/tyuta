type IdentityField = 'username' | 'display_name'

type IdentityAuditMetadata = {
  changed_fields?: unknown
  previous_username?: unknown
  next_username?: unknown
  previous_display_name?: unknown
  next_display_name?: unknown
}

export type ProfileIdentityChangeLine = {
  key: IdentityField
  label: string
  previous: string
  next: string
}

function normalizeText(value: unknown) {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

function formatIdentityValue(value: string | null) {
  return value ?? 'ללא ערך'
}

function getChangedFields(metadata: IdentityAuditMetadata) {
  if (!Array.isArray(metadata.changed_fields)) return new Set<IdentityField>()

  return new Set(
    metadata.changed_fields.filter(
      (field): field is IdentityField =>
        field === 'username' || field === 'display_name',
    ),
  )
}

export function getProfileIdentityChangeLines(
  metadata: Record<string, unknown> | null | undefined,
): ProfileIdentityChangeLine[] {
  if (!metadata) return []

  const typed = metadata as IdentityAuditMetadata
  const previousUsername = normalizeText(typed.previous_username)
  const nextUsername = normalizeText(typed.next_username)
  const previousDisplayName = normalizeText(typed.previous_display_name)
  const nextDisplayName = normalizeText(typed.next_display_name)
  const changedFields = getChangedFields(typed)

  const lines: ProfileIdentityChangeLine[] = []

  if (
    changedFields.has('username') ||
    previousUsername !== nextUsername
  ) {
    lines.push({
      key: 'username',
      label: 'שם משתמש',
      previous: formatIdentityValue(previousUsername),
      next: formatIdentityValue(nextUsername),
    })
  }

  if (
    changedFields.has('display_name') ||
    previousDisplayName !== nextDisplayName
  ) {
    lines.push({
      key: 'display_name',
      label: 'שם תצוגה',
      previous: formatIdentityValue(previousDisplayName),
      next: formatIdentityValue(nextDisplayName),
    })
  }

  return lines
}

export function formatProfileIdentityInlineSummary(
  metadata: Record<string, unknown> | null | undefined,
) {
  const lines = getProfileIdentityChangeLines(metadata)
  if (lines.length === 0) return 'שינוי זהות'

  return lines
    .map((line) => `${line.label}: ${line.previous} -> ${line.next}`)
    .join(' · ')
}

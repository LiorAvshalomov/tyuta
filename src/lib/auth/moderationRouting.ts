export type ModerationRoutingHint = 'none' | 'suspended' | 'banned'

export function deriveModerationRoutingHint(input: {
  is_banned?: boolean | null
  is_suspended?: boolean | null
} | null | undefined): ModerationRoutingHint {
  if (input?.is_banned === true) return 'banned'
  if (input?.is_suspended === true) return 'suspended'
  return 'none'
}

export function encodeModerationRoutingHint(hint: ModerationRoutingHint): 0 | 1 | 2 {
  switch (hint) {
    case 'banned':
      return 2
    case 'suspended':
      return 1
    default:
      return 0
  }
}

export function decodeModerationRoutingHint(value: unknown): ModerationRoutingHint {
  if (value === 2) return 'banned'
  if (value === 1) return 'suspended'
  return 'none'
}

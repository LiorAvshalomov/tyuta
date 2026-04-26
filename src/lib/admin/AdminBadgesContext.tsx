'use client'

import { createContext, useContext } from 'react'

export type AdminBadgeCounts = {
  reports: number
  contact: number
  failedLogins: number
  inbox: number
  /** false until the first successful poll completes */
  loaded: boolean
}

export const EMPTY_ADMIN_BADGES: AdminBadgeCounts = {
  reports: 0,
  contact: 0,
  failedLogins: 0,
  inbox: 0,
  loaded: false,
}

export const AdminBadgesContext = createContext<AdminBadgeCounts>(EMPTY_ADMIN_BADGES)

export function useAdminBadges(): AdminBadgeCounts {
  return useContext(AdminBadgesContext)
}

import { useCallback } from 'react'
import { supabase } from "@/lib/supabaseClient"

type AdminFetchInit = Omit<RequestInit, "headers"> & {
  headers?: Record<string, string>
}

export async function adminFetch(path: string, init: AdminFetchInit = {}): Promise<Response> {
  const { data } = await supabase.auth.getSession()
  const session = data.session

  if (!session?.access_token) {
    throw new Error("Not authenticated")
  }

  const headers: Record<string, string> = {
    ...(init.headers ?? {}),
    Authorization: `Bearer ${session.access_token}`,
  }

  const hasBody = typeof init.body !== "undefined"
  if (hasBody && !headers["Content-Type"] && !(init.body instanceof FormData)) {
    headers["Content-Type"] = "application/json"
  }

  return fetch(path, {
    ...init,
    headers,
  })
}

/**
 * Hook: returns a stable async function that resolves to the current access token,
 * or null if the session is not hydrated yet.
 * Used by AdminShell to attach Bearer tokens to badge polling requests.
 */
export function useAdminToken(): () => Promise<string | null> {
  return useCallback(async () => {
    const { data } = await supabase.auth.getSession()
    return data.session?.access_token ?? null
  }, [])
}

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

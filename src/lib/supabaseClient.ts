import { createBrowserClient } from '@supabase/ssr'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
const SERVER_MANAGED_REFRESH_TOKEN = 'server-managed'
// Match Supabase Auth's built-in eager-refresh margin so the SDK never attempts
// to refresh our server-managed sessions with the placeholder refresh token.
const SERVER_MANAGED_EXPIRY_MARGIN_MS = 90_000

type StoredSessionLike = {
  access_token?: unknown
  refresh_token?: unknown
  expires_at?: unknown
}

function shouldHideServerManagedSession(rawValue: string | null): boolean {
  if (!rawValue) return false

  try {
    const parsed = JSON.parse(rawValue) as StoredSessionLike
    if (
      typeof parsed !== 'object' ||
      parsed === null ||
      parsed.refresh_token !== SERVER_MANAGED_REFRESH_TOKEN ||
      typeof parsed.expires_at !== 'number'
    ) {
      return false
    }

    return parsed.expires_at * 1000 - Date.now() <= SERVER_MANAGED_EXPIRY_MARGIN_MS
  } catch {
    return false
  }
}

/**
 * In-memory storage adapter.
 *
 * Access tokens live only in this plain JS object — never in localStorage,
 * never in a readable cookie.  XSS can read the AT (max 1 h window) but
 * CANNOT read the httpOnly refresh token, so persistent compromise is impossible
 * once the AT expires.
 */
const _mem: Record<string, string> = {}
const memStorage = {
  getItem:    (key: string): string | null => {
    const value = _mem[key] ?? null
    if (!shouldHideServerManagedSession(value)) return value

    delete _mem[key]
    return null
  },
  setItem:    (key: string, value: string): void => { _mem[key] = value },
  removeItem: (key: string): void => { delete _mem[key] },
}

export const supabase = createBrowserClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage:           memStorage,
    persistSession:    true,
    autoRefreshToken:  false,   // AuthSync owns the refresh cycle via /api/auth/session
    detectSessionInUrl: true,   // Required for PKCE and implicit reset-password flows
  },
})

/**
 * Hydrate the in-memory Supabase client with an access token returned by the server.
 *
 * The 'server-managed' sentinel for refresh_token is intentional and safe:
 * autoRefreshToken is false, so the SDK never attempts to use it.
 */
export async function hydrateSession(accessToken: string): Promise<void> {
  await supabase.auth.setSession({
    access_token:  accessToken,
    refresh_token: SERVER_MANAGED_REFRESH_TOKEN,
  })
}

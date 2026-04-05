/**
 * Presence cookie (sb_p) — a short-lived, HMAC-signed cookie that lets the
 * Next.js middleware verify authentication and admin status with zero network calls.
 *
 * This is NOT an authentication token.  It is a verifiable routing hint.
 * Real auth still happens via:
 *   - Bearer AT → requireUserFromRequest / requireAdminFromRequest
 *   - Supabase RLS on all DB operations
 *
 * Cookie properties:
 *   - HttpOnly    — JS blind
 *   - Secure      — HTTPS only in production
 *   - SameSite=Lax   — allows top-level GET navigations (email links); mutations gated by Bearer AT
 *   - Path=/      — sent to all routes, including middleware on /admin/*
 *   - MaxAge=3600 — expires with the access token (refreshed every hour)
 *
 * Token format: base64url(JSON payload) . base64url(HMAC-SHA256)
 * Signed over the base64url-encoded payload to make the signature self-contained.
 */

import type { NextResponse } from 'next/server'
import {
  decodeModerationRoutingHint,
  encodeModerationRoutingHint,
  type ModerationRoutingHint,
} from '@/lib/auth/moderationRouting'

export const PRESENCE_COOKIE = 'sb_p'
export const AUTH_HINT_COOKIE = 'sb_pa'

/** Seconds the presence cookie lives — matches AT lifetime. */
const PRESENCE_TTL_S = 3600
const AUTH_HINT_REMEMBER_TTL_S = 60 * 24 * 60 * 60
const AUTH_HINT_SESSION_TTL_S = 24 * 60 * 60

interface PresenceClaims {
  u: string    // user id (UUID)
  a: 0 | 1    // is_admin
  e: number    // unix expiry (seconds)
  rm: 0 | 1   // remember_me (1 = persistent RT cookie, 0 = session-only)
  m?: 0 | 1 | 2  // moderation routing hint (0 = none, 1 = suspended, 2 = banned)
}

interface AuthHintClaims {
  u: string
  a: 0 | 1
  e: number
}

// ── Web Crypto helpers (globalThis.crypto — available in Node 18+ and Edge Runtime) ──

const enc = new TextEncoder()
const dec = new TextDecoder()

function b64url(input: ArrayBuffer | Uint8Array): string {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input)
  return btoa(Array.from(bytes, (b) => String.fromCharCode(b)).join(''))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '')
}

function fromB64url(s: string): Uint8Array<ArrayBuffer> {
  const padLen = (4 - (s.length % 4)) % 4
  const padded = s.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat(padLen)
  const binary = atob(padded)
  const buf    = new ArrayBuffer(binary.length)
  const view   = new Uint8Array(buf)
  for (let i = 0; i < binary.length; i++) view[i] = binary.charCodeAt(i)
  return view
}

async function importHmacKey(secret: string, usage: 'sign' | 'verify'): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    [usage],
  )
}

// ── Core sign / verify ────────────────────────────────────────────────────────

async function signPayload(payloadB64: string, secret: string): Promise<string> {
  const key = await importHmacKey(secret, 'sign')
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(payloadB64))
  return `${payloadB64}.${b64url(sig)}`
}

/**
 * Verify an sb_p cookie value.
 *
 * Returns `{ uid, isAdmin, rememberMe, moderation }` if the signature is valid and the token has not expired.
 * Returns `null` on any verification failure.
 */
export async function verifyPresence(
  cookieValue: string,
  secret: string,
): Promise<{ uid: string; isAdmin: boolean; rememberMe: boolean; moderation: ModerationRoutingHint } | null> {
  try {
    const lastDot = cookieValue.lastIndexOf('.')
    if (lastDot === -1) return null

    const payloadB64 = cookieValue.slice(0, lastDot)
    const sigB64     = cookieValue.slice(lastDot + 1)

    const key   = await importHmacKey(secret, 'verify')
    const valid = await crypto.subtle.verify('HMAC', key, fromB64url(sigB64), enc.encode(payloadB64))
    if (!valid) return null

    const claims = JSON.parse(dec.decode(fromB64url(payloadB64))) as PresenceClaims
    if (Math.floor(Date.now() / 1000) > claims.e) return null

    return {
      uid: claims.u,
      isAdmin: claims.a === 1,
      rememberMe: claims.rm !== 0,
      moderation: decodeModerationRoutingHint(claims.m),
    }
  } catch {
    return null
  }
}

export async function verifyAuthHint(
  cookieValue: string,
  secret: string,
): Promise<{ uid: string; isAdmin: boolean } | null> {
  try {
    const lastDot = cookieValue.lastIndexOf('.')
    if (lastDot === -1) return null

    const payloadB64 = cookieValue.slice(0, lastDot)
    const sigB64 = cookieValue.slice(lastDot + 1)

    const key = await importHmacKey(secret, 'verify')
    const valid = await crypto.subtle.verify('HMAC', key, fromB64url(sigB64), enc.encode(payloadB64))
    if (!valid) return null

    const claims = JSON.parse(dec.decode(fromB64url(payloadB64))) as AuthHintClaims
    if (Math.floor(Date.now() / 1000) > claims.e) return null

    return {
      uid: claims.u,
      isAdmin: claims.a === 1,
    }
  } catch {
    return null
  }
}

// ── Cookie set / clear ────────────────────────────────────────────────────────

const BASE_PRESENCE_OPTS = {
  httpOnly: true,
  secure:   process.env.NODE_ENV === 'production',
  // 'lax' (not 'strict') — this cookie is a routing hint, not a credential.
  // 'lax' allows top-level GET navigations (email links, Google search results) to
  // include the cookie, so an admin clicking a link from outside the site is not
  // redirected to login. Mutations are never authorized by this cookie — they always
  // require a Bearer AT via requireAdminFromRequest(). CSRF is not a concern here.
  sameSite: 'lax' as const,
  path:     '/',
} as const

/**
 * Sign and attach the presence cookie to an outgoing NextResponse.
 * Silently skips if PRESENCE_HMAC_SECRET is not configured.
 */
export async function setPresenceCookie(
  res: NextResponse,
  userId: string,
  isAdmin: boolean,
  rememberMe = true,
  moderation: ModerationRoutingHint = 'none',
): Promise<void> {
  const secret = process.env.PRESENCE_HMAC_SECRET
  if (!secret) return

  const exp     = Math.floor(Date.now() / 1000) + PRESENCE_TTL_S
  const claims: PresenceClaims = {
    u: userId,
    a: isAdmin ? 1 : 0,
    e: exp,
    rm: rememberMe ? 1 : 0,
    m: encodeModerationRoutingHint(moderation),
  }
  const payloadB64 = b64url(enc.encode(JSON.stringify(claims)))
  const token      = await signPayload(payloadB64, secret)

  res.cookies.set({
    name:   PRESENCE_COOKIE,
    value:  token,
    ...BASE_PRESENCE_OPTS,
    ...(rememberMe ? { maxAge: PRESENCE_TTL_S } : {}),
  })

  const authHintExp = Math.floor(Date.now() / 1000) + (rememberMe ? AUTH_HINT_REMEMBER_TTL_S : AUTH_HINT_SESSION_TTL_S)
  const authHintClaims: AuthHintClaims = {
    u: userId,
    a: isAdmin ? 1 : 0,
    e: authHintExp,
  }
  const authHintPayloadB64 = b64url(enc.encode(JSON.stringify(authHintClaims)))
  const authHintToken = await signPayload(authHintPayloadB64, secret)

  res.cookies.set({
    name: AUTH_HINT_COOKIE,
    value: authHintToken,
    ...BASE_PRESENCE_OPTS,
    maxAge: rememberMe ? AUTH_HINT_REMEMBER_TTL_S : AUTH_HINT_SESSION_TTL_S,
  })
}

/** Expire the presence cookie immediately (signout / session revoked). */
export function clearPresenceCookie(res: NextResponse): void {
  for (const cookieName of [PRESENCE_COOKIE, AUTH_HINT_COOKIE]) {
    res.cookies.set({
      name: cookieName,
      value: '',
      ...BASE_PRESENCE_OPTS,
      maxAge: 0,
    })
  }
}

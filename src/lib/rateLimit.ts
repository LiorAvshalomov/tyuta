/**
 * Distributed fixed-window rate limiter.
 *
 * PRIMARY — Upstash Redis (REST API, zero npm packages):
 *   When UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN are set, rate-limit
 *   counters live in Redis and are shared across every Vercel function instance.
 *   Each request takes ~20–60 ms extra (one HTTPS round-trip to Upstash).
 *
 * FALLBACK — in-memory:
 *   When Redis is not configured, or if the Redis call fails (network error,
 *   Upstash downtime), the limiter falls back to an in-memory fixed-window counter.
 *   This provides per-instance protection only — sufficient for local dev and as
 *   a safety net in production.
 *
 * Algorithm (Redis path): INCR + EXPIRE NX in a single pipeline.
 *   INCR   — atomic counter per (key, window-bucket). Returns the new count.
 *   EXPIRE NX — sets TTL only once (on first increment), so the window always
 *               resets at the same point regardless of how many requests arrive.
 *
 * Setup (Vercel):
 *   1. Create a free Redis database at https://console.upstash.com
 *   2. Add to Vercel env vars:
 *        UPSTASH_REDIS_REST_URL   = https://<your-db>.upstash.io
 *        UPSTASH_REDIS_REST_TOKEN = <your-rest-token>
 */

type RateLimitResult =
  | { allowed: true }
  | { allowed: false; retryAfterMs: number }

// ── In-memory fallback ─────────────────────────────────────────────────────

type Entry = { count: number; resetAt: number }
const _buckets = new Map<string, Entry>()
const MAX_KEYS = 10_000

function evictStale(now: number): void {
  if (_buckets.size < MAX_KEYS) return
  for (const [key, entry] of _buckets) {
    if (entry.resetAt <= now) _buckets.delete(key)
    if (_buckets.size < MAX_KEYS * 0.8) break
  }
}

function inMemoryLimit(key: string, maxRequests: number, windowMs: number): RateLimitResult {
  const now = Date.now()
  evictStale(now)
  const entry = _buckets.get(key)
  if (!entry || entry.resetAt <= now) {
    _buckets.set(key, { count: 1, resetAt: now + windowMs })
    return { allowed: true }
  }
  if (entry.count < maxRequests) {
    entry.count++
    return { allowed: true }
  }
  return { allowed: false, retryAfterMs: entry.resetAt - now }
}

// ── Upstash Redis (REST) ───────────────────────────────────────────────────

/**
 * One pipeline call → two Redis commands (INCR + EXPIRE NX).
 * Returns null when Redis is unconfigured or the call fails — caller falls back.
 */
async function redisLimit(
  key: string,
  maxRequests: number,
  windowMs: number,
): Promise<RateLimitResult | null> {
  const baseUrl = process.env.UPSTASH_REDIS_REST_URL
  const token   = process.env.UPSTASH_REDIS_REST_TOKEN
  if (!baseUrl || !token) return null

  try {
    const windowS  = Math.ceil(windowMs / 1000)
    const bucket   = Math.floor(Date.now() / windowMs)
    const redisKey = `rl:${key}:${bucket}`

    const res = await fetch(`${baseUrl}/pipeline`, {
      method:  'POST',
      headers: {
        Authorization:  `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify([
        ['INCR',   redisKey],
        ['EXPIRE', redisKey, windowS, 'NX'],  // NX = set TTL only on first call
      ]),
    })

    if (!res.ok) return null

    // Upstash pipeline response: [{ result: <incr-count> }, { result: 0|1 }]
    const body = await res.json() as Array<{ result: number }>
    const count = body[0]?.result
    if (typeof count !== 'number' || count < 1) return null   // unexpected — fallback

    if (count <= maxRequests) return { allowed: true }

    // Window resets at the start of the next fixed bucket
    const resetMs = (bucket + 1) * windowMs
    return { allowed: false, retryAfterMs: Math.max(0, resetMs - Date.now()) }
  } catch {
    return null   // network error or parse failure — fall back to in-memory
  }
}

// ── Public API ─────────────────────────────────────────────────────────────

/**
 * Check whether a request identified by `key` is within limits.
 *
 * Always async (Redis path requires a network call). Resolves in:
 *   ~0 ms — in-memory path (Redis not configured)
 *   ~20–60 ms — Redis path (Upstash REST)
 *
 * @param key          Unique limiter key, e.g. `"signin:${ip}"`
 * @param maxRequests  Maximum allowed calls within the window
 * @param windowMs     Window duration in milliseconds
 *
 * @returns `{ allowed: true }` if under the limit, or
 *          `{ allowed: false, retryAfterMs }` if exceeded.
 */
export async function rateLimit(
  key: string,
  { maxRequests, windowMs }: { maxRequests: number; windowMs: number },
): Promise<RateLimitResult> {
  const redis = await redisLimit(key, maxRequests, windowMs)
  if (redis !== null) return redis
  return inMemoryLimit(key, maxRequests, windowMs)
}

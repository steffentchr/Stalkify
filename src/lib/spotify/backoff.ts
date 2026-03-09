import { redis } from '@/lib/redis'

const BACKOFF_KEY = 'spotify:rate_limit:until'
const MIN_BACKOFF_MS = 10 * 60 * 1000 // 10 minutes minimum

export class SpotifyRateLimitedError extends Error {
  readonly until: number
  constructor(until: number) {
    super(`Spotify rate limited until ${new Date(until).toISOString()}`)
    this.name = 'SpotifyRateLimitedError'
    this.until = until
  }
}

/** Returns the Unix ms timestamp until which requests should be paused, or 0. */
export async function getBackoffUntil(): Promise<number> {
  const val = await redis.get(BACKOFF_KEY)
  return val ? parseInt(val, 10) : 0
}

/**
 * Set (or extend) the global Spotify API backoff.
 * Uses max(retryAfterSeconds, 10 minutes) as the pause duration.
 */
export async function setBackoff(retryAfterSeconds: number): Promise<number> {
  const waitMs = Math.max(retryAfterSeconds * 1000, MIN_BACKOFF_MS)
  const until = Date.now() + waitMs
  // TTL slightly longer than the backoff so the key persists across restarts
  await redis.set(BACKOFF_KEY, String(until), 'PX', waitMs + 60_000)
  console.warn(
    `[spotify] ⏸ Rate limit backoff until ${new Date(until).toISOString()} ` +
    `(${Math.round(waitMs / 1000)}s — Retry-After was ${retryAfterSeconds}s)`
  )
  return until
}

/**
 * Throws SpotifyRateLimitedError if a global backoff is active.
 * Call this at the start of every Spotify API request.
 * Processors catch this error and move their job to the delayed queue.
 */
export async function checkBackoff(): Promise<void> {
  const until = await getBackoffUntil()
  if (until > Date.now()) {
    throw new SpotifyRateLimitedError(until)
  }
}

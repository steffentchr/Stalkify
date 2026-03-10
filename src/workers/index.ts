import { config } from 'dotenv'
config({ path: '.env.local', override: true })
config({ path: '.env' })

import { Worker, Queue, DelayedError } from 'bullmq'
import type { Job } from 'bullmq'
import { queueConnection } from '@/lib/queue/connection'
import { QueueName } from '@/lib/queue/types'
import { fetchLastfmProcessor } from './processors/fetch-lastfm'
import { matchTracksProcessor } from './processors/match-tracks'
import { syncPlaylistProcessor } from './processors/sync-playlist'
import { autoUpdateProcessor } from './processors/auto-update'
import { SpotifyRateLimitedError, getBackoffUntil } from '@/lib/spotify/backoff'

/**
 * Wraps a processor so that SpotifyRateLimitedError moves the job to the
 * BullMQ delayed queue (at the backoff expiry time) instead of marking it
 * failed. The job resumes automatically when the delay expires — no retry
 * attempts are consumed.
 */
function withSpotifyBackoff<T>(
  processor: (job: Job<T>) => Promise<unknown>
): (job: Job<T>, token?: string) => Promise<unknown> {
  return async (job: Job<T>, token?: string) => {
    try {
      return await processor(job)
    } catch (error) {
      if (error instanceof SpotifyRateLimitedError) {
        console.warn(
          `[${job.queueName}] ⏸ Job ${job.id} parked until ` +
          `${new Date(error.until).toISOString()} — Spotify rate limited`
        )
        try {
          await job.moveToDelayed(error.until, token)
        } catch {
          // Token may have expired; BullMQ will stall-detect and requeue
        }
        throw new DelayedError()
      }
      throw error
    }
  }
}

// Concurrency per worker type.
// match-tracks must be 1: all jobs share one Spotify token and rate limiter,
// so running multiple simultaneously causes burst 403s from Spotify.
const FETCH_CONCURRENCY = parseInt(process.env.FETCH_CONCURRENCY || '2')
const MATCH_CONCURRENCY = parseInt(process.env.MATCH_CONCURRENCY || '3')
const SYNC_CONCURRENCY = parseInt(process.env.SYNC_CONCURRENCY || '2')

// Stall detection: jobs active when the worker crashed get moved back to
// waiting after this interval so they are retried automatically.
const STALL_INTERVAL = 15_000  // check every 15s
const MAX_STALLED   = 3        // retry up to 3 times before marking failed

console.log('🚀 Starting Stalkify workers...')
console.log(`   Concurrency: fetch=${FETCH_CONCURRENCY} match=${MATCH_CONCURRENCY} sync=${SYNC_CONCURRENCY}`)
console.log(`   Redis: ${process.env.REDIS_URL || 'redis://localhost:6379'}`)
console.log(`   Database: ${process.env.DATABASE_URL?.split('@')[1] || 'localhost'}`)
console.log('')

const workerOpts = {
  connection: queueConnection,
  stalledInterval: STALL_INTERVAL,
  maxStalledCount: MAX_STALLED,
  // Jobs can run for several minutes (match-tracks: 100 tracks × 500ms + 403 backoffs).
  // Lock must cover the full job duration; BullMQ renews it every lockDuration/2.
  lockDuration: 5 * 60 * 1000, // 5 minutes
}

// Log pending job counts on startup so we know what's waiting
async function logQueueDepths() {
  const names = [
    QueueName.FETCH_LASTFM,
    QueueName.MATCH_TRACKS,
    QueueName.SYNC_PLAYLIST,
    QueueName.AUTO_UPDATE,
  ]
  for (const name of names) {
    const q = new Queue(name, { connection: queueConnection })
    const [waiting, active, delayed, failed] = await Promise.all([
      q.getWaitingCount(),
      q.getActiveCount(),
      q.getDelayedCount(),
      q.getFailedCount(),
    ])
    await q.close()
    if (waiting + active + delayed > 0) {
      console.log(`   ${name}: ${waiting} waiting, ${active} active (stalled→retry), ${delayed} delayed, ${failed} failed`)
    }
  }
  console.log('')
}

/**
 * Fetch Last.fm worker
 * Entry point for processing new users
 */
const fetchLastfmWorker = new Worker(
  QueueName.FETCH_LASTFM,
  withSpotifyBackoff(fetchLastfmProcessor),
  { ...workerOpts, concurrency: FETCH_CONCURRENCY }
)

fetchLastfmWorker.on('completed', (job) => {
  console.log(`✓ [fetch-lastfm] Job ${job.id} completed`)
})
fetchLastfmWorker.on('failed', (job, error) => {
  console.error(`✗ [fetch-lastfm] Job ${job?.id} failed:`, error.message)
})
fetchLastfmWorker.on('stalled', (jobId) => {
  console.warn(`⚠ [fetch-lastfm] Job ${jobId} stalled — requeueing`)
})

/**
 * Match tracks worker
 * Matches Last.fm tracks to Spotify URIs
 */
const matchTracksWorker = new Worker(
  QueueName.MATCH_TRACKS,
  withSpotifyBackoff(matchTracksProcessor),
  { ...workerOpts, concurrency: MATCH_CONCURRENCY }
)

matchTracksWorker.on('completed', (job) => {
  console.log(`✓ [match-tracks] Job ${job.id} completed`)
})
matchTracksWorker.on('failed', (job, error) => {
  console.error(`✗ [match-tracks] Job ${job?.id} failed:`, error.message)
})
matchTracksWorker.on('stalled', (jobId) => {
  console.warn(`⚠ [match-tracks] Job ${jobId} stalled — requeueing`)
})

/**
 * Sync playlist worker
 * Creates/updates Spotify playlists
 */
const syncPlaylistWorker = new Worker(
  QueueName.SYNC_PLAYLIST,
  withSpotifyBackoff(syncPlaylistProcessor),
  { ...workerOpts, concurrency: SYNC_CONCURRENCY }
)

syncPlaylistWorker.on('completed', (job) => {
  console.log(`✓ [sync-playlist] Job ${job.id} completed`)
})
syncPlaylistWorker.on('failed', (job, error) => {
  console.error(`✗ [sync-playlist] Job ${job?.id} failed:`, error.message)
})
syncPlaylistWorker.on('stalled', (jobId) => {
  console.warn(`⚠ [sync-playlist] Job ${jobId} stalled — requeueing`)
})

/**
 * Auto-update worker
 * Updates stale playlists
 */
const autoUpdateWorker = new Worker(
  QueueName.AUTO_UPDATE,
  withSpotifyBackoff(autoUpdateProcessor),
  { ...workerOpts, concurrency: FETCH_CONCURRENCY }
)

autoUpdateWorker.on('completed', (job) => {
  console.log(`✓ [auto-update] Job ${job.id} completed`)
})
autoUpdateWorker.on('failed', (job, error) => {
  console.error(`✗ [auto-update] Job ${job?.id} failed:`, error.message)
})
autoUpdateWorker.on('stalled', (jobId) => {
  console.warn(`⚠ [auto-update] Job ${jobId} stalled — requeueing`)
})

/**
 * Graceful shutdown
 */
const workers = [
  fetchLastfmWorker,
  matchTracksWorker,
  syncPlaylistWorker,
  autoUpdateWorker,
]

async function shutdown() {
  console.log('\n⏸️  Shutting down workers...')

  try {
    await Promise.all(workers.map(worker => worker.close()))
    console.log('✓ All workers closed')
    process.exit(0)
  } catch (error) {
    console.error('Error during shutdown:', error)
    process.exit(1)
  }
}

process.on('SIGTERM', shutdown)
process.on('SIGINT', shutdown)

// Log queue depths then confirm ready
logQueueDepths().then(() => {
  console.log('✓ Workers started and listening for jobs\n')
})

// Periodic heartbeat: log queue depths + Spotify backoff status every 30s
setInterval(async () => {
  const names = [QueueName.FETCH_LASTFM, QueueName.MATCH_TRACKS, QueueName.SYNC_PLAYLIST, QueueName.AUTO_UPDATE]
  const parts: string[] = []
  for (const name of names) {
    const q = new Queue(name, { connection: queueConnection })
    const [waiting, active, delayed, failed] = await Promise.all([
      q.getWaitingCount(), q.getActiveCount(), q.getDelayedCount(), q.getFailedCount(),
    ])
    await q.close()
    if (waiting + active + delayed + failed > 0) {
      parts.push(`${name}: ${waiting}w ${active}a ${delayed}d ${failed}f`)
    }
  }

  const backoffUntil = await getBackoffUntil()
  const remainingMs = backoffUntil - Date.now()
  if (remainingMs > 0) {
    const remainingSecs = Math.ceil(remainingMs / 1000)
    parts.unshift(`⏸ Spotify backoff: ${remainingSecs}s remaining`)
  }

  if (parts.length > 0) {
    console.log(`[heartbeat] ${parts.join(' | ')}`)
  } else {
    console.log('[heartbeat] all queues empty')
  }
}, 30_000)

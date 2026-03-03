import { Worker } from 'bullmq'
import { queueConnection } from '@/lib/queue/connection'
import { QueueName } from '@/lib/queue/types'
import { fetchLastfmProcessor } from './processors/fetch-lastfm'
import { matchTracksProcessor } from './processors/match-tracks'
import { syncPlaylistProcessor } from './processors/sync-playlist'
import { autoUpdateProcessor } from './processors/auto-update'

const CONCURRENCY = parseInt(process.env.WORKER_CONCURRENCY || '5')

console.log('🚀 Starting Stalkify workers...')
console.log(`   Concurrency: ${CONCURRENCY}`)
console.log(`   Redis: ${process.env.REDIS_URL || 'redis://localhost:6379'}`)
console.log(`   Database: ${process.env.DATABASE_URL?.split('@')[1] || 'localhost'}`)
console.log('')

/**
 * Fetch Last.fm worker
 * Entry point for processing new users
 */
const fetchLastfmWorker = new Worker(
  QueueName.FETCH_LASTFM,
  fetchLastfmProcessor,
  {
    connection: queueConnection,
    concurrency: CONCURRENCY,
  }
)

fetchLastfmWorker.on('completed', (job) => {
  console.log(`✓ [fetch-lastfm] Job ${job.id} completed`)
})

fetchLastfmWorker.on('failed', (job, error) => {
  console.error(`✗ [fetch-lastfm] Job ${job?.id} failed:`, error.message)
})

/**
 * Match tracks worker
 * Matches Last.fm tracks to Spotify URIs
 */
const matchTracksWorker = new Worker(
  QueueName.MATCH_TRACKS,
  matchTracksProcessor,
  {
    connection: queueConnection,
    concurrency: CONCURRENCY,
  }
)

matchTracksWorker.on('completed', (job) => {
  console.log(`✓ [match-tracks] Job ${job.id} completed`)
})

matchTracksWorker.on('failed', (job, error) => {
  console.error(`✗ [match-tracks] Job ${job?.id} failed:`, error.message)
})

/**
 * Sync playlist worker
 * Creates/updates Spotify playlists
 */
const syncPlaylistWorker = new Worker(
  QueueName.SYNC_PLAYLIST,
  syncPlaylistProcessor,
  {
    connection: queueConnection,
    concurrency: CONCURRENCY,
  }
)

syncPlaylistWorker.on('completed', (job) => {
  console.log(`✓ [sync-playlist] Job ${job.id} completed`)
})

syncPlaylistWorker.on('failed', (job, error) => {
  console.error(`✗ [sync-playlist] Job ${job?.id} failed:`, error.message)
})

/**
 * Auto-update worker
 * Updates stale playlists
 */
const autoUpdateWorker = new Worker(
  QueueName.AUTO_UPDATE,
  autoUpdateProcessor,
  {
    connection: queueConnection,
    concurrency: CONCURRENCY,
  }
)

autoUpdateWorker.on('completed', (job) => {
  console.log(`✓ [auto-update] Job ${job.id} completed`)
})

autoUpdateWorker.on('failed', (job, error) => {
  console.error(`✗ [auto-update] Job ${job?.id} failed:`, error.message)
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

// Keep the process alive
console.log('✓ Workers started and listening for jobs\n')

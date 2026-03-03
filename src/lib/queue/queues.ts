import { Queue } from 'bullmq'
import { queueConnection } from './connection'
import {
  QueueName,
  FetchLastfmJobData,
  MatchTracksJobData,
  SyncPlaylistJobData,
  AutoUpdateJobData,
} from './types'

/**
 * Default job options
 */
const defaultJobOptions = {
  attempts: 3,
  backoff: {
    type: 'exponential' as const,
    delay: 2000,
  },
  removeOnComplete: {
    count: 100,
  },
  removeOnFail: {
    count: 500,
  },
}

/**
 * Fetch Last.fm data queue
 * Entry point for processing a new user
 */
export const fetchLastfmQueue = new Queue<FetchLastfmJobData>(
  QueueName.FETCH_LASTFM,
  {
    connection: queueConnection,
    defaultJobOptions,
  }
)

/**
 * Match tracks to Spotify queue
 * Runs in parallel for each playlist/feed type
 */
export const matchTracksQueue = new Queue<MatchTracksJobData>(
  QueueName.MATCH_TRACKS,
  {
    connection: queueConnection,
    defaultJobOptions: {
      ...defaultJobOptions,
      attempts: 2, // Fewer retries for track matching
    },
  }
)

/**
 * Sync playlist to Spotify queue
 * Creates or updates Spotify playlists
 */
export const syncPlaylistQueue = new Queue<SyncPlaylistJobData>(
  QueueName.SYNC_PLAYLIST,
  {
    connection: queueConnection,
    defaultJobOptions,
  }
)

/**
 * Auto-update queue
 * Triggered by cron for stale playlists
 */
export const autoUpdateQueue = new Queue<AutoUpdateJobData>(
  QueueName.AUTO_UPDATE,
  {
    connection: queueConnection,
    defaultJobOptions: {
      ...defaultJobOptions,
      attempts: 2,
    },
  }
)

/**
 * Helper to get queue by name
 */
export function getQueue(name: QueueName): Queue {
  switch (name) {
    case QueueName.FETCH_LASTFM:
      return fetchLastfmQueue
    case QueueName.MATCH_TRACKS:
      return matchTracksQueue
    case QueueName.SYNC_PLAYLIST:
      return syncPlaylistQueue
    case QueueName.AUTO_UPDATE:
      return autoUpdateQueue
    default:
      throw new Error(`Unknown queue: ${name}`)
  }
}

/**
 * Gracefully close all queues
 */
export async function closeAllQueues(): Promise<void> {
  await Promise.all([
    fetchLastfmQueue.close(),
    matchTracksQueue.close(),
    syncPlaylistQueue.close(),
    autoUpdateQueue.close(),
  ])
}

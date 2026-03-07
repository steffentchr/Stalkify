import { Queue } from 'bullmq'
import { queueConnection } from './connection'
import {
  QueueName,
  FetchLastfmJobData,
  MatchTracksJobData,
  SyncPlaylistJobData,
  AutoUpdateJobData,
} from './types'

const defaultJobOptions = {
  attempts: 3,
  backoff: {
    type: 'exponential' as const,
    delay: 2000,
  },
  removeOnComplete: { count: 100 },
  removeOnFail: { count: 500 },
}

/**
 * Lazy queue instances — created on first access to avoid Redis connections at
 * import/build time.
 */
let _fetchLastfmQueue: Queue<FetchLastfmJobData> | null = null
let _matchTracksQueue: Queue<MatchTracksJobData> | null = null
let _syncPlaylistQueue: Queue<SyncPlaylistJobData> | null = null
let _autoUpdateQueue: Queue<AutoUpdateJobData> | null = null

export function getFetchLastfmQueue(): Queue<FetchLastfmJobData> {
  if (!_fetchLastfmQueue) {
    _fetchLastfmQueue = new Queue<FetchLastfmJobData>(QueueName.FETCH_LASTFM, {
      connection: queueConnection,
      defaultJobOptions,
    })
  }
  return _fetchLastfmQueue
}

export function getMatchTracksQueue(): Queue<MatchTracksJobData> {
  if (!_matchTracksQueue) {
    _matchTracksQueue = new Queue<MatchTracksJobData>(QueueName.MATCH_TRACKS, {
      connection: queueConnection,
      defaultJobOptions: {
        ...defaultJobOptions,
        // 20 attempts with 1h fixed backoff survives up to 20h of Spotify rate limiting
        attempts: 20,
        backoff: { type: 'fixed', delay: 60 * 60 * 1000 },
      },
    })
  }
  return _matchTracksQueue
}

export function getSyncPlaylistQueue(): Queue<SyncPlaylistJobData> {
  if (!_syncPlaylistQueue) {
    _syncPlaylistQueue = new Queue<SyncPlaylistJobData>(QueueName.SYNC_PLAYLIST, {
      connection: queueConnection,
      defaultJobOptions,
    })
  }
  return _syncPlaylistQueue
}

export function getAutoUpdateQueue(): Queue<AutoUpdateJobData> {
  if (!_autoUpdateQueue) {
    _autoUpdateQueue = new Queue<AutoUpdateJobData>(QueueName.AUTO_UPDATE, {
      connection: queueConnection,
      defaultJobOptions: { ...defaultJobOptions, attempts: 2 },
    })
  }
  return _autoUpdateQueue
}

export function getQueue(name: QueueName): Queue {
  switch (name) {
    case QueueName.FETCH_LASTFM: return getFetchLastfmQueue()
    case QueueName.MATCH_TRACKS: return getMatchTracksQueue()
    case QueueName.SYNC_PLAYLIST: return getSyncPlaylistQueue()
    case QueueName.AUTO_UPDATE: return getAutoUpdateQueue()
    default: throw new Error(`Unknown queue: ${name}`)
  }
}

export async function closeAllQueues(): Promise<void> {
  await Promise.all([
    _fetchLastfmQueue?.close(),
    _matchTracksQueue?.close(),
    _syncPlaylistQueue?.close(),
    _autoUpdateQueue?.close(),
  ])
}

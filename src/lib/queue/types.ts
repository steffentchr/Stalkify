import { FeedType } from '@prisma/client'

/**
 * Queue names
 */
export enum QueueName {
  FETCH_LASTFM = 'fetch-lastfm',
  MATCH_TRACKS = 'match-tracks',
  SYNC_PLAYLIST = 'sync-playlist',
  AUTO_UPDATE = 'auto-update',
}

/**
 * Job data types
 */

export interface FetchLastfmJobData {
  username: string
  processingJobId: string
  isInitialProcess: boolean
}

export interface MatchTracksJobData {
  playlistId: string
  tracks: Array<{
    trackName: string
    artistName: string
    albumName?: string
  }>
  processingJobId: string
}

export interface SyncPlaylistJobData {
  playlistId: string
  processingJobId: string
}

export interface AutoUpdateJobData {
  playlistId: string
}

/**
 * Job result types
 */

export interface FetchLastfmJobResult {
  userId: string
  playlistIds: string[]
  totalTracks: number
  totalArtists: number
}

export interface MatchTracksJobResult {
  playlistId: string
  matchedCount: number
  unmatchedCount: number
  totalTracks: number
}

export interface SyncPlaylistJobResult {
  playlistId: string
  spotifyUri: string
  trackCount: number
}

export interface AutoUpdateJobResult {
  playlistId: string
  updated: boolean
  tracksAdded: number
}

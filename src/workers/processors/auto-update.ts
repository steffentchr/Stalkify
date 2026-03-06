import { Job } from 'bullmq'
import { FeedType } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { cachedLastfmClient } from '@/lib/lastfm/cache'
import { aggregateTopTracks } from '@/lib/lastfm/aggregate'
import { getMatchTracksQueue, getSyncPlaylistQueue } from '@/lib/queue/queues'
import {
  AutoUpdateJobData,
  AutoUpdateJobResult,
  MatchTracksJobData,
  SyncPlaylistJobData,
} from '@/lib/queue/types'

/**
 * Auto-update worker processor
 *
 * Triggered by cron for stale playlists
 * Fetches fresh data from Last.fm and updates the playlist
 */
export async function autoUpdateProcessor(
  job: Job<AutoUpdateJobData>
): Promise<AutoUpdateJobResult> {
  const { playlistId } = job.data

  console.log(`[auto-update] Updating playlist ${playlistId}`)

  try {
    await job.updateProgress(10)

    // 1. Get playlist details
    const playlist = await prisma.playlist.findUnique({
      where: { id: playlistId },
      include: {
        user: true,
      },
    })

    if (!playlist) {
      throw new Error(`Playlist ${playlistId} not found`)
    }

    const username = playlist.user.username

    await job.updateProgress(20)

    // 2. Fetch fresh data from Last.fm based on feed type
    console.log(`[auto-update] Fetching fresh ${playlist.feedType} data for ${username}`)

    let tracks
    let shouldUpdate = false

    switch (playlist.feedType) {
      case FeedType.RECENT:
        // For recent tracks, always update (most dynamic)
        tracks = await cachedLastfmClient.getRecentTracks(username, 20)
        shouldUpdate = true
        break

      case FeedType.ALL_TIME:
        tracks = await cachedLastfmClient.getTopTracks(username, 'overall', 50)
        shouldUpdate = true
        break

      case FeedType.WEEKLY:
        tracks = await cachedLastfmClient.getTopTracks(username, '7day', 50)
        shouldUpdate = true
        break

      case FeedType.THREE_MONTH:
        tracks = await cachedLastfmClient.getTopTracks(username, '3month', 50)
        shouldUpdate = true
        break

      case FeedType.SIX_MONTH:
        tracks = await cachedLastfmClient.getTopTracks(username, '6month', 50)
        shouldUpdate = true
        break

      case FeedType.YEARLY:
        tracks = await cachedLastfmClient.getTopTracks(username, '12month', 50)
        shouldUpdate = true
        break

      case FeedType.YEAR: {
        if (!playlist.year) break
        const scrobbles = await cachedLastfmClient.getAllScrobblesForYear(username, playlist.year)
        const topTracks = aggregateTopTracks(scrobbles, 100)
        if (topTracks.length >= 10) {
          tracks = topTracks.map(t => ({
            name: t.trackName,
            artist: { name: t.artistName },
            album: t.albumName ? { name: t.albumName } : undefined,
          })) as any
          shouldUpdate = true
        }
        break
      }

      default:
        throw new Error(`Unknown feed type: ${playlist.feedType}`)
    }

    if (!shouldUpdate || tracks.length === 0) {
      console.log(`[auto-update] No updates needed for playlist ${playlistId}`)

      // Update nextUpdateAt
      await prisma.playlist.update({
        where: { id: playlistId },
        data: {
          nextUpdateAt: new Date(Date.now() + playlist.updateInterval * 60 * 1000),
        },
      })

      return {
        playlistId,
        updated: false,
        tracksAdded: 0,
      }
    }

    await job.updateProgress(50)

    // 3. Delete old tracks and queue new matching
    console.log(`[auto-update] Updating ${tracks.length} tracks`)

    await prisma.playlistTrack.deleteMany({
      where: { playlistId },
    })

    const trackData = tracks.map((track, index) => ({
      trackName: track.name,
      artistName: track.artist.name,
      albumName: track.album?.name,
    }))

    // Create a temporary processing job ID for tracking
    const tempJobId = `auto-update-${playlistId}-${Date.now()}`

    await job.updateProgress(70)

    // 4. Queue match and sync jobs
    await getMatchTracksQueue().add(
      `match-${playlistId}`,
      {
        playlistId,
        tracks: trackData,
        processingJobId: tempJobId,
      } as MatchTracksJobData
    )

    await job.updateProgress(90)

    // 5. Update nextUpdateAt
    await prisma.playlist.update({
      where: { id: playlistId },
      data: {
        nextUpdateAt: new Date(Date.now() + playlist.updateInterval * 60 * 1000),
      },
    })

    await job.updateProgress(100)

    console.log(`[auto-update] Successfully queued update for playlist ${playlistId}`)

    return {
      playlistId,
      updated: true,
      tracksAdded: tracks.length,
    }
  } catch (error) {
    console.error(`[auto-update] Error updating playlist ${playlistId}:`, error)
    throw error
  }
}

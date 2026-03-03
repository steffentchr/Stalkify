import { Job } from 'bullmq'
import { prisma } from '@/lib/prisma'
import { spotifyClient } from '@/lib/spotify/client'
import {
  SyncPlaylistJobData,
  SyncPlaylistJobResult,
} from '@/lib/queue/types'

/**
 * Sync playlist to Spotify worker processor
 *
 * Creates or updates a Spotify playlist with matched tracks
 */
export async function syncPlaylistProcessor(
  job: Job<SyncPlaylistJobData>
): Promise<SyncPlaylistJobResult> {
  const { playlistId, processingJobId } = job.data

  console.log(`[sync-playlist] Syncing playlist ${playlistId} to Spotify`)

  try {
    await job.updateProgress(10)

    // 1. Get playlist and tracks from database
    const playlist = await prisma.playlist.findUnique({
      where: { id: playlistId },
      include: {
        user: true,
        tracks: {
          where: {
            spotifyUri: { not: null },
          },
          orderBy: { position: 'asc' },
        },
      },
    })

    if (!playlist) {
      throw new Error(`Playlist ${playlistId} not found`)
    }

    await job.updateProgress(20)

    // 2. Get Spotify user ID
    const spotifyUser = await spotifyClient.getCurrentUser()

    await job.updateProgress(30)

    // 3. Create or update Spotify playlist
    let spotifyPlaylist

    if (playlist.spotifyId) {
      // Playlist exists, update it
      console.log(`[sync-playlist] Updating existing Spotify playlist ${playlist.spotifyId}`)

      try {
        spotifyPlaylist = await spotifyClient.getPlaylist(playlist.spotifyId)
      } catch (error) {
        // Playlist not found, create new one
        console.log(`[sync-playlist] Existing playlist not found, creating new one`)
        spotifyPlaylist = null
      }
    }

    if (!spotifyPlaylist) {
      // Create new playlist
      console.log(`[sync-playlist] Creating new Spotify playlist`)

      const feedTypeLabels: Record<string, string> = {
        RECENT: 'recent',
        ALL_TIME: 'all-time top tracks',
        WEEKLY: 'top tracks this week',
        THREE_MONTH: '3-month top tracks',
        SIX_MONTH: '6-months top tracks',
        YEARLY: 'top tracks this year',
      }

      const description = `Auto-updating playlist from ${playlist.user.username}'s Last.fm data. Generated with Stalkify.`

      spotifyPlaylist = await spotifyClient.createPlaylist(
        spotifyUser.id,
        playlist.name,
        description,
        true // public
      )

      // Update database with Spotify IDs
      await prisma.playlist.update({
        where: { id: playlistId },
        data: {
          spotifyId: spotifyPlaylist.id,
          spotifyUri: spotifyPlaylist.uri,
        },
      })
    }

    await job.updateProgress(50)

    // 4. Sync tracks to Spotify
    const trackUris = playlist.tracks
      .map(t => t.spotifyUri)
      .filter((uri): uri is string => uri !== null)

    console.log(`[sync-playlist] Syncing ${trackUris.length} tracks to Spotify`)

    if (trackUris.length > 0) {
      await spotifyClient.replacePlaylistTracks(spotifyPlaylist.id, trackUris)
    } else {
      // Clear playlist if no tracks
      await spotifyClient.clearPlaylist(spotifyPlaylist.id)
    }

    await job.updateProgress(80)

    // 5. Update playlist metadata
    await prisma.playlist.update({
      where: { id: playlistId },
      data: {
        trackCount: trackUris.length,
        lastUpdatedAt: new Date(),
      },
    })

    await job.updateProgress(90)

    // 6. Check if all playlists for this processing job are complete
    const processingJob = await prisma.processingJob.findUnique({
      where: { jobId: processingJobId },
      include: {
        _count: true,
      },
    })

    if (processingJob) {
      // Get all playlists for the user
      const username = processingJob.username
      const user = await prisma.lastfmUser.findUnique({
        where: { username },
        include: {
          playlists: true,
        },
      })

      if (user) {
        const allPlaylistsSynced = user.playlists.every(p => p.spotifyId !== '')

        if (allPlaylistsSynced) {
          // Mark processing job as complete
          await prisma.processingJob.update({
            where: { jobId: processingJobId },
            data: {
              status: 'COMPLETED',
              progress: 100,
              currentStep: 'Complete',
              completedAt: new Date(),
            },
          })

          console.log(`[sync-playlist] All playlists synced! Processing job ${processingJobId} complete`)
        }
      }
    }

    await job.updateProgress(100)

    console.log(`[sync-playlist] Successfully synced playlist to ${spotifyPlaylist.uri}`)

    return {
      playlistId,
      spotifyUri: spotifyPlaylist.uri,
      trackCount: trackUris.length,
    }
  } catch (error) {
    console.error(`[sync-playlist] Error syncing playlist ${playlistId}:`, error)

    // Update processing job with error (but don't fail the whole job)
    try {
      await prisma.processingJob.update({
        where: { jobId: processingJobId },
        data: {
          errorMessage: `Playlist sync error: ${error instanceof Error ? error.message : 'Unknown error'}`,
        },
      })
    } catch (updateError) {
      console.error(`[sync-playlist] Error updating processing job:`, updateError)
    }

    throw error
  }
}

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

  console.log(`[sync-playlist] ▶ Syncing playlist ${playlistId}`)

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

    console.log(`[sync-playlist] "${playlist.name}" — ${playlist.tracks.length} matched tracks`)

    await job.updateProgress(20)

    // 2. Get Spotify user ID
    const spotifyUser = await spotifyClient.getCurrentUser()

    await job.updateProgress(30)

    // 3. Create or update Spotify playlist
    let spotifyPlaylist

    if (playlist.spotifyId && !playlist.spotifyId.startsWith('pending_')) {
      // Playlist exists on Spotify, update it
      console.log(`[sync-playlist] Updating existing Spotify playlist "${playlist.name}"`)

      try {
        spotifyPlaylist = await spotifyClient.getPlaylist(playlist.spotifyId)
      } catch (error) {
        // Playlist not found, create new one
        console.log(`[sync-playlist] Existing playlist not found on Spotify, will create new`)
        spotifyPlaylist = null
      }
    }

    if (!spotifyPlaylist) {
      // Create new playlist
      console.log(`[sync-playlist] Creating new Spotify playlist: "${playlist.name}"`)

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

    console.log(`[sync-playlist] Pushing ${trackUris.length} tracks to Spotify...`)

    if (trackUris.length > 0) {
      await spotifyClient.replacePlaylistTracks(spotifyPlaylist.id, trackUris)
    }
    // No need to clear a newly created playlist — it's already empty

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
        const allPlaylistsSynced = user.playlists.every(p => p.spotifyId && !p.spotifyId.startsWith('pending_'))

        if (allPlaylistsSynced && processingJob.status !== 'FAILED') {
          // Mark processing job as complete (don't overwrite a FAILED status)
          await prisma.processingJob.update({
            where: { jobId: processingJobId },
            data: {
              status: 'COMPLETED',
              progress: 100,
              currentStep: 'Complete',
              completedAt: new Date(),
            },
          })

          console.log(`[sync-playlist] ✓ All playlists synced — processing job complete`)
        }
      }
    }

    await job.updateProgress(100)

    console.log(`[sync-playlist] ✓ "${playlist.name}" → ${spotifyPlaylist.external_urls?.spotify ?? spotifyPlaylist.uri} (${trackUris.length} tracks)`)

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

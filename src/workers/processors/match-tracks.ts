import { Job } from 'bullmq'
import { prisma } from '@/lib/prisma'
import { matchTrackToSpotify } from '@/lib/spotify/search'
import { getSyncPlaylistQueue } from '@/lib/queue/queues'
import {
  MatchTracksJobData,
  MatchTracksJobResult,
  SyncPlaylistJobData,
} from '@/lib/queue/types'

/**
 * Match tracks to Spotify worker processor
 *
 * Takes a list of tracks from Last.fm and matches them to Spotify URIs
 * using the cache-first strategy.
 */
export async function matchTracksProcessor(
  job: Job<MatchTracksJobData>
): Promise<MatchTracksJobResult> {
  const { playlistId, tracks, processingJobId } = job.data

  // Get playlist name for readable logs
  const playlistMeta = await prisma.playlist.findUnique({ where: { id: playlistId }, select: { name: true } })
  const playlistLabel = playlistMeta?.name ?? playlistId

  console.log(`[match-tracks] ▶ "${playlistLabel}" — matching ${tracks.length} tracks`)

  try {
    // Bail out if the playlist no longer exists (e.g. data was wiped)
    const playlist = await prisma.playlist.findUnique({ where: { id: playlistId } })
    if (!playlist) {
      console.warn(`[match-tracks] Playlist ${playlistId} not found, skipping job`)
      return { matchedCount: 0, unmatchedCount: 0, totalTracks: 0, playlistId }
    }

    // Clear any existing tracks (handles job retries cleanly)
    await prisma.playlistTrack.deleteMany({ where: { playlistId } })

    let matchedCount = 0
    let unmatchedCount = 0

    // Match tracks one by one (cache-first)
    for (let i = 0; i < tracks.length; i++) {
      const track = tracks[i]

      // Update progress
      const progress = Math.floor(((i + 1) / tracks.length) * 100)
      await job.updateProgress(progress)

      try {
        // Match to Spotify (checks cache first)
        const matchResult = await matchTrackToSpotify(
          track.trackName,
          track.artistName
        )

        // Store in playlist_tracks table
        await prisma.playlistTrack.create({
          data: {
            playlistId,
            trackName: track.trackName,
            artistName: track.artistName,
            albumName: track.albumName || null,
            spotifyId: matchResult.spotifyId,
            spotifyUri: matchResult.spotifyUri,
            matchedAt: matchResult.spotifyId ? new Date() : null,
            matchConfidence: matchResult.confidence,
            position: i,
          },
        })

        if (matchResult.spotifyId) {
          matchedCount++
          console.log(
            `[match-tracks] [${i + 1}/${tracks.length}] ✓ "${track.trackName}" — ${track.artistName} ${matchResult.fromCache ? '(cache)' : '(api)'}`
          )
        } else {
          unmatchedCount++
          console.log(
            `[match-tracks] [${i + 1}/${tracks.length}] ✗ "${track.trackName}" — ${track.artistName}`
          )
        }
      } catch (error) {
        console.error(
          `[match-tracks] Error matching "${track.trackName}" by ${track.artistName}:`,
          error
        )
        unmatchedCount++

        // Still create the track record without Spotify info
        await prisma.playlistTrack.create({
          data: {
            playlistId,
            trackName: track.trackName,
            artistName: track.artistName,
            albumName: track.albumName || null,
            spotifyId: null,
            spotifyUri: null,
            position: i,
          },
        })
      }
    }

    // Update playlist track count
    await prisma.playlist.update({
      where: { id: playlistId },
      data: {
        trackCount: matchedCount,
      },
    })

    // Update processing job progress
    await prisma.processingJob.update({
      where: { jobId: processingJobId },
      data: {
        tracksMatched: { increment: matchedCount },
        progress: 80,
      },
    })

    // Queue sync job to create/update Spotify playlist
    await getSyncPlaylistQueue().add(
      `sync-${playlistId}`,
      {
        playlistId,
        processingJobId,
      } as SyncPlaylistJobData
    )

    console.log(
      `[match-tracks] ✓ "${playlistLabel}" — ${matchedCount}/${tracks.length} matched, ${unmatchedCount} unmatched`
    )

    return {
      playlistId,
      matchedCount,
      unmatchedCount,
      totalTracks: tracks.length,
    }
  } catch (error) {
    console.error(`[match-tracks] Error processing playlist ${playlistId}:`, error)
    throw error
  }
}

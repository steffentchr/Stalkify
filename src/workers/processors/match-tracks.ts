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

  console.log(`[match-tracks] Matching ${tracks.length} tracks for playlist ${playlistId}`)

  try {
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
            `[match-tracks] ✓ Matched: "${track.trackName}" by ${track.artistName} ${matchResult.fromCache ? '(cached)' : '(api)'}`
          )
        } else {
          unmatchedCount++
          console.log(
            `[match-tracks] ✗ No match: "${track.trackName}" by ${track.artistName}`
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
      `[match-tracks] Completed: ${matchedCount} matched, ${unmatchedCount} unmatched (${tracks.length} total)`
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

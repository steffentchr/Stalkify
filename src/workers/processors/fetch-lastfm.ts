import { Job } from 'bullmq'
import { FeedType } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { cachedLastfmClient } from '@/lib/lastfm/cache'
import { matchTracksQueue } from '@/lib/queue/queues'
import {
  FetchLastfmJobData,
  FetchLastfmJobResult,
  MatchTracksJobData,
} from '@/lib/queue/types'

/**
 * Fetch Last.fm data worker processor
 *
 * This is the entry point for processing a user.
 * It fetches all Last.fm data and queues track matching jobs.
 */
export async function fetchLastfmProcessor(
  job: Job<FetchLastfmJobData>
): Promise<FetchLastfmJobResult> {
  const { username, processingJobId, isInitialProcess } = job.data

  console.log(`[fetch-lastfm] Processing user: ${username}`)

  try {
    // Update job status
    await prisma.processingJob.update({
      where: { jobId: processingJobId },
      data: {
        status: 'PROCESSING',
        currentStep: 'Fetching Last.fm data',
        startedAt: new Date(),
      },
    })

    await job.updateProgress(10)

    // 1. Check if user exists on Last.fm
    const userExists = await cachedLastfmClient.userExists(username)
    if (!userExists) {
      throw new Error(`Last.fm user "${username}" not found`)
    }

    await job.updateProgress(20)

    // 2. Create or get Last.fm user record
    let user = await prisma.lastfmUser.findUnique({
      where: { username },
    })

    if (!user) {
      user = await prisma.lastfmUser.create({
        data: {
          username,
          processCount: 1,
        },
      })
    } else {
      await prisma.lastfmUser.update({
        where: { id: user.id },
        data: {
          processCount: { increment: 1 },
          lastProcessedAt: new Date(),
        },
      })
    }

    await job.updateProgress(30)

    // 3. Fetch Last.fm data in parallel
    console.log(`[fetch-lastfm] Fetching tracks and artists for ${username}`)

    const [recentTracks, topTracksOverall, topTracks7day, topTracks3month, topTracks6month, topTracks12month, topArtists] = await Promise.all([
      cachedLastfmClient.getRecentTracks(username, 20),
      cachedLastfmClient.getTopTracks(username, 'overall', 50),
      cachedLastfmClient.getTopTracks(username, '7day', 50),
      cachedLastfmClient.getTopTracks(username, '3month', 50),
      cachedLastfmClient.getTopTracks(username, '6month', 50),
      cachedLastfmClient.getTopTracks(username, '12month', 50),
      cachedLastfmClient.getTopArtists(username, 'overall', 48),
    ])

    await job.updateProgress(50)

    // 4. Store top artists
    console.log(`[fetch-lastfm] Storing ${topArtists.length} artists`)

    await prisma.userArtist.deleteMany({
      where: { userId: user.id },
    })

    await prisma.userArtist.createMany({
      data: topArtists.map((artist, index) => ({
        userId: user.id,
        artistName: artist.name,
        imageUrl: artist.image?.find(img => img.size === 'large')?.[  '#text'] || null,
        playCount: artist.playcount,
        rank: index + 1,
        period: 'overall',
      })),
    })

    await job.updateProgress(60)

    // 5. Queue track matching jobs for each playlist type
    console.log(`[fetch-lastfm] Queueing track matching jobs`)

    const playlistConfigs: Array<{
      feedType: FeedType
      tracks: typeof recentTracks
      updateInterval: number
    }> = [
      { feedType: FeedType.RECENT, tracks: recentTracks, updateInterval: 1 },
      { feedType: FeedType.ALL_TIME, tracks: topTracksOverall, updateInterval: 1440 },
      { feedType: FeedType.WEEKLY, tracks: topTracks7day, updateInterval: 1440 },
      { feedType: FeedType.THREE_MONTH, tracks: topTracks3month, updateInterval: 1440 },
      { feedType: FeedType.SIX_MONTH, tracks: topTracks6month, updateInterval: 1440 },
      { feedType: FeedType.YEARLY, tracks: topTracks12month, updateInterval: 1440 },
    ]

    const playlistIds: string[] = []
    let totalTracks = 0

    for (const config of playlistConfigs) {
      // Create or get playlist record
      let playlist = await prisma.playlist.findUnique({
        where: {
          userId_feedType: {
            userId: user.id,
            feedType: config.feedType,
          },
        },
      })

      if (!playlist) {
        // Create placeholder - will be filled by sync worker
        const now = new Date()
        playlist = await prisma.playlist.create({
          data: {
            userId: user.id,
            feedType: config.feedType,
            name: `Stalkify: ${username}'s ${config.feedType.toLowerCase().replace('_', ' ')}`,
            spotifyId: '', // Will be set by sync worker
            spotifyUri: '', // Will be set by sync worker
            updateInterval: config.updateInterval,
            nextUpdateAt: new Date(now.getTime() + config.updateInterval * 60 * 1000),
          },
        })
      }

      playlistIds.push(playlist.id)

      // Delete existing tracks
      await prisma.playlistTrack.deleteMany({
        where: { playlistId: playlist.id },
      })

      // Prepare track data for matching
      const trackData = config.tracks.map((track, index) => ({
        trackName: track.name,
        artistName: track.artist.name,
        albumName: track.album?.name,
      }))

      totalTracks += trackData.length

      // Queue match-tracks job
      if (trackData.length > 0) {
        await matchTracksQueue.add(
          `match-${playlist.id}`,
          {
            playlistId: playlist.id,
            tracks: trackData,
            processingJobId,
          } as MatchTracksJobData,
          {
            priority: config.feedType === FeedType.RECENT ? 1 : 2, // Recent tracks higher priority
          }
        )
      }
    }

    await job.updateProgress(90)

    // 6. Update processing job
    await prisma.processingJob.update({
      where: { jobId: processingJobId },
      data: {
        currentStep: 'Matching tracks to Spotify',
        progress: 60,
        playlistsCreated: playlistIds.length,
      },
    })

    await job.updateProgress(100)

    console.log(`[fetch-lastfm] Successfully queued ${playlistIds.length} playlists with ${totalTracks} total tracks`)

    return {
      userId: user.id,
      playlistIds,
      totalTracks,
      totalArtists: topArtists.length,
    }
  } catch (error) {
    console.error(`[fetch-lastfm] Error processing ${username}:`, error)

    // Update job as failed
    await prisma.processingJob.update({
      where: { jobId: processingJobId },
      data: {
        status: 'FAILED',
        errorMessage: error instanceof Error ? error.message : 'Unknown error',
        completedAt: new Date(),
      },
    })

    throw error
  }
}

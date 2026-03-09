import { Job } from 'bullmq'
import { FeedType } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { cachedLastfmClient } from '@/lib/lastfm/cache'
import { aggregateTopTracks } from '@/lib/lastfm/aggregate'
import { spotifyClient } from '@/lib/spotify/client'
import { matchArtistToSpotify } from '@/lib/spotify/search'
import { SpotifyRateLimitedError } from '@/lib/spotify/backoff'
import { getMatchTracksQueue } from '@/lib/queue/queues'
import {
  FetchLastfmJobData,
  FetchLastfmJobResult,
  MatchTracksJobData,
} from '@/lib/queue/types'

const FEED_TYPE_LABELS: Record<string, string> = {
  RECENT: 'live',
  ALL_TIME: 'all-time',
  WEEKLY: 'this week',
  THREE_MONTH: '3 months',
  SIX_MONTH: '6 months',
  YEARLY: 'this year',
}

function feedTypeLabel(feedType: FeedType): string {
  return FEED_TYPE_LABELS[feedType] || feedType.toLowerCase()
}

async function resolveSpotifyPlaylist(
  playlistId: string,
  name: string,
  description: string,
  spotifyUserId: string,
  spotifyPlaylistByName: Map<string, { id: string; name: string; uri: string }>
): Promise<{ spotifyId: string; spotifyUri: string }> {
  const existing = spotifyPlaylistByName.get(name)
  if (existing) {
    console.log(`[fetch-lastfm] ↩ Reusing existing Spotify playlist "${name}" (${existing.id})`)
    await prisma.playlist.update({ where: { id: playlistId }, data: { name, spotifyId: existing.id, spotifyUri: existing.uri } })
    return { spotifyId: existing.id, spotifyUri: existing.uri }
  }
  const created = await spotifyClient.createPlaylist(spotifyUserId, name, description, true)
  spotifyPlaylistByName.set(name, { id: created.id, name, uri: created.uri })
  await prisma.spotifyAccountPlaylist.upsert({
    where: { spotifyId: created.id },
    create: { spotifyId: created.id, name, uri: created.uri },
    update: { name, uri: created.uri },
  })
  await prisma.playlist.update({ where: { id: playlistId }, data: { name, spotifyId: created.id, spotifyUri: created.uri } })
  console.log(`[fetch-lastfm] ✓ Created Spotify playlist "${name}" (${created.id})`)
  return { spotifyId: created.id, spotifyUri: created.uri }
}

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

  console.log(`[fetch-lastfm] ▶ Starting processing for @${username}`)

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
    console.log(`[fetch-lastfm] Checking Last.fm user @${username}...`)
    const userExists = await cachedLastfmClient.userExists(username)
    if (!userExists) {
      throw new Error(`Last.fm user "${username}" not found`)
    }
    console.log(`[fetch-lastfm] ✓ User @${username} found on Last.fm`)

    await job.updateProgress(20)

    // 2. Create or get Last.fm user record
    console.log(`[fetch-lastfm] Looking up DB user record for @${username}...`)
    let user = await prisma.lastfmUser.findUnique({
      where: { username },
    })

    if (!user) {
      console.log(`[fetch-lastfm] Creating new DB user record for @${username}...`)
      user = await prisma.lastfmUser.create({
        data: {
          username,
          processCount: 1,
        },
      })
    } else {
      console.log(`[fetch-lastfm] Updating existing DB user record for @${username}...`)
      await prisma.lastfmUser.update({
        where: { id: user.id },
        data: {
          processCount: { increment: 1 },
          lastProcessedAt: new Date(),
        },
      })
    }
    console.log(`[fetch-lastfm] ✓ DB user record ready for @${username}`)

    await job.updateProgress(30)

    // 3. Get Spotify user ID and load playlist index from DB
    console.log(`[fetch-lastfm] Fetching Spotify current user...`)
    const spotifyUser = await spotifyClient.getCurrentUser()
    console.log(`[fetch-lastfm] ✓ Spotify user: ${spotifyUser.id}`)

    // Load playlist index from DB. On the very first run (empty table), seed it
    // once from the Spotify API — after that, only playlist creations update it.
    let knownPlaylists = await prisma.spotifyAccountPlaylist.findMany()
    if (knownPlaylists.length === 0) {
      console.log(`[fetch-lastfm] DB playlist index empty — seeding from Spotify API (one-time)...`)
      const ownedPlaylists = await spotifyClient.getMyPlaylists(spotifyUser.id)
      if (ownedPlaylists.length > 0) {
        await prisma.spotifyAccountPlaylist.createMany({
          data: ownedPlaylists.map(p => ({ spotifyId: p.id, name: p.name, uri: p.uri })),
          skipDuplicates: true,
        })
        knownPlaylists = await prisma.spotifyAccountPlaylist.findMany()
        console.log(`[fetch-lastfm] ✓ Seeded ${knownPlaylists.length} playlists into DB index`)
      }
    }
    const spotifyPlaylistByName = new Map(knownPlaylists.map(p => [p.name, { id: p.spotifyId, name: p.name, uri: p.uri }]))
    console.log(`[fetch-lastfm] ✓ Loaded ${knownPlaylists.length} playlists from DB index`)

    // 4. Fetch Last.fm data in parallel
    console.log(`[fetch-lastfm] Fetching tracks and artists for @${username}...`)

    const [recentTracks, topTracksOverall, topTracks7day, topTracks3month, topTracks6month, topTracks12month, topArtists] = await Promise.all([
      cachedLastfmClient.getRecentTracks(username, 20),
      cachedLastfmClient.getTopTracks(username, 'overall', 50),
      cachedLastfmClient.getTopTracks(username, '7day', 50),
      cachedLastfmClient.getTopTracks(username, '3month', 50),
      cachedLastfmClient.getTopTracks(username, '6month', 50),
      cachedLastfmClient.getTopTracks(username, '12month', 50),
      cachedLastfmClient.getTopArtists(username, 'overall', 30),
    ])

    await job.updateProgress(50)

    console.log(`[fetch-lastfm] ✓ Fetched tracks — recent:${recentTracks.length} overall:${topTracksOverall.length} 7d:${topTracks7day.length} 3m:${topTracks3month.length} 6m:${topTracks6month.length} 12m:${topTracks12month.length} artists:${topArtists.length}`)

    // 5. Store top artists with Spotify images
    console.log(`[fetch-lastfm] Fetching Spotify data for ${topArtists.length} artists...`)

    // Match artists to Spotify (cache-first, shared across all users)
    const artistData: Array<{ name: string; imageUrl: string | null; spotifyUrl: string | null; playCount: number }> = []
    for (let i = 0; i < topArtists.length; i += 5) {
      const batch = topArtists.slice(i, i + 5)
      const results = await Promise.all(
        batch.map(async (artist) => {
          const match = await matchArtistToSpotify(artist.name)
          console.log(`[fetch-lastfm]   artist ${match.spotifyId ? '✓' : '✗'} ${artist.name}${match.fromCache ? ' (cache)' : ''}`)
          return {
            name: artist.name,
            imageUrl: match.imageUrl,
            spotifyUrl: match.spotifyUrl,
            playCount: parseInt(String(artist.playcount), 10) || 0,
          }
        })
      )
      artistData.push(...results)
      console.log(`[fetch-lastfm] Artists: ${Math.min(i + 5, topArtists.length)}/${topArtists.length}`)
    }

    await prisma.userArtist.deleteMany({
      where: { userId: user.id },
    })

    await prisma.userArtist.createMany({
      data: artistData.map((artist, index) => ({
        userId: user.id,
        artistName: artist.name,
        imageUrl: artist.imageUrl,
        spotifyUrl: artist.spotifyUrl,
        playCount: artist.playCount,
        rank: index + 1,
        period: 'overall',
      })),
    })

    await job.updateProgress(60)

    // 6. Queue track matching jobs for each playlist type
    console.log(`[fetch-lastfm] Queueing track matching jobs for standard playlists...`)

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
      let playlist = await prisma.playlist.findFirst({
        where: {
          userId: user.id,
          feedType: config.feedType,
          year: null,
        },
      })

      if (!playlist) {
        const name = `@${username} / ${feedTypeLabel(config.feedType)}`
        const existing = spotifyPlaylistByName.get(name)
        let spotifyId: string
        let spotifyUri: string

        if (existing) {
          spotifyId = existing.id
          spotifyUri = existing.uri
          console.log(`[fetch-lastfm] ↩ Reusing existing Spotify playlist "${name}" (${spotifyId})`)
        } else {
          const created = await spotifyClient.createPlaylist(
            spotifyUser.id,
            name,
            `Your Last.fm ${feedTypeLabel(config.feedType)} music, as a Spotify playlist. Generated by Stalkify.`,
            true
          )
          spotifyId = created.id
          spotifyUri = created.uri
          spotifyPlaylistByName.set(name, { id: spotifyId, name, uri: spotifyUri })
          await prisma.spotifyAccountPlaylist.upsert({
            where: { spotifyId },
            create: { spotifyId, name, uri: spotifyUri },
            update: { name, uri: spotifyUri },
          })
          console.log(`[fetch-lastfm] ✓ Created Spotify playlist "${name}" (${spotifyId})`)
        }

        const now = new Date()
        playlist = await prisma.playlist.create({
          data: {
            userId: user.id,
            feedType: config.feedType,
            name,
            spotifyId,
            spotifyUri,
            updateInterval: config.updateInterval,
            nextUpdateAt: new Date(now.getTime() + config.updateInterval * 60 * 1000),
          },
        })
      } else if (playlist.spotifyId.startsWith('pending_')) {
        // Existing DB record never got a real Spotify playlist — resolve it now
        const name = `@${username} / ${feedTypeLabel(config.feedType)}`
        const resolved = await resolveSpotifyPlaylist(
          playlist.id, name,
          `Your Last.fm ${feedTypeLabel(config.feedType)} music, as a Spotify playlist. Generated by Stalkify.`,
          spotifyUser.id, spotifyPlaylistByName
        )
        playlist = { ...playlist, name, ...resolved }
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
        await getMatchTracksQueue().add(
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
        console.log(`[fetch-lastfm] ✓ Queued "${playlist.name}" — ${trackData.length} tracks`)
      }
    }

    // 7. Create per-year playlists on initial process
    if (isInitialProcess) {
      const creationYear = await cachedLastfmClient.getAccountCreationYear(username)
      const currentYear = new Date().getFullYear()
      const totalYears = currentYear - creationYear + 1

      console.log(`[fetch-lastfm] Building year playlists for @${username} (${creationYear}–${currentYear}, ${totalYears} years)`)

      await prisma.processingJob.update({
        where: { jobId: processingJobId },
        data: { currentStep: 'Building year playlists' },
      })

      let yearIndex = 0
      for (let year = creationYear; year <= currentYear; year++) {
        yearIndex++
        console.log(`[fetch-lastfm] Year ${year} (${yearIndex}/${totalYears}) — fetching scrobbles...`)

        try {
          const scrobbles = await cachedLastfmClient.getAllScrobblesForYear(username, year)
          const topTracks = aggregateTopTracks(scrobbles, 100)

          // Skip years with very few unique tracks
          if (topTracks.length < 10) {
            console.log(`[fetch-lastfm] Year ${year} — skipped (${scrobbles.length} scrobbles, ${topTracks.length} unique tracks)`)
            continue
          }

          // Create or get playlist for this year
          let yearPlaylist = await prisma.playlist.findFirst({
            where: {
              userId: user.id,
              feedType: FeedType.YEAR,
              year,
            },
          })

          if (!yearPlaylist) {
            const yearName = `@${username} / ${year}`
            const existing = spotifyPlaylistByName.get(yearName)
            let spotifyId: string
            let spotifyUri: string

            if (existing) {
              spotifyId = existing.id
              spotifyUri = existing.uri
              console.log(`[fetch-lastfm] ↩ Reusing existing Spotify playlist "${yearName}" (${spotifyId})`)
            } else {
              const created = await spotifyClient.createPlaylist(
                spotifyUser.id,
                yearName,
                `Your top tracks from ${year} on Last.fm, as a Spotify playlist. Generated by Stalkify.`,
                true
              )
              spotifyId = created.id
              spotifyUri = created.uri
              spotifyPlaylistByName.set(yearName, { id: spotifyId, name: yearName, uri: spotifyUri })
              await prisma.spotifyAccountPlaylist.upsert({
                where: { spotifyId },
                create: { spotifyId, name: yearName, uri: spotifyUri },
                update: { name: yearName, uri: spotifyUri },
              })
            }

            const now = new Date()
            yearPlaylist = await prisma.playlist.create({
              data: {
                userId: user.id,
                feedType: FeedType.YEAR,
                year,
                name: yearName,
                spotifyId,
                spotifyUri,
                updateInterval: year === currentYear ? 1440 : 0,
                nextUpdateAt: year === currentYear
                  ? new Date(now.getTime() + 1440 * 60 * 1000)
                  : new Date(now.getTime() + 365 * 24 * 60 * 60 * 1000),
              },
            })
          } else if (yearPlaylist.spotifyId.startsWith('pending_')) {
            const yearName = `@${username} / ${year}`
            const resolved = await resolveSpotifyPlaylist(
              yearPlaylist.id, yearName,
              `Your top tracks from ${year} on Last.fm, as a Spotify playlist. Generated by Stalkify.`,
              spotifyUser.id, spotifyPlaylistByName
            )
            yearPlaylist = { ...yearPlaylist, name: yearName, ...resolved }
          }

          playlistIds.push(yearPlaylist.id)

          // Delete existing tracks
          await prisma.playlistTrack.deleteMany({
            where: { playlistId: yearPlaylist.id },
          })

          const trackData = topTracks.map(t => ({
            trackName: t.trackName,
            artistName: t.artistName,
            albumName: t.albumName,
          }))

          totalTracks += trackData.length

          await getMatchTracksQueue().add(
            `match-${yearPlaylist.id}`,
            {
              playlistId: yearPlaylist.id,
              tracks: trackData,
              processingJobId,
            } as MatchTracksJobData,
            { priority: 3 } // Lower priority than standard playlists
          )

          console.log(`[fetch-lastfm] ✓ Year ${year} — ${scrobbles.length} scrobbles → top ${topTracks.length} tracks queued`)
        } catch (yearError) {
          console.error(`[fetch-lastfm] ✗ Year ${year} — failed, skipping:`, yearError instanceof Error ? yearError.message : yearError)
        }
      }
    }

    await job.updateProgress(90)

    // 8. Update processing job
    await prisma.processingJob.update({
      where: { jobId: processingJobId },
      data: {
        currentStep: 'Matching tracks to Spotify',
        progress: 60,
        playlistsCreated: playlistIds.length,
      },
    })

    await job.updateProgress(100)

    console.log(`[fetch-lastfm] ✓ Done — ${playlistIds.length} playlists queued, ${totalTracks} total tracks`)

    return {
      userId: user.id,
      playlistIds,
      totalTracks,
      totalArtists: topArtists.length,
    }
  } catch (error) {
    // Rate-limit pause: let withSpotifyBackoff move the job to delayed.
    // Don't mark as FAILED — the job will resume when the backoff expires.
    if (error instanceof SpotifyRateLimitedError) throw error

    console.error(`[fetch-lastfm] Error processing ${username}:`, error)

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

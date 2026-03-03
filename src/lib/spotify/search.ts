import { prisma } from '../prisma'
import { spotifyClient } from './client'
import { SpotifyTrack } from './types'

/**
 * Normalize search key for caching
 */
function normalizeSearchKey(trackName: string, artistName: string): string {
  const normalize = (str: string) =>
    str
      .toLowerCase()
      .trim()
      // Remove common variations
      .replace(/\(.*?\)/g, '') // Remove parentheses content
      .replace(/\[.*?\]/g, '') // Remove brackets content
      .replace(/\s*-\s*remaster(ed)?.*$/i, '') // Remove remaster info
      .replace(/\s+/g, ' ') // Normalize whitespace
      .trim()

  return `${normalize(trackName)}|${normalize(artistName)}`
}

/**
 * Calculate match confidence score
 */
function calculateConfidence(
  searchTrack: string,
  searchArtist: string,
  foundTrack: SpotifyTrack
): number {
  const normalize = (str: string) => str.toLowerCase().trim()

  const trackMatch = normalize(foundTrack.name).includes(normalize(searchTrack)) ||
    normalize(searchTrack).includes(normalize(foundTrack.name))

  const artistMatch = foundTrack.artists.some(artist =>
    normalize(artist.name).includes(normalize(searchArtist)) ||
    normalize(searchArtist).includes(normalize(artist.name))
  )

  if (trackMatch && artistMatch) {
    // Exact-ish match
    return 1.0
  } else if (trackMatch || artistMatch) {
    // Partial match
    return 0.7
  } else {
    // Weak match
    return 0.5
  }
}

export interface TrackMatchResult {
  spotifyId: string | null
  spotifyUri: string | null
  spotifyTrackName: string | null
  spotifyArtistName: string | null
  confidence: number | null
  fromCache: boolean
}

/**
 * Match a Last.fm track to Spotify (cache-first)
 */
export async function matchTrackToSpotify(
  trackName: string,
  artistName: string
): Promise<TrackMatchResult> {
  const searchKey = normalizeSearchKey(trackName, artistName)

  // 1. Check cache first
  const cached = await prisma.trackCache.findUnique({
    where: { searchKey },
  })

  if (cached) {
    // Update hit statistics
    await prisma.trackCache.update({
      where: { id: cached.id },
      data: {
        hitCount: { increment: 1 },
        lastHitAt: new Date(),
      },
    })

    return {
      spotifyId: cached.spotifyId,
      spotifyUri: cached.spotifyUri,
      spotifyTrackName: cached.spotifyTrackName,
      spotifyArtistName: cached.spotifyArtistName,
      confidence: cached.matchConfidence,
      fromCache: true,
    }
  }

  // 2. Search Spotify API
  try {
    const spotifyTrack = await spotifyClient.searchTrack(trackName, artistName)

    if (spotifyTrack) {
      const confidence = calculateConfidence(trackName, artistName, spotifyTrack)

      // Store in cache
      await prisma.trackCache.create({
        data: {
          searchKey,
          trackName,
          artistName,
          spotifyId: spotifyTrack.id,
          spotifyUri: spotifyTrack.uri,
          spotifyTrackName: spotifyTrack.name,
          spotifyArtistName: spotifyTrack.artists[0]?.name || null,
          matchConfidence: confidence,
          matchMethod: 'api_search',
        },
      })

      return {
        spotifyId: spotifyTrack.id,
        spotifyUri: spotifyTrack.uri,
        spotifyTrackName: spotifyTrack.name,
        spotifyArtistName: spotifyTrack.artists[0]?.name || null,
        confidence,
        fromCache: false,
      }
    } else {
      // No match found, cache as null
      await prisma.trackCache.create({
        data: {
          searchKey,
          trackName,
          artistName,
          spotifyId: null,
          spotifyUri: null,
          spotifyTrackName: null,
          spotifyArtistName: null,
          matchConfidence: null,
          matchMethod: 'not_found',
        },
      })

      return {
        spotifyId: null,
        spotifyUri: null,
        spotifyTrackName: null,
        spotifyArtistName: null,
        confidence: null,
        fromCache: false,
      }
    }
  } catch (error) {
    console.error(`Error matching track "${trackName}" by "${artistName}":`, error)

    // Don't cache errors, allow retry
    return {
      spotifyId: null,
      spotifyUri: null,
      spotifyTrackName: null,
      spotifyArtistName: null,
      confidence: null,
      fromCache: false,
    }
  }
}

/**
 * Batch match multiple tracks
 */
export async function matchTracksToSpotify(
  tracks: Array<{ trackName: string; artistName: string }>
): Promise<TrackMatchResult[]> {
  const results: TrackMatchResult[] = []

  for (const track of tracks) {
    const result = await matchTrackToSpotify(track.trackName, track.artistName)
    results.push(result)
  }

  return results
}

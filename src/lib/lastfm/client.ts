import {
  LastfmRecentTracksResponse,
  LastfmTopTracksResponse,
  LastfmTopArtistsResponse,
  LastfmUserInfoResponse,
  LastfmErrorResponse,
  LastfmApiError,
  LastfmTrack,
  LastfmArtist,
  LastfmUser,
  LastfmPeriod,
} from './types'

const LASTFM_API_URL = 'https://ws.audioscrobbler.com/2.0/'


// Rate limiting: 5 requests per second (conservative)
const RATE_LIMIT_DELAY = 200 // milliseconds

let lastRequestTime = 0

async function rateLimit() {
  const now = Date.now()
  const timeSinceLastRequest = now - lastRequestTime

  if (timeSinceLastRequest < RATE_LIMIT_DELAY) {
    await new Promise(resolve => setTimeout(resolve, RATE_LIMIT_DELAY - timeSinceLastRequest))
  }

  lastRequestTime = Date.now()
}

async function fetchLastfm<T>(params: Record<string, string>): Promise<T> {
  const apiKey = process.env.LASTFM_API_KEY; if (!apiKey) {
    throw new Error('LASTFM_API_KEY environment variable is not set')
  }

  await rateLimit()

  const url = new URL(LASTFM_API_URL)
  url.searchParams.set('api_key', apiKey)
  url.searchParams.set('format', 'json')

  Object.entries(params).forEach(([key, value]) => {
    url.searchParams.set(key, value)
  })

  const response = await fetch(url.toString())
  const data = await response.json()

  // Check for Last.fm API errors
  if ('error' in data) {
    const errorData = data as LastfmErrorResponse
    throw new LastfmApiError(errorData.error, errorData.message)
  }

  if (!response.ok) {
    throw new LastfmApiError(
      response.status,
      `Last.fm API request failed: ${response.statusText}`
    )
  }

  return data as T
}

export class LastfmClient {
  /**
   * Get recent tracks for a user
   */
  async getRecentTracks(username: string, limit = 20): Promise<LastfmTrack[]> {
    const response = await fetchLastfm<LastfmRecentTracksResponse>({
      method: 'user.getrecenttracks',
      user: username,
      limit: limit.toString(),
    })

    // Recent tracks have artist as { '#text': name } instead of { name: name }
    const tracks = response.recenttracks?.track || []
    return tracks
      .filter(t => !t['@attr']?.nowplaying) // Skip "now playing" entry
      .map(t => ({
        ...t,
        artist: {
          name: (t.artist as any)['#text'] || (t.artist as any).name || 'Unknown',
          mbid: t.artist?.mbid,
        },
        album: t.album ? {
          name: (t.album as any)['#text'] || (t.album as any).name || '',
          mbid: t.album?.mbid,
        } : undefined,
      }))
  }

  /**
   * Get top tracks for a user in a specific period
   */
  async getTopTracks(
    username: string,
    period: LastfmPeriod = 'overall',
    limit = 50
  ): Promise<LastfmTrack[]> {
    const response = await fetchLastfm<LastfmTopTracksResponse>({
      method: 'user.gettoptracks',
      user: username,
      period,
      limit: limit.toString(),
    })

    return response.toptracks?.track || []
  }

  /**
   * Get top artists for a user
   */
  async getTopArtists(
    username: string,
    period: LastfmPeriod = 'overall',
    limit = 48
  ): Promise<LastfmArtist[]> {
    const response = await fetchLastfm<LastfmTopArtistsResponse>({
      method: 'user.gettopartists',
      user: username,
      period,
      limit: limit.toString(),
    })

    return response.topartists?.artist || []
  }

  /**
   * Get user info
   */
  async getUserInfo(username: string): Promise<LastfmUser> {
    const response = await fetchLastfm<LastfmUserInfoResponse>({
      method: 'user.getinfo',
      user: username,
    })

    return response.user
  }

  /**
   * Get the year a user's account was created
   */
  async getAccountCreationYear(username: string): Promise<number> {
    const user = await this.getUserInfo(username)
    if (user.registered?.unixtime) {
      return new Date(parseInt(user.registered.unixtime) * 1000).getFullYear()
    }
    // Fallback to current year if no registration date
    return new Date().getFullYear()
  }

  /**
   * Get all scrobbles for a specific calendar year
   * Paginates through the entire year's history
   */
  async getAllScrobblesForYear(username: string, year: number): Promise<LastfmTrack[]> {
    const from = Math.floor(new Date(year, 0, 1).getTime() / 1000) // Jan 1
    const to = Math.floor(new Date(year + 1, 0, 1).getTime() / 1000) // Jan 1 next year

    const allTracks: LastfmTrack[] = []
    let page = 1
    const limit = 200
    const maxPages = 100 // Cap at 20,000 scrobbles per year

    while (page <= maxPages) {
      const response = await fetchLastfm<LastfmRecentTracksResponse>({
        method: 'user.getrecenttracks',
        user: username,
        limit: limit.toString(),
        from: from.toString(),
        to: to.toString(),
        page: page.toString(),
      })

      const rawTracks = response.recenttracks?.track || []
      // Last.fm returns an object instead of array when there's only 1 track
      const tracks = Array.isArray(rawTracks) ? rawTracks : [rawTracks]
      if (tracks.length === 0) break

      // Normalize artist/album fields (same as getRecentTracks)
      const normalized = tracks
        .filter(t => !t['@attr']?.nowplaying)
        .map(t => ({
          ...t,
          artist: {
            name: (t.artist as any)['#text'] || (t.artist as any).name || 'Unknown',
            mbid: t.artist?.mbid,
          },
          album: t.album ? {
            name: (t.album as any)['#text'] || (t.album as any).name || '',
            mbid: t.album?.mbid,
          } : undefined,
        }))

      allTracks.push(...normalized)

      const totalPages = parseInt(response.recenttracks['@attr'].totalPages)
      if (page >= totalPages) break
      page++
    }

    console.log(`[lastfm] Fetched ${allTracks.length} scrobbles for ${username} in ${year} (${page} pages)`)
    return allTracks
  }

  /**
   * Check if a user exists
   */
  async userExists(username: string): Promise<boolean> {
    try {
      await this.getUserInfo(username)
      return true
    } catch (error) {
      if (error instanceof LastfmApiError && error.code === 6) {
        // User not found
        return false
      }
      throw error
    }
  }
}

// Export singleton instance
export const lastfmClient = new LastfmClient()

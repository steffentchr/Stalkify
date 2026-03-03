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
const API_KEY = process.env.LASTFM_API_KEY

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
  if (!API_KEY) {
    throw new Error('LASTFM_API_KEY environment variable is not set')
  }

  await rateLimit()

  const url = new URL(LASTFM_API_URL)
  url.searchParams.set('api_key', API_KEY)
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

    return response.recenttracks?.track || []
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

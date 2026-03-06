import { getValidAccessToken } from './auth'
import {
  SpotifyApiError,
  SpotifyArtist,
  SpotifyTrack,
  SpotifyPlaylist,
  SpotifySearchResponse,
  SpotifyUser,
} from './types'

const SPOTIFY_API_URL = 'https://api.spotify.com/v1'

// Conservative rate limit: ~2 requests/second
const RATE_LIMIT_DELAY = 500 // milliseconds

// Queue-based rate limiter: each caller atomically reserves a time slot
let nextAllowedAt = 0

async function rateLimit() {
  // Atomically reserve the next available slot (JS single-threaded — safe without locks)
  const mySlot = Math.max(Date.now(), nextAllowedAt)
  nextAllowedAt = mySlot + RATE_LIMIT_DELAY

  const delay = mySlot - Date.now()
  if (delay > 0) {
    await new Promise(resolve => setTimeout(resolve, delay))
  }
}

async function fetchSpotify<T>(
  endpoint: string,
  options: RequestInit = {},
  retries = 3
): Promise<T> {
  await rateLimit()

  const accessToken = await getValidAccessToken()
  const url = `${SPOTIFY_API_URL}${endpoint}`

  const response = await fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      ...options.headers,
    },
  })

  // Handle rate limiting: back off for Retry-After seconds then retry
  if (response.status === 429 && retries > 0) {
    const retryAfter = parseInt(response.headers.get('Retry-After') || '5', 10)
    const waitMs = (retryAfter + 1) * 1000
    console.warn(`[spotify] 429 rate limited, retrying after ${retryAfter}s (${retries} retries left)`)
    await new Promise(resolve => setTimeout(resolve, waitMs))
    return fetchSpotify<T>(endpoint, options, retries - 1)
  }

  // 403: Spotify sometimes rate-limits via 403 instead of 429 — back off and retry
  if (response.status === 403 && retries > 0) {
    const backoff = (4 - retries) * 3000 // 3s, 6s, 9s — escalating backoff
    console.warn(`[spotify] 403 on ${endpoint}, backing off ${backoff / 1000}s and retrying (${retries} retries left)`)
    await new Promise(resolve => setTimeout(resolve, backoff))
    return fetchSpotify<T>(endpoint, options, retries - 1)
  }

  if (!response.ok) {
    const error = await response.json().catch(() => ({}))
    throw new SpotifyApiError(
      response.status,
      error.error?.message || response.statusText,
      error
    )
  }

  // Handle 204 No Content
  if (response.status === 204) {
    return {} as T
  }

  return response.json()
}

export class SpotifyClient {
  /**
   * Get current user's Spotify profile
   */
  async getCurrentUser(): Promise<SpotifyUser> {
    return fetchSpotify<SpotifyUser>('/me')
  }

  /**
   * Search for a track
   */
  async searchTrack(
    trackName: string,
    artistName: string
  ): Promise<SpotifyTrack | null> {
    const query = `track:${trackName} artist:${artistName}`
    const params = new URLSearchParams({
      q: query,
      type: 'track',
      limit: '1',
    })

    const response = await fetchSpotify<SpotifySearchResponse>(`/search?${params}`)

    return response.tracks.items[0] || null
  }

  /**
   * Search for an artist
   */
  async searchArtist(artistName: string): Promise<SpotifyArtist | null> {
    const params = new URLSearchParams({
      q: `artist:${artistName}`,
      type: 'artist',
      limit: '1',
    })

    const response = await fetchSpotify<SpotifySearchResponse>(`/search?${params}`)

    return response.artists?.items[0] || null
  }

  /**
   * Create a new playlist
   */
  async createPlaylist(
    userId: string,
    name: string,
    description: string,
    isPublic = true
  ): Promise<SpotifyPlaylist> {
    return fetchSpotify<SpotifyPlaylist>(`/me/playlists`, {
      method: 'POST',
      body: JSON.stringify({
        name,
        description,
        public: isPublic,
      }),
    })
  }

  /**
   * Get a playlist by ID
   */
  async getPlaylist(playlistId: string): Promise<SpotifyPlaylist> {
    return fetchSpotify<SpotifyPlaylist>(`/playlists/${playlistId}`)
  }

  /**
   * Update playlist details
   */
  async updatePlaylist(
    playlistId: string,
    updates: {
      name?: string
      description?: string
      public?: boolean
    }
  ): Promise<void> {
    await fetchSpotify(`/playlists/${playlistId}`, {
      method: 'PUT',
      body: JSON.stringify(updates),
    })
  }

  /**
   * Replace all tracks in a playlist
   */
  async replacePlaylistTracks(
    playlistId: string,
    trackUris: string[]
  ): Promise<void> {
    // Spotify allows max 100 tracks per request
    const chunks = []
    for (let i = 0; i < trackUris.length; i += 100) {
      chunks.push(trackUris.slice(i, i + 100))
    }

    // Replace with first chunk
    if (chunks.length > 0) {
      await fetchSpotify(`/playlists/${playlistId}/items`, {
        method: 'PUT',
        body: JSON.stringify({ uris: chunks[0] }),
      })
    }

    // Add remaining chunks
    for (let i = 1; i < chunks.length; i++) {
      await fetchSpotify(`/playlists/${playlistId}/items`, {
        method: 'POST',
        body: JSON.stringify({ uris: chunks[i] }),
      })
    }
  }

  /**
   * Add tracks to a playlist
   */
  async addTracksToPlaylist(
    playlistId: string,
    trackUris: string[]
  ): Promise<void> {
    // Spotify allows max 100 tracks per request
    for (let i = 0; i < trackUris.length; i += 100) {
      const chunk = trackUris.slice(i, i + 100)
      await fetchSpotify(`/playlists/${playlistId}/items`, {
        method: 'POST',
        body: JSON.stringify({ uris: chunk }),
      })
    }
  }

  /**
   * Remove all tracks from a playlist
   */
  async clearPlaylist(playlistId: string): Promise<void> {
    await fetchSpotify(`/playlists/${playlistId}/items`, {
      method: 'PUT',
      body: JSON.stringify({ uris: [] }),
    })
  }
}

// Export singleton instance
export const spotifyClient = new SpotifyClient()

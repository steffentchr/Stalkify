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

// Rate limiting: 10 requests per second
const RATE_LIMIT_DELAY = 100 // milliseconds

let lastRequestTime = 0

async function rateLimit() {
  const now = Date.now()
  const timeSinceLastRequest = now - lastRequestTime

  if (timeSinceLastRequest < RATE_LIMIT_DELAY) {
    await new Promise(resolve => setTimeout(resolve, RATE_LIMIT_DELAY - timeSinceLastRequest))
  }

  lastRequestTime = Date.now()
}

async function fetchSpotify<T>(
  endpoint: string,
  options: RequestInit = {}
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

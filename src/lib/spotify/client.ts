import { getValidAccessToken } from './auth'
import { checkBackoff, setBackoff } from './backoff'
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
  // Global circuit breaker: throws SpotifyRateLimitedError if backoff is active
  await checkBackoff()

  await rateLimit()

  const accessToken = await getValidAccessToken()
  const url = `${SPOTIFY_API_URL}${endpoint}`

  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), 30_000)

  let response: Response
  try {
    response = await fetch(url, {
      ...options,
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        ...options.headers,
      },
    })
  } catch (err) {
    if ((err as Error).name === 'AbortError') {
      throw new Error(`Spotify request timed out after 30s: ${endpoint}`)
    }
    throw err
  } finally {
    clearTimeout(timeoutId)
  }

  // 429: set global backoff (min 10 min) and throw so the job parks in delayed queue
  if (response.status === 429) {
    const retryAfter = parseInt(response.headers.get('Retry-After') || '30', 10)
    await response.json().catch(() => ({})) // drain body
    const until = await setBackoff(retryAfter)
    const { SpotifyRateLimitedError } = await import('./backoff')
    throw new SpotifyRateLimitedError(until)
  }

  if (!response.ok) {
    const body = await response.json().catch(() => ({}))
    console.error(`[spotify] ${response.status} on ${endpoint} — body: ${JSON.stringify(body)}`)
    throw new SpotifyApiError(
      response.status,
      body.error?.message || response.statusText,
      body
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
   * Fetch all playlists owned by the given user ID, paginating as needed.
   */
  async getMyPlaylists(ownerId: string): Promise<Array<{ id: string; name: string; uri: string }>> {
    const results: Array<{ id: string; name: string; uri: string }> = []
    let offset = 0
    const limit = 50

    while (true) {
      const page = await fetchSpotify<{
        items: Array<{ id: string; name: string; uri: string; owner: { id: string } }>
        next: string | null
      }>(`/me/playlists?limit=${limit}&offset=${offset}`)

      for (const p of page.items) {
        if (p.owner.id === ownerId) {
          results.push({ id: p.id, name: p.name, uri: p.uri })
        }
      }

      if (!page.next) break
      offset += limit
    }

    return results
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

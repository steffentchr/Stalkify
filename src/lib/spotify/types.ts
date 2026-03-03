// Spotify API Types

export interface SpotifyTrack {
  id: string
  uri: string
  name: string
  artists: SpotifyArtist[]
  album: SpotifyAlbum
  duration_ms: number
  explicit: boolean
  external_urls: {
    spotify: string
  }
}

export interface SpotifyArtist {
  id: string
  uri: string
  name: string
  external_urls: {
    spotify: string
  }
}

export interface SpotifyAlbum {
  id: string
  uri: string
  name: string
  images: SpotifyImage[]
  release_date: string
  external_urls: {
    spotify: string
  }
}

export interface SpotifyImage {
  url: string
  height: number
  width: number
}

export interface SpotifyPlaylist {
  id: string
  uri: string
  name: string
  description: string
  external_urls: {
    spotify: string
  }
  snapshot_id: string
  tracks: {
    total: number
  }
}

export interface SpotifySearchResponse {
  tracks: {
    items: SpotifyTrack[]
    total: number
    limit: number
    offset: number
  }
}

export interface SpotifyUser {
  id: string
  display_name: string
  external_urls: {
    spotify: string
  }
}

export interface SpotifyAuthTokens {
  access_token: string
  refresh_token: string
  expires_in: number
  scope: string
}

export class SpotifyApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public response?: any
  ) {
    super(message)
    this.name = 'SpotifyApiError'
  }
}

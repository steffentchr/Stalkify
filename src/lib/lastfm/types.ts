// Last.fm API Types

export interface LastfmTrack {
  name: string
  artist: {
    name: string
    mbid?: string
  }
  album?: {
    name: string
    mbid?: string
  }
  url?: string
  image?: LastfmImage[]
  playcount?: number
  date?: {
    uts: string
    '#text': string
  }
  '@attr'?: {
    nowplaying?: string
  }
}

export interface LastfmImage {
  '#text': string
  size: 'small' | 'medium' | 'large' | 'extralarge' | 'mega'
}

export interface LastfmArtist {
  name: string
  playcount: number
  url: string
  image?: LastfmImage[]
  mbid?: string
}

export interface LastfmUser {
  name: string
  realname?: string
  url?: string
  image?: LastfmImage[]
  country?: string
  playcount?: number
  registered?: {
    unixtime: string
    '#text': number
  }
}

export type LastfmPeriod = 'overall' | '7day' | '1month' | '3month' | '6month' | '12month'

export interface LastfmRecentTracksResponse {
  recenttracks: {
    track: LastfmTrack[]
    '@attr': {
      user: string
      totalPages: string
      page: string
      perPage: string
      total: string
    }
  }
}

export interface LastfmTopTracksResponse {
  toptracks: {
    track: LastfmTrack[]
    '@attr': {
      user: string
      totalPages: string
      page: string
      perPage: string
      total: string
    }
  }
}

export interface LastfmTopArtistsResponse {
  topartists: {
    artist: LastfmArtist[]
    '@attr': {
      user: string
      totalPages: string
      page: string
      perPage: string
      total: string
    }
  }
}

export interface LastfmUserInfoResponse {
  user: LastfmUser
}

export interface LastfmErrorResponse {
  error: number
  message: string
}

export class LastfmApiError extends Error {
  constructor(
    public code: number,
    message: string
  ) {
    super(message)
    this.name = 'LastfmApiError'
  }
}

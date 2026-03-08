import { prisma } from '../prisma'
import { SpotifyAuthTokens } from './types'





const SPOTIFY_ACCOUNTS_URL = 'https://accounts.spotify.com'
const REQUIRED_SCOPES = [
  'playlist-modify-public',
  'playlist-modify-private',
  'playlist-read-private',
  'user-read-private',
]

/**
 * Generate Spotify authorization URL for OAuth flow
 */
export function getAuthorizationUrl(state?: string): string {
  const SPOTIFY_CLIENT_ID = process.env.SPOTIFY_CLIENT_ID; const SPOTIFY_REDIRECT_URI = process.env.SPOTIFY_REDIRECT_URI; if (!SPOTIFY_CLIENT_ID || !SPOTIFY_REDIRECT_URI) {
    throw new Error('Spotify OAuth credentials not configured')
  }

  const params = new URLSearchParams({
    client_id: SPOTIFY_CLIENT_ID,
    response_type: 'code',
    redirect_uri: SPOTIFY_REDIRECT_URI,
    scope: REQUIRED_SCOPES.join(' '),
    ...(state && { state }),
  })

  return `${SPOTIFY_ACCOUNTS_URL}/authorize?${params.toString()}`
}

/**
 * Exchange authorization code for access tokens
 */
export async function exchangeCodeForTokens(code: string): Promise<SpotifyAuthTokens> {
  const SPOTIFY_CLIENT_ID = process.env.SPOTIFY_CLIENT_ID; const SPOTIFY_CLIENT_SECRET = process.env.SPOTIFY_CLIENT_SECRET; const SPOTIFY_REDIRECT_URI = process.env.SPOTIFY_REDIRECT_URI; if (!SPOTIFY_CLIENT_ID || !SPOTIFY_CLIENT_SECRET || !SPOTIFY_REDIRECT_URI) {
    throw new Error('Spotify OAuth credentials not configured')
  }

  const response = await fetch(`${SPOTIFY_ACCOUNTS_URL}/api/token`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: `Basic ${Buffer.from(`${SPOTIFY_CLIENT_ID}:${SPOTIFY_CLIENT_SECRET}`).toString('base64')}`,
    },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: SPOTIFY_REDIRECT_URI,
    }),
  })

  if (!response.ok) {
    const error = await response.json()
    throw new Error(`Failed to exchange code for tokens: ${error.error_description || response.statusText}`)
  }

  const tokens: SpotifyAuthTokens = await response.json()
  return tokens
}

/**
 * Refresh access token using refresh token
 */
export async function refreshAccessToken(refreshToken: string): Promise<SpotifyAuthTokens> {
  const SPOTIFY_CLIENT_ID = process.env.SPOTIFY_CLIENT_ID; const SPOTIFY_CLIENT_SECRET = process.env.SPOTIFY_CLIENT_SECRET; if (!SPOTIFY_CLIENT_ID || !SPOTIFY_CLIENT_SECRET) {
    throw new Error('Spotify OAuth credentials not configured')
  }

  const response = await fetch(`${SPOTIFY_ACCOUNTS_URL}/api/token`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: `Basic ${Buffer.from(`${SPOTIFY_CLIENT_ID}:${SPOTIFY_CLIENT_SECRET}`).toString('base64')}`,
    },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
    }),
  })

  if (!response.ok) {
    const error = await response.json()
    throw new Error(`Failed to refresh token: ${error.error_description || response.statusText}`)
  }

  const data = await response.json()

  // Refresh token might not be returned, use the old one
  return {
    ...data,
    refresh_token: data.refresh_token || refreshToken,
  }
}

/**
 * Store Spotify auth tokens in database
 */
export async function storeTokens(tokens: SpotifyAuthTokens): Promise<void> {
  const expiresAt = new Date(Date.now() + tokens.expires_in * 1000)

  // Delete existing tokens and create new ones (singleton pattern)
  await prisma.spotifyAuth.deleteMany({})

  await prisma.spotifyAuth.create({
    data: {
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
      expiresAt,
      scope: tokens.scope,
    },
  })
}

/**
 * Get valid access token (refresh if needed)
 */
export async function getValidAccessToken(): Promise<string> {
  const auth = await prisma.spotifyAuth.findFirst()

  if (!auth) {
    throw new Error(
      'No Spotify authentication found. Please complete OAuth flow at /api/auth/spotify/authorize'
    )
  }

  // Check if token is expired (with 5 minute buffer)
  const expiresIn = auth.expiresAt.getTime() - Date.now()
  const BUFFER_TIME = 5 * 60 * 1000 // 5 minutes

  if (expiresIn < BUFFER_TIME) {
    // Token expired or expiring soon, refresh it
    const newTokens = await refreshAccessToken(auth.refreshToken)
    await storeTokens(newTokens)
    return newTokens.access_token
  }

  return auth.accessToken
}

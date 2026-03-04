import { redis } from '../redis'
import { lastfmClient } from './client'
import { LastfmTrack, LastfmArtist, LastfmPeriod } from './types'

/**
 * Cache durations (in seconds)
 */
const CACHE_DURATIONS = {
  RECENT_TRACKS: 60 * 5, // 5 minutes
  TOP_TRACKS: 60 * 60, // 1 hour
  TOP_ARTISTS: 60 * 60, // 1 hour
  USER_INFO: 60 * 60 * 24, // 24 hours
  YEAR_SCROBBLES: 60 * 60 * 24, // 24 hours (historical data is stable)
}

/**
 * Generate cache key
 */
function getCacheKey(prefix: string, ...parts: string[]): string {
  return `lastfm:${prefix}:${parts.join(':')}`
}

/**
 * Cached Last.fm client wrapper
 */
export class CachedLastfmClient {
  /**
   * Get recent tracks with caching
   */
  async getRecentTracks(username: string, limit = 20): Promise<LastfmTrack[]> {
    const cacheKey = getCacheKey('recent', username, limit.toString())

    try {
      // Try to get from cache
      const cached = await redis.get(cacheKey)
      if (cached) {
        return JSON.parse(cached)
      }
    } catch (error) {
      console.error('Redis cache read error:', error)
      // Continue to fetch from API if cache fails
    }

    // Fetch from API
    const tracks = await lastfmClient.getRecentTracks(username, limit)

    // Store in cache
    try {
      await redis.setex(cacheKey, CACHE_DURATIONS.RECENT_TRACKS, JSON.stringify(tracks))
    } catch (error) {
      console.error('Redis cache write error:', error)
      // Continue even if caching fails
    }

    return tracks
  }

  /**
   * Get top tracks with caching
   */
  async getTopTracks(
    username: string,
    period: LastfmPeriod = 'overall',
    limit = 50
  ): Promise<LastfmTrack[]> {
    const cacheKey = getCacheKey('top-tracks', username, period, limit.toString())

    try {
      const cached = await redis.get(cacheKey)
      if (cached) {
        return JSON.parse(cached)
      }
    } catch (error) {
      console.error('Redis cache read error:', error)
    }

    const tracks = await lastfmClient.getTopTracks(username, period, limit)

    try {
      await redis.setex(cacheKey, CACHE_DURATIONS.TOP_TRACKS, JSON.stringify(tracks))
    } catch (error) {
      console.error('Redis cache write error:', error)
    }

    return tracks
  }

  /**
   * Get top artists with caching
   */
  async getTopArtists(
    username: string,
    period: LastfmPeriod = 'overall',
    limit = 48
  ): Promise<LastfmArtist[]> {
    const cacheKey = getCacheKey('top-artists', username, period, limit.toString())

    try {
      const cached = await redis.get(cacheKey)
      if (cached) {
        return JSON.parse(cached)
      }
    } catch (error) {
      console.error('Redis cache read error:', error)
    }

    const artists = await lastfmClient.getTopArtists(username, period, limit)

    try {
      await redis.setex(cacheKey, CACHE_DURATIONS.TOP_ARTISTS, JSON.stringify(artists))
    } catch (error) {
      console.error('Redis cache write error:', error)
    }

    return artists
  }

  /**
   * Get all scrobbles for a year with caching
   */
  async getAllScrobblesForYear(username: string, year: number): Promise<LastfmTrack[]> {
    const cacheKey = getCacheKey('scrobbles', username, year.toString())

    try {
      const cached = await redis.get(cacheKey)
      if (cached) {
        return JSON.parse(cached)
      }
    } catch (error) {
      console.error('Redis cache read error:', error)
    }

    const tracks = await lastfmClient.getAllScrobblesForYear(username, year)

    try {
      await redis.setex(cacheKey, CACHE_DURATIONS.YEAR_SCROBBLES, JSON.stringify(tracks))
    } catch (error) {
      console.error('Redis cache write error:', error)
    }

    return tracks
  }

  /**
   * Get account creation year
   */
  async getAccountCreationYear(username: string): Promise<number> {
    return lastfmClient.getAccountCreationYear(username)
  }

  /**
   * Check if user exists (with caching)
   */
  async userExists(username: string): Promise<boolean> {
    const cacheKey = getCacheKey('user-exists', username)

    try {
      const cached = await redis.get(cacheKey)
      if (cached !== null) {
        return cached === '1'
      }
    } catch (error) {
      console.error('Redis cache read error:', error)
    }

    const exists = await lastfmClient.userExists(username)

    try {
      await redis.setex(cacheKey, CACHE_DURATIONS.USER_INFO, exists ? '1' : '0')
    } catch (error) {
      console.error('Redis cache write error:', error)
    }

    return exists
  }

  /**
   * Invalidate cache for a user
   */
  async invalidateUserCache(username: string): Promise<void> {
    const patterns = [
      getCacheKey('recent', username, '*'),
      getCacheKey('top-tracks', username, '*'),
      getCacheKey('top-artists', username, '*'),
      getCacheKey('user-exists', username),
    ]

    try {
      for (const pattern of patterns) {
        const keys = await redis.keys(pattern)
        if (keys.length > 0) {
          await redis.del(...keys)
        }
      }
    } catch (error) {
      console.error('Redis cache invalidation error:', error)
    }
  }
}

// Export singleton instance
export const cachedLastfmClient = new CachedLastfmClient()

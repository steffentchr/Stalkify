import { LastfmTrack } from './types'

export interface AggregatedTrack {
  trackName: string
  artistName: string
  albumName?: string
  playCount: number
}

/**
 * Aggregate tracks by play count and return top N
 * Groups by normalized trackName + artistName
 */
export function aggregateTopTracks(tracks: LastfmTrack[], topN = 100): AggregatedTrack[] {
  const counts = new Map<string, AggregatedTrack>()

  for (const track of tracks) {
    const key = `${track.name.toLowerCase()}|${track.artist.name.toLowerCase()}`

    const existing = counts.get(key)
    if (existing) {
      existing.playCount++
    } else {
      counts.set(key, {
        trackName: track.name,
        artistName: track.artist.name,
        albumName: track.album?.name,
        playCount: 1,
      })
    }
  }

  return Array.from(counts.values())
    .sort((a, b) => b.playCount - a.playCount)
    .slice(0, topN)
}

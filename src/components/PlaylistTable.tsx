import { FeedType } from '@prisma/client'

interface Playlist {
  feedType: FeedType
  name: string
  spotifyUri: string
  trackCount: number
  lastUpdatedAt: Date
}

interface PlaylistTableProps {
  playlists: Playlist[]
}

const feedTypeLabels: Record<FeedType, string> = {
  RECENT: 'recent',
  ALL_TIME: 'all-time',
  WEEKLY: 'this week',
  THREE_MONTH: '3 months',
  SIX_MONTH: '6 months',
  YEARLY: 'this year',
}

export default function PlaylistTable({ playlists }: PlaylistTableProps) {
  return (
    <table className="playlists-table">
      <tbody>
        {playlists.map((playlist) => (
          <tr key={playlist.feedType}>
            <td className="playlist-name">{feedTypeLabels[playlist.feedType]}</td>
            <td className="playlist-desc">
              <a href={playlist.spotifyUri} target="_blank" rel="noopener noreferrer">
                {playlist.name}
              </a>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

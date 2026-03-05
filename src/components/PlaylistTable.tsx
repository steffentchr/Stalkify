interface Playlist {
  feedType: string
  name: string
  spotifyUrl: string
  trackCount: number
  lastUpdatedAt?: string
}

interface YearPlaylist {
  year: number
  name: string
  spotifyUrl: string
  trackCount: number
}

interface PlaylistTableProps {
  playlists: Playlist[]
  yearPlaylists?: YearPlaylist[]
}

const feedTypeLabels: Record<string, string> = {
  RECENT: 'live',
  ALL_TIME: 'all-time',
  WEEKLY: 'this week',
  THREE_MONTH: '3 months',
  SIX_MONTH: '6 months',
  YEARLY: 'this year',
}

export default function PlaylistTable({ playlists, yearPlaylists }: PlaylistTableProps) {
  return (
    <>
      <table className="playlists-table">
        <tbody>
          {playlists.map((playlist) => (
            <tr key={playlist.feedType}>
              <td className="playlist-name">{feedTypeLabels[playlist.feedType] || playlist.feedType}</td>
              <td className="playlist-desc">
                <a href={playlist.spotifyUrl} target="_blank" rel="noopener noreferrer">
                  {playlist.name}
                </a>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {yearPlaylists && yearPlaylists.length > 0 && (
        <>
          <h3 style={{ marginBottom: 16 }}>Year in review</h3>
          <table className="playlists-table">
            <tbody>
              {yearPlaylists.map((playlist) => (
                <tr key={playlist.year}>
                  <td className="playlist-name">{playlist.year}</td>
                  <td className="playlist-desc">
                    <a href={playlist.spotifyUrl} target="_blank" rel="noopener noreferrer">
                      {playlist.name}
                    </a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </>
  )
}

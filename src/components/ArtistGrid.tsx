import { SpotifyLink } from './SpotifyLink'

interface Artist {
  artistName: string
  imageUrl: string | null
  spotifyUrl: string | null
  playCount: number
  rank: number
}

interface ArtistGridProps {
  artists: Artist[]
}

function artistSpotifyUri(webUrl: string): string {
  const id = webUrl.split('/artist/')[1]?.split('?')[0]
  return id ? `spotify:artist:${id}` : webUrl
}

export default function ArtistGrid({ artists }: ArtistGridProps) {
  return (
    <div id="artistsContainer">
      {artists.map((artist) => {
        const webUrl = artist.spotifyUrl || `https://open.spotify.com/search/${encodeURIComponent(artist.artistName)}`
        const spotifyUri = artist.spotifyUrl
          ? artistSpotifyUri(artist.spotifyUrl)
          : `https://open.spotify.com/search/${encodeURIComponent(artist.artistName)}`
        return (
          <SpotifyLink key={artist.rank} className="lastfmartist" spotifyUri={spotifyUri} webUrl={webUrl}>
            {artist.imageUrl ? (
              <img src={artist.imageUrl} alt={artist.artistName} />
            ) : (
              <div style={{ width: 126, height: 126, background: '#BDBD1D' }} />
            )}
            <div className="lastfmartist-name">{artist.artistName}</div>
            <div className="lastfmartist-plays">
              {artist.playCount.toLocaleString()} plays
            </div>
          </SpotifyLink>
        )
      })}
    </div>
  )
}

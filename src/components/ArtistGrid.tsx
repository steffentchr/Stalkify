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

export default function ArtistGrid({ artists }: ArtistGridProps) {
  return (
    <div id="artistsContainer">
      {artists.map((artist) => (
        <a
          key={artist.rank}
          className="lastfmartist"
          href={artist.spotifyUrl ?? undefined}
          target="_blank"
          rel="noopener noreferrer"
        >
          {artist.imageUrl ? (
            <img src={artist.imageUrl} alt={artist.artistName} />
          ) : (
            <div style={{ width: 126, height: 126, background: '#BDBD1D' }} />
          )}
          <div className="lastfmartist-name">{artist.artistName}</div>
          <div className="lastfmartist-plays">
            {artist.playCount.toLocaleString()} plays
          </div>
        </a>
      ))}
    </div>
  )
}

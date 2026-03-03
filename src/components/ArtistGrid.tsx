interface Artist {
  artistName: string
  imageUrl: string | null
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
        <div key={artist.rank} className="lastfmartist">
          {artist.imageUrl ? (
            <img src={artist.imageUrl} alt={artist.artistName} />
          ) : (
            <div style={{ width: 126, height: 126, background: '#BDBD1D' }} />
          )}
          <div className="lastfmartist-name">{artist.artistName}</div>
          <div className="lastfmartist-plays">
            {artist.playCount.toLocaleString()} plays
          </div>
        </div>
      ))}
    </div>
  )
}

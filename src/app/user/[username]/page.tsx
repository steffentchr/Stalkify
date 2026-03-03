import { notFound, redirect } from 'next/navigation'
import Link from 'next/link'
import { prisma } from '@/lib/prisma'
import PlaylistTable from '@/components/PlaylistTable'
import ArtistGrid from '@/components/ArtistGrid'

interface UserPageProps {
  params: { username: string }
}

async function getUserData(username: string) {
  const user = await prisma.lastfmUser.findUnique({
    where: { username },
    include: {
      playlists: {
        where: {
          spotifyId: { not: '' },
        },
        orderBy: { feedType: 'asc' },
      },
      artists: {
        where: { period: 'overall' },
        orderBy: { rank: 'asc' },
        take: 48,
      },
    },
  })

  return user
}

export default async function UserPage({ params }: UserPageProps) {
  const user = await getUserData(params.username)

  if (!user) {
    // User not found, redirect to processing
    redirect(`/processing/${params.username}`)
  }

  // Check if user has any playlists
  if (user.playlists.length === 0) {
    redirect(`/processing/${params.username}`)
  }

  // Increment view count
  await prisma.lastfmUser.update({
    where: { id: user.id },
    data: { viewCount: { increment: 1 } },
  })

  return (
    <div id="frame">
      <h1>
        <Link href="/">Stalkify</Link>
      </h1>

      <div className="tagline">Last.fm + Spotify bundled into goodness</div>

      <h2>{user.username}</h2>

      <PlaylistTable playlists={user.playlists} />

      {user.artists.length > 0 && (
        <>
          <h3>Top Artists</h3>
          <ArtistGrid artists={user.artists} />
          <div className="smallmeta" style={{ marginTop: 40 }}>
            Click any artist to search on Spotify
          </div>
        </>
      )}

      <footer>
        <Link href="https://github.com/steffentchr/legacy-stalkify">About</Link> &middot;{' '}
        <Link href="https://last.fm">Last.fm</Link> &middot;{' '}
        <Link href="https://spotify.com">Spotify</Link>
      </footer>
    </div>
  )
}

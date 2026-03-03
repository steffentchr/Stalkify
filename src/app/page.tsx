import SearchForm from '@/components/SearchForm'
import { prisma } from '@/lib/prisma'
import Link from 'next/link'

async function getRecentUsers() {
  const users = await prisma.lastfmUser.findMany({
    orderBy: { lastProcessedAt: 'desc' },
    take: 5,
    select: { username: true },
  })
  return users
}

export default async function HomePage() {
  const recentUsers = await getRecentUsers()

  return (
    <div id="frame">
      <h1>
        <Link href="/">Stalkify</Link>
      </h1>

      <div className="tagline">Last.fm + Spotify bundled into goodness</div>

      <h2>Enter a Last.fm username</h2>

      <SearchForm />

      <div className="bigmessage">
        Stalkify creates auto-updating Spotify playlists from your Last.fm listening
        history.
      </div>

      <div className="smallmeta">
        Enter any Last.fm username to generate 6 dynamic playlists: recent tracks,
        all-time favorites, and top tracks from this week, 3 months, 6 months, and this
        year.
      </div>

      {recentUsers.length > 0 && (
        <div className="listen-in">
          <h3>Listen in</h3>
          {recentUsers.map((user) => (
            <Link key={user.username} href={`/user/${user.username}`}>
              @{user.username}
            </Link>
          ))}
        </div>
      )}

      <footer>
        <Link href="https://github.com/steffentchr/legacy-stalkify">About</Link> &middot;{' '}
        <Link href="https://last.fm">Last.fm</Link> &middot;{' '}
        <Link href="https://spotify.com">Spotify</Link>
      </footer>
    </div>
  )
}

import Link from "next/link";

export const metadata = {
  title: 'About',
}

export default function AboutPage() {
  return (
    <div id="frame">
      <h1>
        <Link href="/">Stalkify</Link>
      </h1>

      <div className="tagline">Last.fm + Spotify bundled into goodness</div>

      <h2>About</h2>

      <div className="about-content">
        <p>
          Stalkify bridges the gap between Last.fm and Spotify. Enter any
          Last.fm username and Stalkify will create six auto-updating playlists
          on Spotify based on that user&apos;s listening history.
        </p>

        <h3>Your playlists</h3>
        <p>
          Each user gets six playlists covering different time ranges: recent
          tracks, all-time top tracks, top tracks this week, top tracks over the
          past 3 months, 6 months, and this year. The playlists are public on
          Spotify, so you can follow them and they&apos;ll stay in your library.
        </p>

        <h3>How it works</h3>
        <p>
          Stalkify reads your public Last.fm listening data through the Last.fm
          API, matches each track to its Spotify equivalent, and assembles the
          playlists automatically. No login required on your end &mdash; just a
          Last.fm username.
        </p>

        <h3>Auto-updating</h3>
        <p>
          Playlists don&apos;t go stale. Recent tracks refresh frequently to
          keep up with what you&apos;re listening to right now, while the longer
          time ranges update daily. Come back anytime and your playlists will
          reflect your latest listening habits.
        </p>

        <h3>Year in review</h3>
        <p>
          On top of the six rolling playlists, Stalkify also creates a
          year-in-review playlist for every calendar year in your scrobble
          history. Each one contains up to 100 of your most-played tracks from
          that year &mdash; a time capsule of what you were listening to.
        </p>

        <h3>Setting up Last.fm scrobbling</h3>
        <p>
          To get the most out of Stalkify, you need to scrobble your Spotify
          listening to Last.fm. Here&apos;s how:
        </p>
        <ol>
          <li>
            Create a free account at{" "}
            <a href="https://www.last.fm/join" target="_blank" rel="noopener noreferrer">
              last.fm/join
            </a>
          </li>
          <li>
            Go to{" "}
            <a
              href="https://www.last.fm/settings/applications"
              target="_blank"
              rel="noopener noreferrer"
            >
              last.fm/settings/applications
            </a>{" "}
            and connect your Spotify account under &ldquo;Spotify
            Scrobbling&rdquo;
          </li>
          <li>
            That&apos;s it &mdash; everything you play on Spotify will now be
            tracked on your Last.fm profile, and Stalkify can use that data to
            build your playlists
          </li>
        </ol>
        <p>
          Scrobbling works in the background. Once connected, every track you
          play on Spotify is automatically logged to your Last.fm account. The
          longer you scrobble, the richer your playlists become.
        </p>

        <h3>History</h3>
        <p>
          Stalkify was originally built by{" "}
          <a href="/steffentchr" target="_blank" rel="noopener noreferrer">
            steffentchr
          </a>{" "}
          back when Last.fm and Spotify were two separate worlds with no easy
          way to move between them. This is a modern rebuild of the{" "}
          <a
            href="https://github.com/steffentchr/legacy-stalkify"
            target="_blank"
            rel="noopener noreferrer"
          >
            original version
          </a>
          , rewritten from the ground up with a fresh stack but the same spirit.
        </p>

        <h3>Privacy</h3>
        <p>
          Stalkify only accesses publicly available Last.fm data. We don&apos;t
          store passwords, don&apos;t require you to log in, and don&apos;t
          track anything beyond what&apos;s needed to build your playlists.
        </p>
      </div>

      <footer>
        <Link href="/">Home</Link> &middot;{" "}
        <Link href="https://last.fm">Last.fm</Link> &middot;{" "}
        <Link href="https://spotify.com">Spotify</Link>
      </footer>
    </div>
  );
}

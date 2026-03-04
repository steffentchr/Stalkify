import Link from "next/link";

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

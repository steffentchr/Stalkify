'use client'

interface SpotifyLinkProps {
  spotifyUri: string        // spotify:playlist:xxx  or  spotify:artist:xxx
  webUrl: string            // https://open.spotify.com/...
  children: React.ReactNode
  className?: string
  style?: React.CSSProperties
}

/**
 * Opens the Spotify app via protocol URI. If the window keeps focus after 1s
 * (app not installed / not available), falls back to the web URL in a new tab.
 */
export function SpotifyLink({ spotifyUri, webUrl, children, className, style }: SpotifyLinkProps) {
  function handleClick(e: React.MouseEvent<HTMLAnchorElement>) {
    e.preventDefault()
    window.location.href = spotifyUri
    const timeout = setTimeout(() => window.open(webUrl, '_blank', 'noopener,noreferrer'), 1000)
    window.addEventListener('blur', () => clearTimeout(timeout), { once: true })
  }

  return (
    <a href={webUrl} onClick={handleClick} className={className} style={style}
      target="_blank" rel="noopener noreferrer">
      {children}
    </a>
  )
}

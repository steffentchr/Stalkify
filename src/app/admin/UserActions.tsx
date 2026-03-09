'use client'

import { triggerUpdate, fullRebuild } from './actions'

const btnBase: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 600,
  padding: '3px 8px',
  borderRadius: 4,
  border: '1px solid',
  cursor: 'pointer',
  letterSpacing: '0.03em',
  textTransform: 'uppercase' as const,
  background: 'transparent',
}

export function UserActions({ username }: { username: string }) {
  return (
    <span style={{ display: 'flex', gap: 4 }}>
      <form action={triggerUpdate.bind(null, username)}>
        <button type="submit" style={{ ...btnBase, borderColor: '#bbb', color: '#555' }}
          title="Queue a fresh update for this user">
          Update
        </button>
      </form>
      <form
        action={fullRebuild.bind(null, username)}
        onSubmit={(e) => {
          if (!confirm(`Fully rebuild @${username}?\n\nThis deletes all playlists and re-runs from scratch.`)) {
            e.preventDefault()
          }
        }}
      >
        <button type="submit" style={{ ...btnBase, borderColor: '#e74c3c', color: '#c0392b' }}
          title="Delete all playlists and rebuild from scratch">
          Rebuild
        </button>
      </form>
    </span>
  )
}

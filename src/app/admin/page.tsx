import { prisma } from '@/lib/prisma'
import Link from 'next/link'

export const dynamic = 'force-dynamic'

async function getStats() {
  const [
    userCount,
    playlistCount,
    totalTracks,
    matchedTracks,
    trackCacheTotal,
    trackCacheFound,
    artistCacheTotal,
    artistCacheFound,
    recentUsers,
    recentJobs,
    failedSyncCount,
  ] = await Promise.all([
    prisma.lastfmUser.count(),
    prisma.playlist.count(),
    prisma.playlistTrack.count(),
    prisma.playlistTrack.count({ where: { spotifyId: { not: null } } }),
    prisma.trackCache.count(),
    prisma.trackCache.count({ where: { spotifyId: { not: null } } }),
    prisma.artistCache.count(),
    prisma.artistCache.count({ where: { spotifyId: { not: null } } }),
    prisma.lastfmUser.findMany({
      orderBy: { lastProcessedAt: 'desc' },
      take: 20,
      select: { username: true, lastProcessedAt: true, processCount: true },
    }),
    prisma.processingJob.findMany({
      orderBy: { createdAt: 'desc' },
      take: 30,
      select: { username: true, status: true, currentStep: true, createdAt: true, completedAt: true, errorMessage: true },
    }),
    prisma.processingJob.count({ where: { status: 'FAILED' } }),
  ])

  return {
    userCount,
    playlistCount,
    totalTracks,
    matchedTracks,
    matchRate: totalTracks > 0 ? Math.round((matchedTracks / totalTracks) * 100) : 0,
    trackCacheTotal,
    trackCacheFound,
    trackCacheHitRate: trackCacheTotal > 0 ? Math.round((trackCacheFound / trackCacheTotal) * 100) : 0,
    artistCacheTotal,
    artistCacheFound,
    artistCacheHitRate: artistCacheTotal > 0 ? Math.round((artistCacheFound / artistCacheTotal) * 100) : 0,
    recentUsers,
    recentJobs,
    failedSyncCount,
  }
}

function fmt(n: number) {
  return n.toLocaleString('en-US')
}

function timeAgo(date: Date) {
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000)
  if (seconds < 60) return `${seconds}s ago`
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`
  return `${Math.floor(seconds / 86400)}d ago`
}

const STATUS_COLORS: Record<string, string> = {
  COMPLETED: '#1a7a3c',
  PROCESSING: '#b45309',
  PENDING: '#555',
  FAILED: '#c0392b',
  CANCELLED: '#888',
}

export default async function AdminPage() {
  const stats = await getStats()

  return (
    <div style={{ fontFamily: 'Helvetica, Arial, sans-serif', maxWidth: 900, margin: '40px auto', padding: '0 24px', color: '#222' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 32 }}>
        <h1 style={{ fontSize: 28, fontWeight: 700 }}>Stalkify Admin</h1>
        <Link href="/" style={{ fontSize: 13, color: '#666' }}>← back to app</Link>
      </div>

      {/* Stat tiles */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 16, marginBottom: 40 }}>
        {[
          { label: 'Users', value: fmt(stats.userCount) },
          { label: 'Playlists', value: fmt(stats.playlistCount) },
          { label: 'Tracks total', value: fmt(stats.totalTracks) },
          { label: 'Tracks matched', value: `${fmt(stats.matchedTracks)} (${stats.matchRate}%)` },
          { label: 'Track cache', value: `${fmt(stats.trackCacheTotal)} entries` },
          { label: 'Track found rate', value: `${stats.trackCacheHitRate}%` },
          { label: 'Artist cache', value: `${fmt(stats.artistCacheTotal)} entries` },
          { label: 'Artist found rate', value: `${stats.artistCacheHitRate}%` },
          { label: 'Failed jobs', value: fmt(stats.failedSyncCount), alert: stats.failedSyncCount > 0 },
        ].map(({ label, value, alert }) => (
          <div key={label} style={{
            border: `1px solid ${alert ? '#e74c3c' : '#ddd'}`,
            borderRadius: 6,
            padding: '14px 16px',
            background: alert ? '#fff5f5' : '#fafafa',
          }}>
            <div style={{ fontSize: 11, color: '#888', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>{label}</div>
            <div style={{ fontSize: 20, fontWeight: 700, color: alert ? '#c0392b' : '#111' }}>{value}</div>
          </div>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 32 }}>

        {/* Recent users */}
        <section>
          <h2 style={{ fontSize: 14, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#555', marginBottom: 12 }}>Recent Users</h2>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: '1px solid #eee' }}>
                <th style={{ textAlign: 'left', padding: '4px 8px 8px 0', color: '#888', fontWeight: 500 }}>Username</th>
                <th style={{ textAlign: 'right', padding: '4px 0 8px', color: '#888', fontWeight: 500 }}>Runs</th>
                <th style={{ textAlign: 'right', padding: '4px 0 8px 8px', color: '#888', fontWeight: 500 }}>Last run</th>
              </tr>
            </thead>
            <tbody>
              {stats.recentUsers.map(u => (
                <tr key={u.username} style={{ borderBottom: '1px solid #f3f3f3' }}>
                  <td style={{ padding: '6px 8px 6px 0' }}>
                    <Link href={`/${u.username}`} style={{ color: '#000', fontWeight: 500 }}>{u.username}</Link>
                  </td>
                  <td style={{ textAlign: 'right', padding: '6px 0', color: '#666' }}>{u.processCount}</td>
                  <td style={{ textAlign: 'right', padding: '6px 0 6px 8px', color: '#999', whiteSpace: 'nowrap' }}>
                    {timeAgo(u.lastProcessedAt)}
                  </td>
                </tr>
              ))}
              {stats.recentUsers.length === 0 && (
                <tr><td colSpan={3} style={{ padding: '12px 0', color: '#aaa', fontStyle: 'italic' }}>No users yet</td></tr>
              )}
            </tbody>
          </table>
        </section>

        {/* Recent jobs */}
        <section>
          <h2 style={{ fontSize: 14, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#555', marginBottom: 12 }}>Recent Jobs</h2>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: '1px solid #eee' }}>
                <th style={{ textAlign: 'left', padding: '4px 8px 8px 0', color: '#888', fontWeight: 500 }}>User</th>
                <th style={{ textAlign: 'left', padding: '4px 8px 8px', color: '#888', fontWeight: 500 }}>Status</th>
                <th style={{ textAlign: 'right', padding: '4px 0 8px', color: '#888', fontWeight: 500 }}>When</th>
              </tr>
            </thead>
            <tbody>
              {stats.recentJobs.map((job, i) => (
                <tr key={i} style={{ borderBottom: '1px solid #f3f3f3' }}>
                  <td style={{ padding: '6px 8px 6px 0' }}>
                    <Link href={`/${job.username}`} style={{ color: '#000', fontWeight: 500 }}>{job.username}</Link>
                  </td>
                  <td style={{ padding: '6px 8px' }}>
                    <span style={{
                      display: 'inline-block',
                      fontSize: 11,
                      fontWeight: 600,
                      color: STATUS_COLORS[job.status] ?? '#555',
                      textTransform: 'uppercase',
                      letterSpacing: '0.04em',
                    }}>
                      {job.status}
                    </span>
                    {job.status === 'FAILED' && job.errorMessage && (
                      <div style={{ fontSize: 11, color: '#c0392b', marginTop: 2, maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={job.errorMessage}>
                        {job.errorMessage}
                      </div>
                    )}
                    {job.status === 'PROCESSING' && job.currentStep && (
                      <div style={{ fontSize: 11, color: '#b45309', marginTop: 2 }}>{job.currentStep}</div>
                    )}
                  </td>
                  <td style={{ textAlign: 'right', padding: '6px 0', color: '#999', whiteSpace: 'nowrap' }}>
                    {timeAgo(job.createdAt)}
                  </td>
                </tr>
              ))}
              {stats.recentJobs.length === 0 && (
                <tr><td colSpan={3} style={{ padding: '12px 0', color: '#aaa', fontStyle: 'italic' }}>No jobs yet</td></tr>
              )}
            </tbody>
          </table>
        </section>
      </div>

      <div style={{ marginTop: 48, fontSize: 12, color: '#bbb', textAlign: 'center' }}>
        Generated at {new Date().toISOString()}
      </div>
    </div>
  )
}

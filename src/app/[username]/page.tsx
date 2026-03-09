'use client'

import { use, useEffect, useState } from 'react'
import Link from 'next/link'
import LoadingSpinner from '@/components/LoadingSpinner'
import PlaylistTable from '@/components/PlaylistTable'
import ArtistGrid from '@/components/ArtistGrid'

interface UserPageProps {
  params: Promise<{ username: string }>
}

interface JobStatusResponse {
  jobId: string
  status: string
  progress: number
  currentStep: string | null
  playlistsCreated: number
  tracksMatched: number
  errorMessage: string | null
}

interface UserData {
  status: 'exists' | 'processing' | 'not_found'
  jobId?: string
  username?: string
  playlists?: Array<{
    feedType: string
    name: string
    spotifyUri: string
    spotifyUrl: string
    trackCount: number
    lastUpdatedAt: string
  }>
  yearPlaylists?: Array<{
    year: number
    name: string
    spotifyUri: string
    spotifyUrl: string
    trackCount: number
  }>
  artists?: Array<{
    artistName: string
    imageUrl: string | null
    spotifyUrl: string | null
    playCount: number
    rank: number
  }>
}

export default function UserPage({ params }: UserPageProps) {
  const { username } = use(params)
  const [state, setState] = useState<'loading' | 'processing' | 'results' | 'error'>('loading')
  const [userData, setUserData] = useState<UserData | null>(null)
  const [jobStatus, setJobStatus] = useState<JobStatusResponse | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let interval: NodeJS.Timeout

    async function fetchUserData(): Promise<UserData | null> {
      const res = await fetch(`/api/user/${username}`)
      return res.ok ? res.json() : null
    }

    function showResults(data: UserData) {
      setUserData(data)
      setState('results')
    }

    async function init() {
      try {
        const data = await fetchUserData()

        if (data) {
          if (data.playlists && data.playlists.length > 0) {
            showResults(data)
            return
          }
          if (data.status === 'processing' && data.jobId) {
            setState('processing')
            startPolling(data.jobId)
            return
          }
        }

        // User doesn't exist or has no playlists — start processing
        const processRes = await fetch(`/api/user/${username}/process`, { method: 'POST' })

        if (!processRes.ok) {
          const errData = await processRes.json()
          setError(errData.error || 'Failed to start processing')
          setState('error')
          return
        }

        const processData = await processRes.json()
        setState('processing')
        startPolling(processData.jobId)
      } catch (err) {
        setError('Failed to connect to server')
        setState('error')
        console.error(err)
      }
    }

    function startPolling(jobId: string) {
      interval = setInterval(async () => {
        try {
          const statusRes = await fetch(`/api/status/${jobId}`)
          if (!statusRes.ok) return

          const statusData: JobStatusResponse = await statusRes.json()
          setJobStatus(statusData)

          if (statusData.status === 'COMPLETED') {
            clearInterval(interval)
            const data = await fetchUserData()
            if (data) showResults(data)
            return
          }

          if (statusData.status === 'FAILED') {
            clearInterval(interval)
            setError(statusData.errorMessage || 'Processing failed')
            setState('error')
          }
        } catch {
          // Ignore polling errors
        }
      }, 2000)
    }

    init()

    return () => {
      if (interval) clearInterval(interval)
    }
  }, [username])

  return (
    <div id="frame">
      <h1>
        <Link href="/">Stalkify</Link>
      </h1>

      <div className="tagline">Last.fm + Spotify bundled into goodness</div>

      <h2>{username}</h2>

      {state === 'loading' && <LoadingSpinner />}

      {state === 'error' && (
        <>
          <div className="bigmessage" style={{ background: '#fee', color: '#d32f2f' }}>
            <strong>Error:</strong> {error}
          </div>
          <div className="smallmeta">
            <Link href="/">Try another username</Link>
          </div>
        </>
      )}

      {state === 'processing' && (
        <>
          <div className="bigmessage">
            Please hang on while we stalkify <strong>{username}</strong>
          </div>

          <LoadingSpinner />

          <div className="smallmeta">
            This might take a few long minutes...
            <br />
            Fetching Last.fm data and creating Spotify playlists
          </div>

        </>
      )}

      {state === 'results' && userData && (
        <>
          <PlaylistTable playlists={userData.playlists || []} yearPlaylists={userData.yearPlaylists} />

          {userData.artists && userData.artists.length > 0 && (
            <>
              <h3>Top Artists</h3>
              <ArtistGrid artists={userData.artists} />
            </>
          )}
        </>
      )}

      <footer>
        <Link href="/about">About</Link> &middot;{' '}
        <Link href="https://last.fm">Last.fm</Link> &middot;{' '}
        <Link href="https://spotify.com">Spotify</Link>
      </footer>
    </div>
  )
}

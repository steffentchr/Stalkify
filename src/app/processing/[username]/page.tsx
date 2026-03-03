'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import LoadingSpinner from '@/components/LoadingSpinner'
import StatusTable from '@/components/StatusTable'
import { JobStatus } from '@prisma/client'

interface ProcessingPageProps {
  params: { username: string }
}

interface JobStatusResponse {
  jobId: string
  status: JobStatus
  progress: number
  currentStep: string | null
  playlistsCreated: number
  tracksMatched: number
  errorMessage: string | null
}

export default function ProcessingPage({ params }: ProcessingPageProps) {
  const router = useRouter()
  const [status, setStatus] = useState<JobStatusResponse | null>(null)
  const [jobId, setJobId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let interval: NodeJS.Timeout

    async function startProcessing() {
      try {
        // Trigger processing
        const response = await fetch(`/api/user/${params.username}/process`, {
          method: 'POST',
        })

        if (!response.ok) {
          const data = await response.json()
          setError(data.error || 'Failed to start processing')
          return
        }

        const data = await response.json()
        setJobId(data.jobId)

        // Start polling
        interval = setInterval(async () => {
          const statusResponse = await fetch(`/api/status/${data.jobId}`)

          if (!statusResponse.ok) {
            return
          }

          const statusData: JobStatusResponse = await statusResponse.json()
          setStatus(statusData)

          // Redirect when complete
          if (statusData.status === 'COMPLETED') {
            clearInterval(interval)
            setTimeout(() => {
              router.push(`/user/${params.username}`)
            }, 1000)
          }

          // Show error if failed
          if (statusData.status === 'FAILED') {
            clearInterval(interval)
            setError(statusData.errorMessage || 'Processing failed')
          }
        }, 2000) // Poll every 2 seconds
      } catch (err) {
        setError('Failed to connect to server')
        console.error(err)
      }
    }

    startProcessing()

    return () => {
      if (interval) clearInterval(interval)
    }
  }, [params.username, router])

  return (
    <div id="frame">
      <h1>
        <Link href="/">Stalkify</Link>
      </h1>

      <div className="tagline">Last.fm + Spotify bundled into goodness</div>

      <h2>{params.username}</h2>

      {error ? (
        <>
          <div className="bigmessage" style={{ background: '#fee', color: '#d32f2f' }}>
            <strong>Error:</strong> {error}
          </div>
          <div className="smallmeta">
            <Link href="/">Try another username</Link>
          </div>
        </>
      ) : (
        <>
          <div className="bigmessage">
            Please hang on while we stalkify <strong>{params.username}</strong>
          </div>

          <LoadingSpinner />

          <div className="smallmeta">
            This might take a few long minutes...
            <br />
            Fetching Last.fm data and creating Spotify playlists
          </div>

          <StatusTable status={status} />
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

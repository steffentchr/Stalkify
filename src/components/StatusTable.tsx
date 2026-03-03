import { JobStatus } from '@prisma/client'

interface StatusStep {
  name: string
  status: 'waiting' | 'processing' | 'completed' | 'failed'
}

interface StatusTableProps {
  status: {
    jobId: string
    status: JobStatus
    progress: number
    currentStep: string | null
    playlistsCreated: number
    tracksMatched: number
  } | null
}

const playlistLabels = [
  'Recent tracks',
  'All-time top',
  'This week',
  '3 months',
  '6 months',
  'This year',
]

export default function StatusTable({ status }: StatusTableProps) {
  if (!status) {
    return (
      <table className="status-table">
        <tbody>
          {playlistLabels.map((label) => (
            <tr key={label}>
              <td className="status-name">{label}</td>
              <td className="status-value">Waiting</td>
            </tr>
          ))}
        </tbody>
      </table>
    )
  }

  const getPlaylistStatus = (index: number) => {
    if (status.playlistsCreated > index) {
      return <span className="status-complete">✓ Created</span>
    } else if (status.playlistsCreated === index && status.status === 'PROCESSING') {
      return <span className="status-processing">Processing...</span>
    } else {
      return 'Waiting'
    }
  }

  return (
    <table className="status-table">
      <tbody>
        {playlistLabels.map((label, index) => (
          <tr key={label}>
            <td className="status-name">{label}</td>
            <td className="status-value">{getPlaylistStatus(index)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

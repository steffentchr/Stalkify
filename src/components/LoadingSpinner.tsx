'use client'

import { useEffect, useState } from 'react'

export default function LoadingSpinner() {
  const [frame, setFrame] = useState(0)
  const frames = ['⏳', '⌛']

  useEffect(() => {
    const interval = setInterval(() => {
      setFrame((prev) => (prev + 1) % frames.length)
    }, 500)

    return () => clearInterval(interval)
  }, [])

  return <div className="loading-spinner">{frames[frame]}</div>
}

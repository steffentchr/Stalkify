'use client'

import { useRouter } from 'next/navigation'
import { FormEvent, useState } from 'react'

export default function SearchForm() {
  const router = useRouter()
  const [username, setUsername] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setError('')

    const trimmed = username.trim()
    if (!trimmed) return

    // Last.fm usernames: 2-15 chars, alphanumeric, hyphens, underscores
    if (!/^[a-zA-Z0-9_-]{2,15}$/.test(trimmed)) {
      setError('Invalid Last.fm username')
      return
    }

    setIsSubmitting(true)
    router.push(`/${encodeURIComponent(trimmed)}`)
  }

  return (
    <form className="search-form" onSubmit={handleSubmit}>
      <input
        type="text"
        name="username"
        placeholder="steffentchr"
        value={username}
        onChange={(e) => setUsername(e.target.value)}
        required
        disabled={isSubmitting}
      />
      <button type="submit" disabled={isSubmitting}>
        {isSubmitting ? 'Loading...' : 'Stalkify'}
      </button>
      {error && <div className="form-error">{error}</div>}
    </form>
  )
}

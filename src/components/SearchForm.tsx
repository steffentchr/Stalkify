'use client'

import { useRouter } from 'next/navigation'
import { FormEvent, useState } from 'react'

export default function SearchForm() {
  const router = useRouter()
  const [username, setUsername] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()

    if (!username.trim()) return

    setIsSubmitting(true)

    // Navigate to processing page
    router.push(`/processing/${encodeURIComponent(username.trim())}`)
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
    </form>
  )
}

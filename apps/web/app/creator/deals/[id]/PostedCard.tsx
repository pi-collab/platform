'use client'

import { useState } from 'react'
import { markPosted } from './posted-actions'

export default function PostedCard({ dealId }: { dealId: string }) {
  const [url, setUrl] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)

  async function handleSubmit() {
    if (!url.trim()) return
    setError(null)
    setLoading(true)
    const result = await markPosted(dealId, url)
    setLoading(false)
    if (result.status === 'error') {
      setError(result.message)
    } else {
      setDone(true)
    }
  }

  if (done) {
    return (
      <div style={card}>
        <p style={{ fontSize: '0.8125rem', fontWeight: 700, color: '#16a34a', margin: 0 }}>
          Marked as posted! The brand has been notified.
        </p>
      </div>
    )
  }

  return (
    <div style={card}>
      <h3 style={cardTitle}>Content Posted?</h3>
      <p style={{ fontSize: '0.8125rem', color: '#555', margin: '0 0 0.5rem' }}>
        Once your content is live, paste the post URL below.
      </p>
      <div style={{ display: 'flex', gap: '0.375rem' }}>
        <input
          type="url"
          placeholder="https://instagram.com/reel/..."
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          disabled={loading}
          style={inputStyle}
        />
        <button
          onClick={handleSubmit}
          disabled={loading || !url.trim()}
          style={{
            ...submitBtn,
            opacity: loading || !url.trim() ? 0.5 : 1,
            cursor: loading || !url.trim() ? 'not-allowed' : 'pointer',
          }}
        >
          {loading ? '...' : 'Post'}
        </button>
      </div>
      {error && <p style={{ fontSize: '0.75rem', color: '#dc2626', margin: '0.375rem 0 0' }}>{error}</p>}
    </div>
  )
}

const card: React.CSSProperties = {
  padding: '1rem',
  border: '1px solid #e5e5e5',
  borderRadius: 8,
  background: '#fafafa',
}

const cardTitle: React.CSSProperties = {
  fontSize: '0.75rem',
  fontWeight: 700,
  textTransform: 'uppercase',
  letterSpacing: '0.04em',
  color: '#555',
  margin: '0 0 0.25rem',
}

const inputStyle: React.CSSProperties = {
  flex: 1,
  padding: '0.5rem 0.625rem',
  border: '1px solid #d5d5d5',
  borderRadius: 6,
  fontSize: '0.8125rem',
  outline: 'none',
  minWidth: 0,
}

const submitBtn: React.CSSProperties = {
  padding: '0.5rem 0.75rem',
  background: '#16a34a',
  color: '#fff',
  border: 'none',
  borderRadius: 6,
  fontSize: '0.75rem',
  fontWeight: 700,
  flexShrink: 0,
}

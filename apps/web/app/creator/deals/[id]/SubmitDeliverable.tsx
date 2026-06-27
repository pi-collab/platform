'use client'

import { useState } from 'react'
import { submitDeliverable } from './actions'

export default function SubmitDeliverable({ dealId }: { dealId: string }) {
  const [url, setUrl] = useState('')
  const [note, setNote] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)

    const fd = new FormData()
    fd.set('external_url', url)
    fd.set('note', note)

    const result = await submitDeliverable(dealId, fd)
    setLoading(false)

    if (result.status === 'error') {
      setError(result.message)
      return
    }

    setDone(true)
  }

  if (done) {
    return (
      <div style={successBox}>
        <p style={{ fontWeight: 700, fontSize: '0.9375rem', margin: '0 0 0.25rem' }}>Deliverable submitted</p>
        <p style={{ fontSize: '0.8125rem', color: '#555', margin: 0 }}>
          The brand has been notified and will review your work.
        </p>
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit} style={formBox}>
      <p style={formTitle}>Submit deliverable</p>
      <p style={{ fontSize: '0.75rem', color: '#888', margin: '0 0 0.75rem' }}>
        Paste a link to your deliverable (Google Drive, WeTransfer, Dropbox, etc.)
      </p>

      <label style={labelStyle}>
        <span style={labelText}>Delivery link *</span>
        <input
          type="url"
          required
          placeholder="https://drive.google.com/file/d/..."
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          style={inputStyle}
          disabled={loading}
        />
      </label>

      <label style={labelStyle}>
        <span style={labelText}>Note (optional)</span>
        <input
          type="text"
          placeholder="e.g. Final cut, 1080p"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          style={inputStyle}
          disabled={loading}
        />
      </label>

      {error && (
        <p style={{ fontSize: '0.8125rem', color: '#dc2626', margin: '0 0 0.5rem', background: '#fef2f2', padding: '0.5rem 0.75rem', borderRadius: 8 }}>
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={loading || !url.trim()}
        style={{
          ...submitBtn,
          opacity: loading || !url.trim() ? 0.5 : 1,
          cursor: loading || !url.trim() ? 'not-allowed' : 'pointer',
        }}
      >
        {loading ? 'Submitting...' : 'Submit deliverable'}
      </button>
    </form>
  )
}

const formBox: React.CSSProperties = {
  padding: '1.25rem',
  border: '1px solid #e5e5e5',
  borderRadius: 12,
  background: '#fff',
}

const successBox: React.CSSProperties = {
  padding: '1.25rem',
  border: '1px solid #bbf7d0',
  borderRadius: 12,
  background: '#f0fdf4',
}

const formTitle: React.CSSProperties = {
  fontSize: '0.9375rem',
  fontWeight: 700,
  color: '#111',
  margin: '0 0 0.125rem',
}

const labelStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '0.25rem',
  marginBottom: '0.75rem',
}

const labelText: React.CSSProperties = {
  fontSize: '0.75rem',
  fontWeight: 600,
  color: '#555',
}

const inputStyle: React.CSSProperties = {
  padding: '0.625rem 0.75rem',
  border: '1px solid #d5d5d5',
  borderRadius: 8,
  fontSize: '0.9375rem',
  outline: 'none',
  width: '100%',
  boxSizing: 'border-box',
}

const submitBtn: React.CSSProperties = {
  width: '100%',
  padding: '0.75rem',
  background: 'var(--brand-primary, #111)',
  color: '#fff',
  border: 'none',
  borderRadius: 9999,
  fontSize: '0.9375rem',
  fontWeight: 700,
  fontFamily: 'var(--font-body, inherit)',
}

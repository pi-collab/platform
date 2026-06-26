'use client'

import { useState } from 'react'
import { generateOfferLink } from '../actions'

export default function GenerateLinkButton({ dealId }: { dealId: string }) {
  const [link, setLink] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [copied, setCopied] = useState(false)

  async function handleGenerate() {
    setLoading(true)
    setError(null)
    const result = await generateOfferLink(dealId)
    setLoading(false)

    if ('error' in result) {
      setError(result.error!)
      return
    }

    setLink(result.link!)
  }

  async function handleCopy() {
    if (!link) return
    await navigator.clipboard.writeText(link)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  if (link) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.375rem' }}>
        <input
          readOnly
          value={link}
          style={{ fontSize: '0.6875rem', padding: '0.25rem 0.5rem', border: '1px solid #ddd', borderRadius: 4, width: 220, fontFamily: 'monospace', color: '#333' }}
          onFocus={(e) => e.target.select()}
        />
        <button onClick={handleCopy} style={copyBtn}>
          {copied ? 'Copied!' : 'Copy link'}
        </button>
      </div>
    )
  }

  return (
    <div>
      <button onClick={handleGenerate} disabled={loading} style={genBtn}>
        {loading ? '...' : 'Generate link'}
      </button>
      {error && <p style={{ fontSize: '0.6875rem', color: '#dc2626', margin: '0.25rem 0 0' }}>{error}</p>}
    </div>
  )
}

const genBtn: React.CSSProperties = {
  padding: '0.375rem 0.75rem',
  background: '#111',
  color: '#fff',
  border: 'none',
  borderRadius: 6,
  fontSize: '0.75rem',
  fontWeight: 600,
  cursor: 'pointer',
  whiteSpace: 'nowrap',
}

const copyBtn: React.CSSProperties = {
  padding: '0.25rem 0.5rem',
  background: '#f0f0f0',
  color: '#333',
  border: '1px solid #ddd',
  borderRadius: 4,
  fontSize: '0.6875rem',
  fontWeight: 600,
  cursor: 'pointer',
}

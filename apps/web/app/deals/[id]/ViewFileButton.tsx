'use client'

import { useState } from 'react'
import { getSignedUrl } from '@/app/creator/deals/[id]/upload-actions'

export default function ViewFileButton({ dealId, itemId }: { dealId: string; itemId: string }) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleClick() {
    setLoading(true)
    setError(null)
    const result = await getSignedUrl(dealId, itemId)
    setLoading(false)
    if (result.status === 'success') {
      window.open(result.url, '_blank')
    } else {
      setError(result.message)
    }
  }

  return (
    <>
      <button
        onClick={handleClick}
        disabled={loading}
        style={{
          padding: '0.15rem 0.4rem',
          background: '#eff6ff',
          color: '#2563eb',
          border: '1px solid #bfdbfe',
          borderRadius: 4,
          fontSize: '0.625rem',
          fontWeight: 600,
          cursor: loading ? 'not-allowed' : 'pointer',
          opacity: loading ? 0.5 : 1,
        }}
      >
        {loading ? 'Loading...' : 'View file'}
      </button>
      {error && <span style={{ fontSize: '0.625rem', color: '#dc2626', marginLeft: '0.25rem' }}>{error}</span>}
    </>
  )
}

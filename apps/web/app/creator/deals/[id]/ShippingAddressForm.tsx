'use client'

import { useState } from 'react'
import { submitShippingAddress } from './actions'

export default function ShippingAddressForm({
  dealId,
  existingAddress,
}: {
  dealId: string
  existingAddress: string | null
}) {
  const [editing, setEditing] = useState(false)
  const [address, setAddress] = useState(existingAddress ?? '')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Already submitted and not editing
  if (existingAddress && !editing) {
    return (
      <div style={{ marginTop: 16 }}>
        <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: '.14em', textTransform: 'uppercase', color: 'var(--ink-faint)' }}>
          Your shipping address
        </div>
        <div style={{ fontSize: 13.5, lineHeight: 1.6, color: 'var(--ink)', marginTop: 8, padding: '12px 16px', borderRadius: 12, background: 'var(--card)', border: '1px solid var(--border-hairline)' }}>
          {existingAddress}
        </div>
        <button
          onClick={() => { setEditing(true); setAddress(existingAddress) }}
          style={{ marginTop: 10, background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 600, color: 'var(--ink-soft)', fontFamily: 'var(--font-ui)', padding: 0 }}
        >
          Edit address
        </button>
      </div>
    )
  }

  async function handleSubmit() {
    if (!address.trim()) return
    setError(null)
    setLoading(true)
    const result = await submitShippingAddress(dealId, address)
    setLoading(false)
    if (result.status === 'error') {
      setError(result.message)
    } else {
      setEditing(false)
    }
  }

  return (
    <div style={{ marginTop: 16 }}>
      <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: '.14em', textTransform: 'uppercase', color: 'var(--ink-faint)' }}>
        {existingAddress ? 'Update your address' : 'Your shipping address'}
      </div>
      <textarea
        value={address}
        onChange={(e) => setAddress(e.target.value)}
        placeholder="Enter your full shipping address including city, state, and pin code"
        disabled={loading}
        rows={3}
        style={{
          width: '100%', marginTop: 8, padding: '12px 14px', borderRadius: 12,
          border: '1.5px solid #D3DBE6', background: 'var(--card)',
          fontFamily: 'var(--font-ui)', fontSize: 13.5, color: 'var(--ink)',
          lineHeight: 1.6, resize: 'vertical', outline: 'none',
          boxShadow: 'inset 0 1px 3px rgba(40,45,25,.07)',
          boxSizing: 'border-box' as const,
        }}
      />
      {error && (
        <p style={{ fontSize: 12.5, color: 'var(--danger, #dc2626)', background: 'var(--danger-soft, #fef2f2)', padding: '10px 14px', borderRadius: 12, margin: '10px 0 0' }}>
          {error}
        </p>
      )}
      <div style={{ display: 'flex', gap: 10, marginTop: 12 }}>
        <button
          onClick={handleSubmit}
          disabled={loading || !address.trim()}
          className="neonbtn"
          style={{
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 9,
            height: 44, padding: '0 22px', borderRadius: 12,
            background: 'var(--neon)', border: 'none',
            fontFamily: 'var(--font-ui)', fontWeight: 800, fontSize: 13, letterSpacing: '-0.01em', color: 'var(--ink)',
            boxShadow: '0 10px 24px -14px rgba(40,45,25,.5), inset 0 1px 0 rgba(255,255,255,.7)',
            opacity: loading || !address.trim() ? 0.6 : 1, cursor: loading ? 'not-allowed' : 'pointer',
          }}
        >
          {loading ? 'Sending...' : existingAddress ? 'Update address' : 'Send to brand'}
        </button>
        {editing && (
          <button
            onClick={() => { setEditing(false); setAddress(existingAddress ?? '') }}
            style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 600, color: 'var(--ink-soft)', fontFamily: 'var(--font-ui)' }}
          >
            Cancel
          </button>
        )}
      </div>
    </div>
  )
}

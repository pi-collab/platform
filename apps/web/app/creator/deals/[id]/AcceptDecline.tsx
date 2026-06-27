'use client'

import { useState } from 'react'
import { acceptDeal, declineDeal } from './actions'

export default function AcceptDecline({ dealId }: { dealId: string }) {
  const [loading, setLoading] = useState(false)
  const [declining, setDeclining] = useState(false)
  const [reason, setReason] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState<'accepted' | 'declined' | null>(null)

  async function handleAccept() {
    setError(null)
    setLoading(true)
    const result = await acceptDeal(dealId)
    setLoading(false)
    if (result.status === 'error') setError(result.message)
    else setDone('accepted')
  }

  async function handleDecline() {
    setError(null)
    setLoading(true)
    const result = await declineDeal(dealId, reason)
    setLoading(false)
    if (result.status === 'error') setError(result.message)
    else setDone('declined')
  }

  if (done === 'accepted') {
    return (
      <div style={successBox}>
        <p style={{ fontWeight: 700, fontSize: '0.9375rem', margin: '0 0 0.25rem' }}>Deal accepted</p>
        <p style={{ fontSize: '0.8125rem', color: '#555', margin: 0 }}>
          You can now start working on the deliverables.
        </p>
      </div>
    )
  }

  if (done === 'declined') {
    return (
      <div style={declinedBox}>
        <p style={{ fontWeight: 700, fontSize: '0.9375rem', margin: '0 0 0.25rem' }}>Deal declined</p>
        <p style={{ fontSize: '0.8125rem', color: '#555', margin: 0 }}>
          The brand has been notified.
        </p>
      </div>
    )
  }

  return (
    <div style={cardStyle}>
      <p style={{ fontSize: '0.9375rem', fontWeight: 700, color: '#111', margin: '0 0 0.25rem' }}>
        Respond to this offer
      </p>
      <p style={{ fontSize: '0.8125rem', color: '#888', margin: '0 0 1rem' }}>
        Review the terms above, then accept or decline.
      </p>

      {error && (
        <p style={{ fontSize: '0.8125rem', color: '#dc2626', margin: '0 0 0.75rem', background: '#fef2f2', padding: '0.5rem 0.75rem', borderRadius: 8 }}>
          {error}
        </p>
      )}

      {declining ? (
        <div>
          <label style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', marginBottom: '0.75rem' }}>
            <span style={{ fontSize: '0.75rem', fontWeight: 600, color: '#555' }}>Reason (optional)</span>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Let the brand know why..."
              disabled={loading}
              style={textareaStyle}
            />
          </label>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button
              onClick={handleDecline}
              disabled={loading}
              style={{ ...declineBtn, opacity: loading ? 0.6 : 1, cursor: loading ? 'not-allowed' : 'pointer' }}
            >
              {loading ? 'Declining...' : 'Confirm decline'}
            </button>
            <button
              onClick={() => { setDeclining(false); setError(null) }}
              disabled={loading}
              style={cancelBtn}
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button
            onClick={handleAccept}
            disabled={loading}
            style={{ ...acceptBtn, flex: 1, opacity: loading ? 0.6 : 1, cursor: loading ? 'not-allowed' : 'pointer' }}
          >
            {loading ? 'Accepting...' : 'Accept offer'}
          </button>
          <button
            onClick={() => setDeclining(true)}
            disabled={loading}
            style={{ ...declineOutlineBtn, flexShrink: 0 }}
          >
            Decline
          </button>
        </div>
      )}
    </div>
  )
}

const cardStyle: React.CSSProperties = {
  padding: '1.25rem',
  border: '2px solid #16a34a',
  borderRadius: 12,
  background: '#f0fdf4',
}

const successBox: React.CSSProperties = {
  padding: '1.25rem',
  border: '1px solid #bbf7d0',
  borderRadius: 12,
  background: '#f0fdf4',
}

const declinedBox: React.CSSProperties = {
  padding: '1.25rem',
  border: '1px solid #fecaca',
  borderRadius: 12,
  background: '#fef2f2',
}

const acceptBtn: React.CSSProperties = {
  padding: '0.75rem',
  background: '#16a34a',
  color: '#fff',
  border: 'none',
  borderRadius: 9999,
  fontSize: '0.9375rem',
  fontWeight: 700,
  fontFamily: 'var(--font-body, inherit)',
}

const declineOutlineBtn: React.CSSProperties = {
  padding: '0.75rem 1.25rem',
  background: '#fff',
  color: '#dc2626',
  border: '1px solid #fecaca',
  borderRadius: 9999,
  fontSize: '0.9375rem',
  fontWeight: 600,
  cursor: 'pointer',
}

const declineBtn: React.CSSProperties = {
  padding: '0.625rem 1rem',
  background: '#dc2626',
  color: '#fff',
  border: 'none',
  borderRadius: 9999,
  fontSize: '0.875rem',
  fontWeight: 700,
  fontFamily: 'var(--font-body, inherit)',
}

const cancelBtn: React.CSSProperties = {
  padding: '0.625rem 1rem',
  background: '#fff',
  color: '#555',
  border: '1px solid #d5d5d5',
  borderRadius: 9999,
  fontSize: '0.875rem',
  fontWeight: 600,
  cursor: 'pointer',
}

const textareaStyle: React.CSSProperties = {
  padding: '0.625rem 0.75rem',
  border: '1px solid #d5d5d5',
  borderRadius: 8,
  fontSize: '0.875rem',
  outline: 'none',
  minHeight: 60,
  resize: 'vertical',
  width: '100%',
  boxSizing: 'border-box',
}

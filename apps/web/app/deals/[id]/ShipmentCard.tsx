'use client'

import { useState } from 'react'
import { markShipped, markShipmentDelivered } from './shipment-actions'

export default function ShipmentCard({
  dealId,
  shipmentStatus,
  trackingLink,
  carrierNote,
  shippedAt,
}: {
  dealId: string
  shipmentStatus: string
  trackingLink: string | null
  carrierNote: string | null
  shippedAt: string | null
}) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [link, setLink] = useState('')
  const [note, setNote] = useState('')

  async function handleMarkShipped() {
    setError(null)
    setLoading(true)
    const result = await markShipped(dealId, link || undefined, note || undefined)
    setLoading(false)
    if (result.status === 'error') setError(result.message)
  }

  async function handleMarkDelivered() {
    setError(null)
    setLoading(true)
    const result = await markShipmentDelivered(dealId)
    setLoading(false)
    if (result.status === 'error') setError(result.message)
  }

  return (
    <div style={card}>
      <h3 style={cardTitle}>Product Shipment</h3>

      {shipmentStatus === 'pending' && (
        <div>
          <p style={statusText}>Shipment pending — mark as shipped when ready.</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.375rem', marginBottom: '0.5rem' }}>
            <input
              type="url"
              placeholder="Tracking link (optional)"
              value={link}
              onChange={(e) => setLink(e.target.value)}
              disabled={loading}
              style={inputStyle}
            />
            <input
              type="text"
              placeholder="Carrier / AWB note (optional)"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              disabled={loading}
              style={inputStyle}
            />
          </div>
          <button
            onClick={handleMarkShipped}
            disabled={loading}
            style={{ ...actionBtn, opacity: loading ? 0.5 : 1, cursor: loading ? 'not-allowed' : 'pointer' }}
          >
            {loading ? 'Updating...' : 'Mark as shipped'}
          </button>
        </div>
      )}

      {shipmentStatus === 'shipped' && (
        <div>
          <p style={{ ...statusText, color: '#2563eb' }}>
            Shipped{shippedAt && ` on ${new Date(shippedAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}`}
          </p>
          {trackingLink && (
            <a href={trackingLink} target="_blank" rel="noopener noreferrer" style={linkStyle}>
              Track shipment
            </a>
          )}
          {carrierNote && <p style={{ fontSize: '0.75rem', color: 'var(--color-muted)', margin: '0.25rem 0 0' }}>{carrierNote}</p>}
          <button
            onClick={handleMarkDelivered}
            disabled={loading}
            style={{ ...actionBtn, marginTop: '0.5rem', opacity: loading ? 0.5 : 1, cursor: loading ? 'not-allowed' : 'pointer' }}
          >
            {loading ? 'Updating...' : 'Mark as delivered'}
          </button>
        </div>
      )}

      {shipmentStatus === 'delivered' && (
        <div>
          <p style={{ ...statusText, color: '#16a34a' }}>Product delivered</p>
          {trackingLink && (
            <a href={trackingLink} target="_blank" rel="noopener noreferrer" style={linkStyle}>
              Tracking link
            </a>
          )}
          {carrierNote && <p style={{ fontSize: '0.75rem', color: 'var(--color-muted)', margin: '0.25rem 0 0' }}>{carrierNote}</p>}
        </div>
      )}

      {error && <p style={errorStyle}>{error}</p>}
    </div>
  )
}

const card: React.CSSProperties = {
  padding: '1rem',
  border: '1px solid var(--color-border, #e5e5e5)',
  borderRadius: 'var(--radius-md, 8px)',
  background: 'var(--glass-bg, #fafafa)',
}

const cardTitle: React.CSSProperties = {
  fontSize: '0.75rem',
  fontWeight: 700,
  textTransform: 'uppercase',
  letterSpacing: '0.04em',
  color: 'var(--color-muted, #888)',
  margin: '0 0 0.5rem',
}

const statusText: React.CSSProperties = {
  fontSize: '0.8125rem',
  fontWeight: 600,
  color: 'var(--color-heading, #111)',
  margin: '0 0 0.5rem',
}

const inputStyle: React.CSSProperties = {
  padding: '0.4rem 0.625rem',
  border: '1px solid var(--color-border, #d5d5d5)',
  borderRadius: 'var(--radius-sm, 6px)',
  fontSize: '0.8125rem',
  outline: 'none',
}

const actionBtn: React.CSSProperties = {
  padding: '0.4rem 0.75rem',
  background: 'var(--color-heading, #111)',
  color: '#fff',
  border: 'none',
  borderRadius: 'var(--radius-sm, 6px)',
  fontSize: '0.75rem',
  fontWeight: 700,
}

const linkStyle: React.CSSProperties = {
  fontSize: '0.8125rem',
  color: '#2563eb',
  wordBreak: 'break-all',
}

const errorStyle: React.CSSProperties = {
  fontSize: '0.75rem',
  color: '#dc2626',
  margin: '0.5rem 0 0',
}

'use client'

import { useState } from 'react'
import { markShipped, markShipmentDelivered } from './shipment-actions'

const CARRIERS = ['Bluedart', 'DTDC', 'Delhivery', 'Ecom Express', 'India Post', 'Shadowfax', 'Xpressbees', 'Other']

export default function ShipmentCard({
  dealId,
  shipmentStatus,
  trackingLink,
  carrierNote,
  shippedAt,
  creatorFirstName = 'Creator',
}: {
  dealId: string
  shipmentStatus: string
  trackingLink: string | null
  carrierNote: string | null
  shippedAt: string | null
  creatorFirstName?: string
}) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [carrier, setCarrier] = useState('Bluedart')
  const [customCarrier, setCustomCarrier] = useState('')
  const [trackingNumber, setTrackingNumber] = useState('')
  const [newTrackingLink, setNewTrackingLink] = useState('')

  const carrierName = carrier === 'Other' ? customCarrier.trim() || 'Other' : carrier

  async function handleMarkShipped() {
    setError(null)
    setLoading(true)
    const result = await markShipped(
      dealId,
      newTrackingLink.trim() || undefined,
      `${carrierName}${trackingNumber.trim() ? ` — ${trackingNumber.trim()}` : ''}`,
    )
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
    <div>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 14, flexWrap: 'wrap' }}>
        <h3 style={heading}>Product shipment</h3>
        {shipmentStatus === 'pending' && (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 13, fontWeight: 700, color: 'var(--ink)' }}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--warning)' }} />
            Not shipped yet
          </span>
        )}
        {shipmentStatus === 'shipped' && (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 13, fontWeight: 700, color: 'var(--ink)' }}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--info, #5AA9E6)' }} />
            Shipped{shippedAt && ` ${new Date(shippedAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}`}
          </span>
        )}
        {shipmentStatus === 'delivered' && (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 13, fontWeight: 700, color: 'var(--ink)' }}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--success, #1F9D6B)' }} />
            Delivered
          </span>
        )}
      </div>

      {error && <p style={errorStyle}>{error}</p>}

      {/* Pending state — form to ship */}
      {shipmentStatus === 'pending' && (
        <>
          <p style={{ fontSize: 14, lineHeight: 1.6, color: 'var(--ink-soft)', margin: '14px 0 0', maxWidth: 640 }}>
            {creatorFirstName} has 5 days to deliver once he receives this — mark it shipped and add tracking so that window starts.
          </p>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginTop: 22, paddingTop: 20, borderTop: '1px solid var(--border-hairline, #EAEAE3)' }}>
            <div>
              <div style={metaLabel}>Carrier</div>
              <div style={{ position: 'relative', marginTop: 7 }}>
                <select
                  value={carrier}
                  onChange={(e) => setCarrier(e.target.value)}
                  disabled={loading}
                  style={selectStyle}
                >
                  {CARRIERS.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--ink-soft)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ position: 'absolute', right: 14, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }}><path d="m6 9 6 6 6-6" /></svg>
              </div>
            </div>
            {carrier === 'Other' ? (
              <div>
                <div style={metaLabel}>Carrier name</div>
                <input
                  type="text"
                  placeholder="e.g. FedEx, DHL"
                  value={customCarrier}
                  onChange={(e) => setCustomCarrier(e.target.value)}
                  disabled={loading}
                  style={{ ...inputStyle, marginTop: 7 }}
                />
              </div>
            ) : (
              <div>
                <div style={metaLabel}>Tracking number</div>
                <input
                  type="text"
                  placeholder="e.g. BD48213090"
                  value={trackingNumber}
                  onChange={(e) => setTrackingNumber(e.target.value)}
                  disabled={loading}
                  style={{ ...inputStyle, marginTop: 7 }}
                />
              </div>
            )}
          </div>

          {/* Second row: tracking number (when Other) + tracking link */}
          <div style={{ display: 'grid', gridTemplateColumns: carrier === 'Other' ? '1fr 1fr' : '1fr', gap: 16, marginTop: 14 }}>
            {carrier === 'Other' && (
              <div>
                <div style={metaLabel}>Tracking number</div>
                <input
                  type="text"
                  placeholder="e.g. BD48213090"
                  value={trackingNumber}
                  onChange={(e) => setTrackingNumber(e.target.value)}
                  disabled={loading}
                  style={{ ...inputStyle, marginTop: 7 }}
                />
              </div>
            )}
            <div>
              <div style={metaLabel}>Tracking link</div>
              <input
                type="url"
                placeholder="https://..."
                value={newTrackingLink}
                onChange={(e) => setNewTrackingLink(e.target.value)}
                disabled={loading}
                style={{ ...inputStyle, marginTop: 7 }}
              />
            </div>
          </div>

          <button
            onClick={handleMarkShipped}
            disabled={loading}
            className="neonbtn"
            style={{ ...neonBtn, marginTop: 20, opacity: loading ? 0.6 : 1, cursor: loading ? 'not-allowed' : 'pointer' }}
          >
            {loading ? 'Updating...' : 'Mark as shipped'}
          </button>
        </>
      )}

      {/* Shipped state */}
      {shipmentStatus === 'shipped' && (
        <>
          <p style={{ fontSize: 14, lineHeight: 1.6, color: 'var(--ink-soft)', margin: '14px 0 0', maxWidth: 640 }}>
            Product is on its way to {creatorFirstName.toLowerCase()}. Mark as delivered once confirmed.
          </p>

          {carrierNote && (
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '10px 16px', borderRadius: 999, background: 'var(--card)', border: '1px solid var(--border-hairline, #EAEAE3)', marginTop: 16, fontSize: 13, fontWeight: 600, color: 'var(--ink)' }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--ink-soft)" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M16 16V4H2v12h14zM16 8h4l2 4v4h-6" /><circle cx="5.5" cy="18.5" r="2" /><circle cx="18.5" cy="18.5" r="2" /></svg>
              {carrierNote}
            </div>
          )}

          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginTop: 20 }}>
            {trackingLink && (
              <a
                href={trackingLink}
                target="_blank"
                rel="noopener noreferrer"
                className="pill-hover"
                style={pillBtn}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M16 16V4H2v12h14zM16 8h4l2 4v4h-6" /><circle cx="5.5" cy="18.5" r="2" /><circle cx="18.5" cy="18.5" r="2" /></svg>
                Track shipment
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M7 17 17 7M17 7H7m10 0v10" /></svg>
              </a>
            )}
            <button
              onClick={handleMarkDelivered}
              disabled={loading}
              className="neonbtn"
              style={{ ...neonBtn, opacity: loading ? 0.6 : 1, cursor: loading ? 'not-allowed' : 'pointer' }}
            >
              {loading ? 'Updating...' : 'Mark as delivered'}
            </button>
          </div>
        </>
      )}

      {/* Delivered state */}
      {shipmentStatus === 'delivered' && (
        <>
          <p style={{ fontSize: 14, lineHeight: 1.6, color: 'var(--ink-soft)', margin: '14px 0 0', maxWidth: 640 }}>
            Product delivered to {creatorFirstName.toLowerCase()}. The delivery window has started.
          </p>

          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginTop: 16 }}>
            {carrierNote && (
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '10px 16px', borderRadius: 999, background: 'var(--card)', border: '1px solid var(--border-hairline, #EAEAE3)', fontSize: 13, fontWeight: 600, color: 'var(--ink)' }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--ink-soft)" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>
                {carrierNote}
              </div>
            )}
            {trackingLink && (
              <a
                href={trackingLink}
                target="_blank"
                rel="noopener noreferrer"
                className="pill-hover"
                style={pillBtn}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M16 16V4H2v12h14zM16 8h4l2 4v4h-6" /><circle cx="5.5" cy="18.5" r="2" /><circle cx="18.5" cy="18.5" r="2" /></svg>
                Tracking link
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M7 17 17 7M17 7H7m10 0v10" /></svg>
              </a>
            )}
          </div>
        </>
      )}
    </div>
  )
}

const heading: React.CSSProperties = {
  fontFamily: 'var(--font-display)', fontSize: 20, fontWeight: 700, letterSpacing: '-0.02em', margin: 0,
}

const metaLabel: React.CSSProperties = {
  fontSize: 10, fontWeight: 600, letterSpacing: '.14em', textTransform: 'uppercase', color: 'var(--ink-faint)',
}

const inputStyle: React.CSSProperties = {
  outline: 'none', border: '1.5px solid #D3DBE6', background: 'var(--card)',
  borderRadius: 12, fontFamily: 'var(--font-ui)', fontSize: 13.5, color: 'var(--ink)',
  width: '100%', height: 46, padding: '0 14px',
  boxShadow: 'inset 0 1px 3px rgba(40,45,25,.07)',
  boxSizing: 'border-box' as const,
}

const selectStyle: React.CSSProperties = {
  ...inputStyle,
  appearance: 'none' as const,
  paddingRight: 36,
  cursor: 'pointer',
}

const pillBtn: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: 7,
  height: 48, padding: '0 22px', borderRadius: 12,
  background: 'var(--card)', border: '1px solid var(--border-hairline, #EAEAE3)',
  boxShadow: '0 1px 2px rgba(22,23,15,.03), 0 8px 16px rgba(22,23,15,.04)',
  fontFamily: 'var(--font-ui)', fontWeight: 700, fontSize: 13.5, color: 'var(--ink)',
  cursor: 'pointer', textDecoration: 'none',
}

const neonBtn: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 9,
  height: 48, padding: '0 26px', borderRadius: 12,
  background: 'var(--neon)', border: 'none',
  fontFamily: 'var(--font-ui)', fontWeight: 800, fontSize: 14, letterSpacing: '-0.01em', color: 'var(--ink)',
  boxShadow: '0 10px 24px -14px rgba(40,45,25,.5), inset 0 1px 0 rgba(255,255,255,.7)',
}

const errorStyle: React.CSSProperties = {
  fontSize: 12.5, color: 'var(--danger, #dc2626)', background: 'var(--danger-soft, #fef2f2)',
  padding: '10px 14px', borderRadius: 12, margin: '14px 0 0',
}

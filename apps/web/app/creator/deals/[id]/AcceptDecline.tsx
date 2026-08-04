'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { acceptDeal, declineDeal } from './actions'

export default function AcceptDecline({ dealId }: { dealId: string }) {
  const [loading, setLoading] = useState(false)
  const [declining, setDeclining] = useState(false)
  const [reason, setReason] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState<'accepted' | 'declined' | null>(null)
  const router = useRouter()

  async function handleAccept() {
    setError(null)
    setLoading(true)
    const result = await acceptDeal(dealId)
    setLoading(false)
    if (result.status === 'error') setError(result.message)
    else { setDone('accepted'); router.refresh() }
  }

  async function handleDecline() {
    setError(null)
    setLoading(true)
    const result = await declineDeal(dealId, reason)
    setLoading(false)
    if (result.status === 'error') setError(result.message)
    else { setDone('declined'); router.refresh() }
  }

  if (done === 'accepted') {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '18px 22px', borderRadius: 14, border: '1.5px solid var(--neon-deep)', background: 'color-mix(in oklab, var(--neon) 14%, var(--card))' }}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--ink)" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>
        <div>
          <p style={{ fontWeight: 700, fontSize: 14, margin: 0, color: 'var(--ink)' }}>Deal accepted</p>
          <p style={{ fontSize: 12.5, color: 'var(--ink-soft)', margin: '2px 0 0' }}>You can now start working on the deliverables.</p>
        </div>
      </div>
    )
  }

  if (done === 'declined') {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '18px 22px', borderRadius: 14, border: '1.5px solid var(--danger, #D2545A)', background: 'var(--danger-soft, #FFEBEB)' }}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--danger, #D2545A)" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18M6 6l12 12" /></svg>
        <div>
          <p style={{ fontWeight: 700, fontSize: 14, margin: 0, color: 'var(--ink)' }}>Deal declined</p>
          <p style={{ fontSize: 12.5, color: 'var(--ink-soft)', margin: '2px 0 0' }}>The brand has been notified.</p>
        </div>
      </div>
    )
  }

  return (
    <div>
      {error && (
        <p style={{ fontSize: 12.5, color: 'var(--danger, #dc2626)', margin: '0 0 12px', background: 'var(--danger-soft, #fef2f2)', padding: '10px 14px', borderRadius: 12 }}>
          {error}
        </p>
      )}

      {declining ? (
        <div>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 14 }}>
            <span style={{ fontSize: 10, fontWeight: 600, letterSpacing: '.14em', textTransform: 'uppercase' as const, color: 'var(--ink-faint)' }}>Reason (optional)</span>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Let the brand know why..."
              disabled={loading}
              style={textareaStyle}
            />
          </label>
          <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', alignItems: 'center' }}>
            <button
              onClick={handleDecline}
              disabled={loading}
              style={{ ...dangerBtn, opacity: loading ? 0.6 : 1, cursor: loading ? 'not-allowed' : 'pointer' }}
            >
              {loading ? 'Declining...' : 'Confirm decline'}
            </button>
            <button
              onClick={() => { setDeclining(false); setError(null) }}
              disabled={loading}
              className="pill-hover"
              style={secondaryBtn}
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', alignItems: 'center' }}>
          <button
            onClick={handleAccept}
            disabled={loading}
            className="neonbtn"
            style={{ ...neonBtn, opacity: loading ? 0.6 : 1, cursor: loading ? 'not-allowed' : 'pointer' }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>
            {loading ? 'Accepting...' : 'Accept offer'}
          </button>
          <button
            onClick={() => setDeclining(true)}
            disabled={loading}
            className="viewlink"
            style={declineLinkStyle}
          >
            Decline this offer
          </button>
        </div>
      )}
    </div>
  )
}

const neonBtn: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 9,
  height: 54, padding: '0 30px', borderRadius: 14,
  background: 'var(--neon)', border: 'none',
  fontFamily: 'var(--font-ui)', fontWeight: 800, fontSize: 15.5, letterSpacing: '-0.01em', color: 'var(--ink)',
  boxShadow: '0 10px 24px -14px rgba(40,45,25,.5), inset 0 1px 0 rgba(255,255,255,.7)',
}

const secondaryBtn: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 7,
  height: 54, padding: '0 20px', borderRadius: 14,
  background: 'var(--card)', border: '1px solid var(--frost-edge)',
  boxShadow: '0 8px 18px -12px rgba(40,45,25,.42)',
  fontFamily: 'var(--font-ui)', fontWeight: 700, fontSize: 13.5, color: 'var(--ink)', cursor: 'pointer',
}

const dangerBtn: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 7,
  height: 54, padding: '0 24px', borderRadius: 14,
  background: 'var(--danger, #dc2626)', border: 'none',
  fontFamily: 'var(--font-ui)', fontWeight: 800, fontSize: 14, color: '#FFFFFF',
  boxShadow: '0 10px 24px -14px rgba(210,84,90,.5)',
}

const declineLinkStyle: React.CSSProperties = {
  background: 'none', border: 'none', padding: 0,
  fontFamily: 'var(--font-ui)', fontSize: 12, fontWeight: 600,
  color: 'var(--danger, #dc2626)', textDecoration: 'underline', textUnderlineOffset: 3,
  cursor: 'pointer',
}

const textareaStyle: React.CSSProperties = {
  outline: 'none', border: '1.5px solid #D3DBE6', background: 'var(--card)',
  borderRadius: 12, fontFamily: 'var(--font-ui)', fontSize: 13.5, color: 'var(--ink)',
  width: '100%', minHeight: 80, padding: 14, resize: 'vertical', boxSizing: 'border-box',
  boxShadow: 'inset 0 1px 3px rgba(40,45,25,.05)',
}

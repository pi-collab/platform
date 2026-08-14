'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { acceptDeal, declineDeal, counterOffer } from './actions'
import { trackEvent } from '@/lib/analytics'

interface ItemForCounter {
  id: string
  label: string
  price_paise: number
}

export default function AcceptDecline({
  dealId,
  items,
}: {
  dealId: string
  items?: ItemForCounter[]
}) {
  const [loading, setLoading] = useState(false)
  const [declining, setDeclining] = useState(false)
  const [counterOpen, setCounterOpen] = useState(false)
  const [reason, setReason] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState<'accepted' | 'declined' | 'countered' | null>(null)
  const [counterPrices, setCounterPrices] = useState<Record<string, string>>({})
  const [counterNote, setCounterNote] = useState('')
  const router = useRouter()

  function formatINR(paise: number): string {
    const rupees = paise / 100
    const s = String(Math.round(rupees))
    const last3 = s.slice(-3)
    const rest = s.slice(0, -3)
    return '\u20B9' + (rest ? rest.replace(/\B(?=(\d\d)+(?!\d))/g, ',') + ',' + last3 : last3)
  }

  const counterTotal = (items ?? []).reduce((sum, item) => {
    const v = counterPrices[item.id]
    const n = v != null && v !== '' ? parseFloat(v) : item.price_paise / 100
    return sum + (isNaN(n) ? 0 : Math.round(n * 100))
  }, 0)

  async function handleAccept() {
    setError(null)
    setLoading(true)
    const result = await acceptDeal(dealId)
    if (result.status === 'success') trackEvent('offer_accepted', { surface: 'app' })
    setLoading(false)
    if (result.status === 'error') setError(result.message)
    else { setDone('accepted'); router.refresh() }
  }

  async function handleDecline() {
    setError(null)
    setLoading(true)
    const result = await declineDeal(dealId, reason)
    if (result.status === 'success') trackEvent('offer_declined', { surface: 'app' })
    setLoading(false)
    if (result.status === 'error') setError(result.message)
    else { setDone('declined'); router.refresh() }
  }

  async function handleCounter() {
    setError(null)
    if (counterTotal <= 0) {
      setError('Counter total must be greater than zero.')
      return
    }
    setLoading(true)
    const counterItems = (items ?? []).map((item) => {
      const v = counterPrices[item.id]
      const n = v != null && v !== '' ? parseFloat(v) : item.price_paise / 100
      return { id: item.id, label: item.label, price_paise: Math.round((isNaN(n) ? 0 : n) * 100) }
    })
    const result = await counterOffer(dealId, counterItems, counterNote)
    if (result.status === 'success') trackEvent('offer_countered', { items: counterItems.length })
    setLoading(false)
    if (result.status === 'error') setError(result.message)
    else { setDone('countered'); setCounterOpen(false); router.refresh() }
  }

  // ── Done states ──

  if (done === 'accepted') {
    return (
      <div style={doneCardStyle}>
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

  if (done === 'countered') {
    return (
      <div style={doneCardStyle}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--ink)" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M7 17 17 7M17 7H7m10 0v10" /></svg>
        <div>
          <p style={{ fontWeight: 700, fontSize: 14, margin: 0, color: 'var(--ink)' }}>Counter offer sent</p>
          <p style={{ fontSize: 12.5, color: 'var(--ink-soft)', margin: '2px 0 0' }}>The brand can accept, revise, or decline your counter.</p>
        </div>
      </div>
    )
  }

  // ── Decline flow ──

  if (declining) {
    return (
      <div>
        {error && (
          <p style={errorStyle}>{error}</p>
        )}
        <label style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 14 }}>
          <span style={metaLabel}>Reason (optional)</span>
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
    )
  }

  // ── Default: info + decline link (left) | Accept + Counter (right) ──

  return (
    <>
      {error && !counterOpen && (
        <p style={{ ...errorStyle, marginBottom: 16 }}>{error}</p>
      )}

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
        {/* Left: info text + decline link */}
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, maxWidth: 380 }}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="var(--ink-soft)" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, marginTop: 2 }}><circle cx="12" cy="12" r="10" /><path d="M12 16v-4M12 8h.01" /></svg>
          <div>
            <span style={{ display: 'block', fontSize: 11.5, lineHeight: 1.45, color: 'var(--ink-soft)' }}>
              Accepting locks the terms above. Countering opens a negotiation.
            </span>
            <button
              onClick={() => setDeclining(true)}
              disabled={loading}
              className="viewlink"
              style={declineLinkStyle}
            >
              Decline this offer
            </button>
          </div>
        </div>

        {/* Right: Accept + Counter buttons */}
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
          {items && items.length > 0 && (
            <button
              onClick={() => { setCounterOpen(true); setError(null) }}
              disabled={loading}
              className="pill-hover"
              style={secondaryBtn}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20h9" /><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" /></svg>
              Counter
            </button>
          )}
        </div>
      </div>

      {/* ── Counter offer modal ── */}
      {counterOpen && (
        <div
          style={overlayStyle}
          onClick={(e) => { if (e.target === e.currentTarget && !loading) { setCounterOpen(false); setError(null) } }}
        >
          <div className="surface" style={{ width: '100%', maxWidth: 540, padding: 0, overflow: 'hidden', maxHeight: '92vh', overflowY: 'auto' }}>
            {/* Header */}
            <div style={{ padding: '22px 24px', borderBottom: '1px solid var(--border-hairline, #EAEAE3)', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 14 }}>
              <div>
                <h3 style={{ fontFamily: 'var(--font-display)', fontSize: 20, fontWeight: 700, letterSpacing: '-0.02em', margin: 0 }}>Counter this offer</h3>
                <div style={{ fontSize: 11.5, color: 'var(--ink-soft)', marginTop: 5 }}>Change only what you want to move — blank fields keep the brand&apos;s terms.</div>
              </div>
              <button
                className="viewlink"
                onClick={() => { if (!loading) { setCounterOpen(false); setError(null) } }}
                style={{ padding: 6, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--ink-soft)', flexShrink: 0 }}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18M6 6l12 12" /></svg>
              </button>
            </div>

            {/* Body */}
            <div style={{ padding: '22px 24px', display: 'flex', flexDirection: 'column', gap: 16 }}>
              {error && (
                <p style={{ ...errorStyle, margin: 0 }}>{error}</p>
              )}

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 14 }}>
                {(items ?? []).map((item) => (
                  <div key={item.id}>
                    <div style={metaLabel}>{item.label}</div>
                    <input
                      className="dinput"
                      style={{ marginTop: 7 }}
                      type="text"
                      inputMode="numeric"
                      placeholder={formatINR(item.price_paise)}
                      value={counterPrices[item.id] ?? ''}
                      onChange={(e) => {
                        const v = e.target.value.replace(/[^0-9.]/g, '')
                        setCounterPrices((prev) => ({ ...prev, [item.id]: v }))
                      }}
                      disabled={loading}
                    />
                  </div>
                ))}
              </div>

              {/* Note */}
              <div>
                <div style={metaLabel}>Note to the brand</div>
                <input
                  className="dinput"
                  style={{ marginTop: 7 }}
                  type="text"
                  placeholder="One line on why — optional"
                  value={counterNote}
                  onChange={(e) => setCounterNote(e.target.value)}
                  disabled={loading}
                />
              </div>

              {/* You would receive */}
              <div style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 14, flexWrap: 'wrap',
                padding: '14px 16px', borderRadius: 14,
                background: 'var(--sec-2, #F7F4FB)', border: '1px solid var(--sec-mid-2, #E8E2F0)',
              }}>
                <span style={{ fontSize: 11.5, color: 'var(--ink-soft)' }}>You would receive</span>
                <b style={{ fontFamily: 'var(--font-display)', fontSize: 22, fontWeight: 800, letterSpacing: '-0.03em' }}>
                  {counterTotal > 0 ? formatINR(counterTotal) : '\u2014'}
                </b>
              </div>
            </div>

            {/* Footer */}
            <div style={{ padding: '18px 24px', borderTop: '1px solid var(--border-hairline, #EAEAE3)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 11.5, lineHeight: 1.45, color: 'var(--ink-soft)', maxWidth: 250 }}>
                The brand can accept, revise, or decline your counter.
              </span>
              <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', alignItems: 'center' }}>
                <button
                  onClick={() => { setCounterOpen(false); setError(null) }}
                  disabled={loading}
                  className="pill-hover"
                  style={secondaryBtn}
                >
                  Cancel
                </button>
                <button
                  onClick={handleCounter}
                  disabled={loading || counterTotal <= 0}
                  className="neonbtn"
                  style={{ ...neonBtn, opacity: (loading || counterTotal <= 0) ? 0.6 : 1, cursor: (loading || counterTotal <= 0) ? 'not-allowed' : 'pointer' }}
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
                  {loading ? 'Sending...' : 'Send counter'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* dinput styles */}
      <style>{`
        .dinput {
          outline: none; border: 1.5px solid #D3DBE6; background: var(--card);
          border-radius: 12px; font-family: var(--font-ui); font-size: 13.5px; color: var(--ink);
          width: 100%; height: 46px; padding: 0 14px;
          box-shadow: inset 0 1px 3px rgba(40,45,25,.07);
          transition: border-color .16s ease, box-shadow .16s ease;
          box-sizing: border-box;
        }
        .dinput:focus {
          border-color: var(--neon-deep);
          box-shadow: 0 0 0 4px rgba(218,254,12,.18), inset 0 1px 3px rgba(40,45,25,.05);
        }
        .dinput::placeholder { color: var(--ink-faint); }
      `}</style>
    </>
  )
}

const doneCardStyle: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 10, padding: '18px 22px', borderRadius: 14,
  border: '1.5px solid var(--neon-deep)', background: 'color-mix(in oklab, var(--neon) 14%, var(--card))',
}

const metaLabel: React.CSSProperties = {
  fontSize: 10, fontWeight: 600, letterSpacing: '.14em', textTransform: 'uppercase', color: 'var(--ink-faint)',
}

const errorStyle: React.CSSProperties = {
  fontSize: 12.5, color: 'var(--danger, #dc2626)', background: 'var(--danger-soft, #fef2f2)',
  padding: '10px 14px', borderRadius: 12, margin: 0,
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
  display: 'inline-block', marginTop: 8, background: 'none', border: 'none', padding: 0,
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

const overlayStyle: React.CSSProperties = {
  position: 'fixed', inset: 0, zIndex: 1000,
  background: 'rgba(22,23,15,.45)', backdropFilter: 'blur(4px)',
  display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24,
}

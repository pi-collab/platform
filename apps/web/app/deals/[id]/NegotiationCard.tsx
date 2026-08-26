'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { acceptCounterOffer, brandCounterOffer } from './deal-actions'

interface CounterEvent {
  counter_items: { id: string; label: string; price_paise: number }[]
  counter_total_paise: number
  note?: string | null
}

interface Props {
  dealId: string
  creatorFirstName: string
  brandOfferPaise: number
  brandOfferDate: string
  counterEvent: CounterEvent
  counterDate: string
  items: { id: string; label: string; price_paise: number }[]
}

export default function NegotiationCard({
  dealId,
  creatorFirstName,
  brandOfferPaise,
  brandOfferDate,
  counterEvent,
  counterDate,
  items,
}: Props) {
  const [loading, setLoading] = useState(false)
  const [counterOpen, setCounterOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState<'accepted' | 'countered' | null>(null)
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

  function formatDate(dateStr: string): string {
    return new Date(dateStr).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })
  }

  const counterTotal = items.reduce((sum, item) => {
    const v = counterPrices[item.id]
    const n = v != null && v !== '' ? parseFloat(v) : item.price_paise / 100
    return sum + (isNaN(n) ? 0 : Math.round(n * 100))
  }, 0)

  async function handleAccept() {
    setError(null)
    setLoading(true)
    const result = await acceptCounterOffer(dealId)
    setLoading(false)
    if (result.status === 'error') setError(result.message)
    else { setDone('accepted'); router.refresh() }
  }

  async function handleCounter() {
    setError(null)
    if (counterTotal <= 0) { setError('Counter total must be greater than zero.'); return }
    setLoading(true)
    const counterItems = items.map((item) => {
      const v = counterPrices[item.id]
      const n = v != null && v !== '' ? parseFloat(v) : item.price_paise / 100
      return { id: item.id, label: item.label, price_paise: Math.round((isNaN(n) ? 0 : n) * 100) }
    })
    const result = await brandCounterOffer(dealId, counterItems, counterNote)
    setLoading(false)
    if (result.status === 'error') setError(result.message)
    else { setDone('countered'); setCounterOpen(false); router.refresh() }
  }

  if (done === 'accepted') {
    return (
      <div className="surface" style={{ padding: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '18px 22px', borderRadius: 14, border: '1.5px solid var(--neon-deep)', background: 'color-mix(in oklab, var(--neon) 14%, var(--card))' }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--ink)" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>
          <div>
            <p style={{ fontWeight: 700, fontSize: 14, margin: 0 }}>Counter accepted</p>
            <p style={{ fontSize: 12.5, color: 'var(--ink-soft)', margin: '2px 0 0' }}>Terms are now locked. {creatorFirstName} can start working.</p>
          </div>
        </div>
      </div>
    )
  }

  if (done === 'countered') {
    return (
      <div className="surface" style={{ padding: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '18px 22px', borderRadius: 14, border: '1.5px solid var(--neon-deep)', background: 'color-mix(in oklab, var(--neon) 14%, var(--card))' }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--ink)" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M7 17 17 7M17 7H7m10 0v10" /></svg>
          <div>
            <p style={{ fontWeight: 700, fontSize: 14, margin: 0 }}>Counter sent</p>
            <p style={{ fontSize: 12.5, color: 'var(--ink-soft)', margin: '2px 0 0' }}>{creatorFirstName} can accept, counter again, or decline.</p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <>
      <div className="surface" style={{ padding: 24 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 14, flexWrap: 'wrap' }}>
          <h3 style={{ fontFamily: 'var(--font-display)', fontSize: 20, fontWeight: 700, letterSpacing: '-0.02em', margin: 0 }}>Negotiation</h3>
          <span style={{ fontSize: 11.5, color: 'var(--ink-soft)' }}>Round 2 &middot; {formatDate(counterDate)}</span>
        </div>

        {error && (
          <p style={{ fontSize: 12.5, color: 'var(--danger, #dc2626)', background: 'var(--danger-soft, #fef2f2)', padding: '10px 14px', borderRadius: 12, margin: '16px 0 0' }}>
            {error}
          </p>
        )}

        {/* Price comparison */}
        <div style={{ display: 'flex', alignItems: 'stretch', gap: 0, marginTop: 24, flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: 180, paddingRight: 24 }}>
            <div style={metaLabel}>You suggested</div>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: 32, fontWeight: 800, letterSpacing: '-0.03em', lineHeight: 1, marginTop: 8, color: 'var(--ink-soft)' }}>
              {formatINR(brandOfferPaise)}
            </div>
            <div style={{ fontSize: 11.5, color: 'var(--ink-soft)', marginTop: 6 }}>{formatDate(brandOfferDate)}</div>
          </div>
          <div style={{ flex: 1, minWidth: 180, paddingLeft: 24, borderLeft: '1px solid var(--border-hairline, #EAEAE3)' }}>
            <div style={metaLabel}>{creatorFirstName}&apos;s counter</div>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: 32, fontWeight: 800, letterSpacing: '-0.03em', lineHeight: 1, marginTop: 8 }}>
              {formatINR(counterEvent.counter_total_paise)}
            </div>
            <div style={{ fontSize: 11.5, color: 'var(--ink-soft)', marginTop: 6 }}>
              {formatDate(counterDate)}
              {counterEvent.note && <> &middot; {counterEvent.note}</>}
            </div>
          </div>
        </div>

        {/* Actions */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap', marginTop: 26, paddingTop: 22, borderTop: '1px solid var(--border-hairline, #EAEAE3)' }}>
          <div style={{ fontSize: 11.5, color: 'var(--ink-soft)', maxWidth: 380 }}>
            Accepting locks in {creatorFirstName.toLowerCase()}&apos;s terms below. Countering sends a new number. {creatorFirstName.toLowerCase()} can accept, counter again, or decline.
          </div>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <button
              onClick={() => { setCounterOpen(true); setError(null) }}
              disabled={loading}
              className="pill-hover"
              style={pillBtn}
            >
              Counter back
            </button>
            <button
              onClick={handleAccept}
              disabled={loading}
              className="neonbtn"
              style={{ ...neonBtn, opacity: loading ? 0.6 : 1, cursor: loading ? 'not-allowed' : 'pointer' }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>
              {loading ? 'Accepting...' : 'Accept counter'}
            </button>
          </div>
        </div>
      </div>

      {/* ── Counter back modal ── */}
      {counterOpen && (
        <div
          style={overlayStyle}
          onClick={(e) => { if (e.target === e.currentTarget && !loading) { setCounterOpen(false); setError(null) } }}
        >
          <div className="surface" style={{ width: '100%', maxWidth: 540, padding: 0, overflow: 'hidden', maxHeight: '92vh', overflowY: 'auto' }}>
            <div style={{ padding: '22px 24px', borderBottom: '1px solid var(--border-hairline, #EAEAE3)', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 14 }}>
              <div>
                <h3 style={{ fontFamily: 'var(--font-display)', fontSize: 20, fontWeight: 700, letterSpacing: '-0.02em', margin: 0 }}>Counter back</h3>
                <div style={{ fontSize: 11.5, color: 'var(--ink-soft)', marginTop: 5 }}>Change only what you want to move. Blank fields keep current terms.</div>
              </div>
              <button
                className="viewlink"
                onClick={() => { if (!loading) { setCounterOpen(false); setError(null) } }}
                style={{ padding: 6, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--ink-soft)', flexShrink: 0 }}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18M6 6l12 12" /></svg>
              </button>
            </div>

            <div style={{ padding: '22px 24px', display: 'flex', flexDirection: 'column', gap: 16 }}>
              {error && (
                <p style={{ fontSize: 12.5, color: 'var(--danger, #dc2626)', margin: 0, background: 'var(--danger-soft, #fef2f2)', padding: '10px 14px', borderRadius: 12 }}>
                  {error}
                </p>
              )}

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 14 }}>
                {items.map((item) => (
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

              <div>
                <div style={metaLabel}>Note to {creatorFirstName}</div>
                <input
                  className="dinput"
                  style={{ marginTop: 7 }}
                  type="text"
                  placeholder="One line on why (optional)"
                  value={counterNote}
                  onChange={(e) => setCounterNote(e.target.value)}
                  disabled={loading}
                />
              </div>

              <div style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 14, flexWrap: 'wrap',
                padding: '14px 16px', borderRadius: 14,
                background: 'var(--ink)', color: '#FFFFFF',
              }}>
                <span style={{ fontSize: 11.5 }}>You would pay</span>
                <b style={{ fontFamily: 'var(--font-display)', fontSize: 22, fontWeight: 800, letterSpacing: '-0.03em' }}>
                  {counterTotal > 0 ? formatINR(counterTotal) : ', '}
                </b>
              </div>
            </div>

            <div style={{ padding: '18px 24px', borderTop: '1px solid var(--border-hairline, #EAEAE3)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 11.5, lineHeight: 1.45, color: 'var(--ink-soft)', maxWidth: 250 }}>
                {creatorFirstName} can accept, counter again, or decline.
              </span>
              <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', alignItems: 'center' }}>
                <button
                  onClick={() => { setCounterOpen(false); setError(null) }}
                  disabled={loading}
                  className="pill-hover"
                  style={pillBtn}
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

const metaLabel: React.CSSProperties = {
  fontSize: 10, fontWeight: 600, letterSpacing: '.14em', textTransform: 'uppercase', color: 'var(--ink-faint)',
}

const neonBtn: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: 9,
  height: 48, padding: '0 26px', borderRadius: 12,
  background: 'var(--neon)', border: 'none',
  fontFamily: 'var(--font-ui)', fontWeight: 800, fontSize: 14, letterSpacing: '-0.01em', color: 'var(--ink)',
  boxShadow: '0 10px 24px -14px rgba(40,45,25,.5), inset 0 1px 0 rgba(255,255,255,.7)',
  cursor: 'pointer',
}

const pillBtn: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: 7,
  height: 48, padding: '0 22px', borderRadius: 12,
  background: 'var(--card)', border: '1px solid var(--hairline, #EAEAE3)',
  boxShadow: '0 1px 2px rgba(22,23,15,.03), 0 8px 16px rgba(22,23,15,.04)',
  fontFamily: 'var(--font-ui)', fontWeight: 700, fontSize: 13.5, color: 'var(--ink)', cursor: 'pointer',
}

const overlayStyle: React.CSSProperties = {
  position: 'fixed', inset: 0, zIndex: 1000,
  background: 'rgba(22,23,15,.45)', backdropFilter: 'blur(4px)',
  display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24,
}

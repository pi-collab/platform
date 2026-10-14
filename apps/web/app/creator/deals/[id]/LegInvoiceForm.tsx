'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { raiseExtraInvoice, raiseLegInvoice } from './leg-actions'

/**
 * 0552: after Guapd marks the shoot done, the creator confirms it and raises
 * their invoice to Guapd. Nothing here sets an amount: the database copies the
 * locked figures; the total shown is only checked against them on submit.
 */
export default function LegInvoiceForm({ dealId, payablePaise, payableLabel, shootLabel, defaultName, compact = false, extraId = null }: {
  dealId: string
  payablePaise: number
  payableLabel: string
  shootLabel: string
  defaultName: string
  compact?: boolean
  /** 0555: the invoice for an extra on this deal. */
  extraId?: string | null
}) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [confirmed, setConfirmed] = useState(false)
  const [name, setName] = useState(defaultName)
  const [gstin, setGstin] = useState('')
  const [error, setError] = useState<string | null>(null)

  const submit = () => {
    setError(null)
    start(async () => {
      const input = { confirmed, billingName: name, gstin, expectedPayablePaise: payablePaise }
      const r = extraId ? await raiseExtraInvoice(dealId, extraId, input) : await raiseLegInvoice(dealId, input)
      if (!r.ok) { setError(r.message); return }
      router.refresh()
    })
  }

  const input: React.CSSProperties = {
    width: '100%', height: 42, padding: '0 12px', borderRadius: 11, border: '1px solid var(--border-hairline, #EAEAE3)',
    background: 'var(--card)', fontFamily: 'var(--font-ui)', fontSize: 13.5, color: 'var(--ink)',
  }
  const label: React.CSSProperties = { fontSize: 10, fontWeight: 600, letterSpacing: '.14em', textTransform: 'uppercase', color: 'var(--ink-faint)', display: 'block', marginBottom: 6 }
  const ready = confirmed && name.trim().length >= 2 && !pending

  return (
    <div style={{ width: '100%', display: 'grid', gap: 14 }}>
      <label style={{ display: 'flex', gap: 10, alignItems: 'flex-start', cursor: 'pointer', fontSize: 13, lineHeight: 1.45, color: 'var(--ink)' }}>
        <input type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} style={{ marginTop: 3, width: 16, height: 16, accentColor: 'var(--ink)' }} />
        <span>{extraId ? 'I confirm this extra work is agreed and my part is complete.' : <>I confirm the shoot {shootLabel} is done and my part is complete.</>}</span>
      </label>
      <div style={{ display: 'grid', gridTemplateColumns: compact ? '1fr' : '1fr 1fr', gap: 12 }}>
        <div>
          <span style={label}>Invoice from</span>
          <input style={input} value={name} maxLength={200} onChange={(e) => setName(e.target.value)} aria-label="Name to invoice from" placeholder="Your name or business name" />
        </div>
        <div>
          <span style={label}>GSTIN (optional)</span>
          <input style={input} value={gstin} maxLength={15} onChange={(e) => setGstin(e.target.value.toUpperCase())} aria-label="GSTIN" placeholder="Only if you are GST-registered" />
        </div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 11.5, lineHeight: 1.45, color: 'var(--ink-soft)', maxWidth: 440 }}>
          Your invoice to Guapd for {payableLabel}. The figures come from your agreed terms. TDS, if any, is deducted at payment.
        </span>
        <button type="button" className="neonbtn" onClick={submit} disabled={!ready}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 7, height: 42, padding: '0 18px', borderRadius: 11, border: 'none',
            background: ready ? 'var(--neon)' : 'var(--sec-2, #f5f5f0)', color: ready ? 'var(--ink)' : 'var(--ink-faint)',
            boxShadow: ready ? '0 8px 18px -12px rgba(40,45,25,.5), inset 0 1px 0 rgba(255,255,255,.7)' : 'none',
            fontFamily: 'var(--font-ui)', fontWeight: 800, fontSize: 12.5, cursor: ready ? 'pointer' : 'not-allowed', opacity: ready ? 1 : 0.7,
          }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><path d="M14 2v6h6" /></svg>
          {pending ? 'Raising…' : 'Confirm and raise invoice'}
        </button>
      </div>
      {error && <p role="alert" style={{ margin: 0, fontSize: 12.5, color: '#9C4147' }}>{error}</p>}
    </div>
  )
}

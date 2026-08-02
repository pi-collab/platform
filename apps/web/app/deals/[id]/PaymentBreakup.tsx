'use client'

import { useState } from 'react'

function formatRupees(paise: number): string {
  const rupees = paise / 100
  return `\u20B9${rupees.toLocaleString('en-IN')}`
}

interface Props {
  brandTotal: number
  dealTotal: number
  feePaise: number
  feePercent: number
  feeMode: string
  overage: number
  extraRevisions: number
}

export default function PaymentBreakup({ brandTotal, dealTotal, feePaise, feePercent, feeMode, overage, extraRevisions }: Props) {
  const [open, setOpen] = useState(false)
  const hasBreakup = feePaise > 0 || overage > 0

  return (
    <div style={{ margin: '24px -28px -26px', borderRadius: '0 0 20px 20px', background: 'var(--ink)', color: '#FFFFFF', overflow: 'hidden' }}>
      <button
        type="button"
        onClick={() => hasBreakup && setOpen(!open)}
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap',
          width: '100%', padding: '18px 28px', background: 'none', border: 'none', color: '#FFFFFF',
          cursor: hasBreakup ? 'pointer' : 'default', margin: 0,
        }}
      >
        <span style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 13.5, fontWeight: 700 }}>You pay</span>
          {hasBreakup && (
            <span style={{ display: 'inline-flex', transition: 'transform .16s ease', transform: `rotate(${open ? 180 : 0}deg)`, opacity: 0.6 }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><path d="m6 9 6 6 6-6" /></svg>
            </span>
          )}
        </span>
        <span style={{ fontFamily: 'var(--font-display)', fontWeight: 800, letterSpacing: '-0.035em', lineHeight: 1, fontSize: 34 }}>
          {formatRupees(brandTotal)}
        </span>
      </button>

      {open && (
        <div style={{ padding: '0 28px 18px', borderTop: '1px solid rgba(255,255,255,0.12)' }}>
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 20, padding: '12px 0 6px' }}>
            <span style={{ fontSize: 13, opacity: 0.7 }}>Deal total</span>
            <b style={{ fontSize: 14, fontWeight: 700 }}>{formatRupees(dealTotal)}</b>
          </div>
          {feePaise > 0 && (
            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 20, padding: '6px 0' }}>
              <span style={{ fontSize: 13, opacity: 0.7 }}>Platform fee ({feePercent}%)</span>
              <b style={{ fontSize: 14, fontWeight: 700 }}>{feeMode === 'deducted' ? `\u2212${formatRupees(feePaise)}` : `+${formatRupees(feePaise)}`}</b>
            </div>
          )}
          {overage > 0 && (
            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 20, padding: '6px 0' }}>
              <span style={{ fontSize: 13, opacity: 0.7 }}>{extraRevisions} extra revision{extraRevisions !== 1 ? 's' : ''}</span>
              <b style={{ fontSize: 14, fontWeight: 700 }}>+{formatRupees(overage)}</b>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

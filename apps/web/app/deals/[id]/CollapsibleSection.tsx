'use client'

import { useState } from 'react'

export default function CollapsibleSection({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(false)

  return (
    <div className="surface" style={{ padding: '22px 24px' }}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', width: '100%', background: 'none', border: 'none', cursor: 'pointer', padding: 0, textAlign: 'left' }}
      >
        <span style={{ display: 'flex', alignItems: 'baseline', gap: 12, flexWrap: 'wrap' }}>
          <span style={{ fontFamily: 'var(--font-display)', fontSize: 20, fontWeight: 700, letterSpacing: '-0.02em' }}>{title}</span>
          {subtitle && <span style={{ fontSize: 11.5, color: 'var(--ink-soft)' }}>{subtitle}</span>}
        </span>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7, fontSize: 12, fontWeight: 600, color: 'var(--ink-soft)' }}>
          {open ? 'Hide' : 'Show'}
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" style={{ transition: 'transform .16s ease', transform: `rotate(${open ? 180 : 0}deg)` }}><path d="m6 9 6 6 6-6" /></svg>
        </span>
      </button>
      {open && children}
    </div>
  )
}

'use client'

import { useState } from 'react'

interface BriefDetailsToggleProps {
  children: React.ReactNode
  label?: string
  subtitle?: string
  defaultOpen?: boolean
}

export default function BriefDetailsToggle({ children, label, subtitle, defaultOpen = false }: BriefDetailsToggleProps) {
  const [open, setOpen] = useState(defaultOpen)

  return (
    <div style={{ marginTop: 28, paddingTop: 24, borderTop: '1px solid var(--border-hairline)' }}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, width: '100%', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'var(--font-ui)', padding: 0, textAlign: 'left' }}
      >
        <span style={{ display: 'flex', alignItems: 'baseline', gap: 12, flexWrap: 'wrap' }}>
          <span style={{ fontFamily: 'var(--font-display)', fontSize: 16, fontWeight: 700, letterSpacing: '-0.015em', color: 'var(--ink)' }}>{label || 'More details'}</span>
          {subtitle && <span style={{ fontSize: 11.5, color: 'var(--ink-soft)' }}>{subtitle}</span>}
        </span>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7, fontSize: 12, fontWeight: 600, color: 'var(--ink-soft)', flexShrink: 0 }}>
          <span>{open ? 'View less' : 'View more'}</span>
          <span style={{ display: 'inline-flex', transition: 'transform .16s ease', transform: `rotate(${open ? 180 : 0}deg)` }}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="m6 9 6 6 6-6" /></svg>
          </span>
        </span>
      </button>
      {open && children}
    </div>
  )
}

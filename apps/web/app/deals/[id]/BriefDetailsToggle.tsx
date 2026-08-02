'use client'

import { useState } from 'react'

export default function BriefDetailsToggle({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false)

  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', marginTop: 26, paddingTop: 22, borderTop: '1px solid var(--border-hairline)' }}>
        <button
          type="button"
          onClick={() => setOpen(!open)}
          style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'var(--font-ui)', padding: 0 }}
        >
          <span style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--ink-soft)' }}>
            {open ? 'Hide more details' : 'View more details'}
          </span>
          <span style={{ display: 'inline-flex', color: 'var(--ink-soft)', transition: 'transform .16s ease', transform: `rotate(${open ? 180 : 0}deg)` }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><path d="m6 9 6 6 6-6" /></svg>
          </span>
        </button>
      </div>
      {open && children}
    </>
  )
}

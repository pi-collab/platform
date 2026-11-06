'use client'

import { useState, useTransition } from 'react'
import { setSearchVisibility } from './actions'

/**
 * Guapd AI search opt-in. Creators are hidden from brand search until they
 * switch this on. Saves as soon as it is toggled.
 */
export default function SearchVisibility({ optedInAt }: { optedInAt: string | null }) {
  const [on, setOn] = useState(optedInAt !== null)
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()

  const toggle = () => {
    const next = !on
    setOn(next); setError(null)
    start(async () => {
      const res = await setSearchVisibility(next)
      if (res.error) { setOn(!next); setError(res.error) }
    })
  }

  return (
    <div style={{ marginTop: 22, paddingTop: 22, borderTop: '1px solid var(--border-hairline)', display: 'flex', gap: 14, alignItems: 'flex-start' }}>
      <div style={{ flex: 1 }}>
        <div style={{ fontFamily: 'var(--font-ui)', fontWeight: 700, fontSize: 14 }}>Show me in Guapd AI search</div>
        <p style={{ margin: '4px 0 0', fontFamily: 'var(--font-ui)', fontSize: 13, color: 'var(--ink-faint)', lineHeight: 1.5 }}>
          Brands describe the creators they want and Guapd suggests matches. When this is on, you can be suggested.
        </p>
        <p style={{ margin: '6px 0 0', fontFamily: 'var(--font-ui)', fontSize: 13, color: 'var(--ink-soft)', lineHeight: 1.5 }}>
          <strong style={{ fontWeight: 600 }}>Brands see:</strong> your name, photo, handle, city, niches, and your numbers, marked verified if your Instagram is connected.
          <br />
          <strong style={{ fontWeight: 600 }}>Brands never see:</strong> your phone number or email.
        </p>
        {error && <p role="alert" style={{ margin: '6px 0 0', fontSize: 12.5, color: '#9A2B2B' }}>{error}</p>}
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={on}
        aria-label="Show me in Guapd AI search"
        disabled={pending}
        onClick={toggle}
        style={{
          flex: 'none', width: 46, height: 28, borderRadius: 999, border: 0, padding: 3, cursor: 'pointer',
          background: on ? 'var(--ink)' : 'var(--border-hairline)', transition: 'background 160ms',
          display: 'flex', justifyContent: on ? 'flex-end' : 'flex-start',
        }}
      >
        <span style={{ width: 22, height: 22, borderRadius: '50%', background: on ? 'var(--lime)' : '#fff', boxShadow: '0 1px 3px rgba(0,0,0,0.2)' }} />
      </button>
    </div>
  )
}

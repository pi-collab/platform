'use client'

import { useState, useTransition } from 'react'
import { setExperienceAccess } from './actions'

type Level = 'none' | 'operational' | 'financial'

/** One person's Guapd Experiences level: None, Operational, or Financial. */
export default function ExperienceAccessControl({ userId, level, disabled }: { userId: string; level: Level; disabled?: boolean }) {
  const [current, setCurrent] = useState<Level>(level)
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()

  const choose = (next: Level) => {
    if (next === current) return
    if (next === 'financial' && !window.confirm('Financial access shows this person the margin and P&L of every Experience. Grant it?')) return
    setError(null)
    start(async () => {
      const r = await setExperienceAccess(userId, next)
      if (r.ok) setCurrent(next)
      else setError(r.error)
    })
  }

  return (
    <div>
      <div role="radiogroup" aria-label="Experiences access" style={{ display: 'inline-flex', border: '1px solid #e5e5e5', borderRadius: 8, overflow: 'hidden', opacity: pending ? 0.6 : 1 }}>
        {(['none', 'operational', 'financial'] as const).map((l, i) => (
          <button key={l} type="button" role="radio" aria-checked={current === l} disabled={disabled || pending}
            onClick={() => choose(l)}
            style={{
              padding: '0.3rem 0.65rem', fontSize: '0.75rem', fontWeight: 600, cursor: disabled ? 'not-allowed' : 'pointer',
              border: 'none', borderLeft: i ? '1px solid #e5e5e5' : 'none',
              background: current === l ? (l === 'financial' ? '#fef3c7' : l === 'operational' ? '#f0fdf4' : '#f3f4f6') : '#fff',
              color: current === l ? '#111' : '#666',
            }}>
            {l === 'none' ? 'None' : l === 'operational' ? 'Operational' : 'Financial'}
          </button>
        ))}
      </div>
      {error && <div style={{ color: '#b91c1c', fontSize: '0.75rem', marginTop: 4 }}>{error}</div>}
    </div>
  )
}

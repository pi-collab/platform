'use client'

import { useState, useRef } from 'react'

interface PointsInputProps {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  maxPoints?: number
}

export default function PointsInput({ value, onChange, placeholder, maxPoints = 20 }: PointsInputProps) {
  const [draft, setDraft] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  const points = value ? value.split('\n').filter(Boolean) : []

  function addPoint() {
    const trimmed = draft.trim()
    if (!trimmed) return
    if (points.length >= maxPoints) return
    onChange([...points, trimmed].join('\n'))
    setDraft('')
    inputRef.current?.focus()
  }

  function removePoint(index: number) {
    onChange(points.filter((_, i) => i !== index).join('\n'))
  }

  return (
    <div>
      {points.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 12 }}>
          {points.map((point, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '9px 12px', borderRadius: 10, background: 'var(--sec-2, #F4F8FC)', border: '1px solid var(--hairline)' }}>
              <span style={{ width: 20, height: 20, borderRadius: 6, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 700, background: 'var(--ink)', color: '#FFFFFF', marginTop: 1 }}>{i + 1}</span>
              <span style={{ flex: 1, fontSize: 13, lineHeight: 1.5, color: 'var(--ink)' }}>{point}</span>
              <button
                type="button"
                onClick={() => removePoint(i)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 2, display: 'flex', color: 'var(--ink-faint)', flexShrink: 0 }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M18 6 6 18M6 6l12 12" /></svg>
              </button>
            </div>
          ))}
        </div>
      )}
      {points.length < maxPoints && (
        <div style={{ display: 'flex', gap: 8 }}>
          <input
            ref={inputRef}
            className="dinput"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addPoint() } }}
            placeholder={placeholder ?? 'Add a point\u2026'}
            style={{ flex: 1 }}
          />
          <button
            type="button"
            onClick={addPoint}
            disabled={!draft.trim()}
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              width: 40, height: 40, borderRadius: 10, border: '1px solid var(--hairline)',
              background: draft.trim() ? 'var(--ink)' : 'var(--card)',
              color: draft.trim() ? '#FFFFFF' : 'var(--ink-faint)',
              cursor: draft.trim() ? 'pointer' : 'default',
              transition: 'background .15s, color .15s',
            }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>
          </button>
        </div>
      )}
    </div>
  )
}

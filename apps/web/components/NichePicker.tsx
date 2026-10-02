'use client'

import { useState } from 'react'
import { NICHES, canonicalNiche } from '@/lib/niches'

/**
 * Pick niches from the canonical list, with Other as a typed escape hatch.
 *
 * Every form that asks a creator's niche uses this, so a brand filtering the
 * roster sees one vocabulary. Other is deliberate, not a gap: a list that
 * cannot describe somebody's work is how they end up writing their real niche
 * into their bio, where nothing can filter on it. What they type still goes
 * through canonicalNiche(), so "makeup" lands in Fashion / Beauty rather than
 * becoming a new bucket beside it.
 *
 * The storefront editor has its own rendering of the same control, drawn to
 * its design. Keep the two behaving alike.
 */
export default function NichePicker({
  value,
  onChange,
  max,
  inputStyle,
}: {
  value: string[]
  onChange: (next: string[]) => void
  max?: number
  inputStyle?: React.CSSProperties
}) {
  const [otherOpen, setOtherOpen] = useState(false)
  const [typed, setTyped] = useState('')
  const full = max != null && value.length >= max

  function add(raw: string) {
    const trimmed = raw.trim()
    if (!trimmed || full) return
    const v = canonicalNiche(trimmed) ?? trimmed
    if (!value.includes(v)) onChange([...value, v])
  }

  function addTyped() {
    add(typed)
    setTyped('')
    setOtherOpen(false)
  }

  return (
    <div>
      {value.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7, marginBottom: 10 }}>
          {value.map(n => (
            <span key={n} style={chosen}>
              {n}
              <button
                type="button"
                aria-label={`Remove ${n}`}
                onClick={() => onChange(value.filter(x => x !== n))}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--ink-faint, #888)', fontSize: 16, lineHeight: 1, padding: 0 }}
              >
                &times;
              </button>
            </span>
          ))}
        </div>
      )}

      {!full && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7 }}>
          {NICHES.filter(n => n !== 'Other' && !value.includes(n)).map(n => (
            <button key={n} type="button" onClick={() => add(n)} style={pick}>
              + {n}
            </button>
          ))}
          {!otherOpen && (
            <button type="button" onClick={() => setOtherOpen(true)} style={pick}>
              + Other
            </button>
          )}
        </div>
      )}

      {otherOpen && !full && (
        <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
          <input
            type="text"
            value={typed}
            onChange={e => setTyped(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addTyped() } }}
            placeholder="Name your niche"
            maxLength={30}
            autoFocus
            style={{ flex: 1, ...inputStyle }}
          />
          <button type="button" onClick={addTyped} disabled={!typed.trim()} style={{ ...pick, opacity: typed.trim() ? 1 : 0.4 }}>
            Add
          </button>
        </div>
      )}

      {max != null && (
        <div style={{ fontSize: 12, color: 'var(--ink-faint, #888)', marginTop: 8 }}>
          {full ? `That's ${max}, the most you can pick.` : `Pick up to ${max}. Brands filter by these.`}
        </div>
      )}
    </div>
  )
}

const chosen: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: 7,
  padding: '5px 11px', borderRadius: 999,
  background: '#FAFAF7', border: '1px solid var(--hairline, #e5e5e5)',
  fontSize: 13, fontWeight: 600, color: 'var(--ink, #111)',
}

const pick: React.CSSProperties = {
  padding: '5px 11px', borderRadius: 999,
  background: 'transparent', border: '1px dashed var(--hairline, #d5d5d5)',
  fontSize: 13, fontWeight: 500, color: 'var(--ink-soft, #555)', cursor: 'pointer',
}

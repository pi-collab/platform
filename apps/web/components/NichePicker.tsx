'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { NICHES, OTHER_NICHE, canonicalNiche } from '@/lib/niches'

/**
 * Pick niches from the canonical list, as a multi-select dropdown, with Other
 * as a typed escape hatch.
 *
 * Every form that asks a creator's niche uses this (settings, ops, the
 * storefront editor), so a brand filtering the roster sees one vocabulary.
 * It was 23 always-visible chips, which took more of the page than the rest of
 * the form; now the chosen ones are chips and the list lives in a panel.
 *
 * Drawn in FilterDropdown's shape — bordered field, floating white panel, a
 * tick on the active row — but black and white only, no neon (Palak's call),
 * so it reads as the same control family, but as a full-width form field with search, because 23 options is a
 * list you want to type into, not scroll.
 *
 * Other is deliberate, not a gap: a list that cannot describe somebody's work
 * is how they end up writing their real niche into their bio, where nothing can
 * filter on it. What they type still goes through canonicalNiche(), so "makeup"
 * lands in Beauty & Skincare rather than becoming a new bucket beside it.
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
  /** Extra style for the Other box, for callers with their own field look. */
  inputStyle?: React.CSSProperties
}) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [otherOpen, setOtherOpen] = useState(false)
  const [typed, setTyped] = useState('')
  const ref = useRef<HTMLDivElement>(null)
  const full = max != null && value.length >= max

  useEffect(() => {
    if (!open) return
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    // Escape closes, because a panel that only dismisses by clicking away traps
    // keyboard users.
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', onClick)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onClick)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const options = useMemo(() => {
    const q = query.trim().toLowerCase()
    return NICHES.filter(n => n !== OTHER_NICHE && (!q || n.toLowerCase().includes(q)))
  }, [query])

  function toggle(n: string) {
    if (value.includes(n)) onChange(value.filter(x => x !== n))
    else if (!full) onChange([...value, n])
  }

  function addTyped() {
    const trimmed = typed.trim()
    if (!trimmed || full) return
    const v = canonicalNiche(trimmed) ?? trimmed
    if (!value.includes(v)) onChange([...value, v])
    setTyped('')
    setOtherOpen(false)
  }

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      {/* The field. A div, not a button: it holds the chips' own remove
          buttons, and a button inside a button is invalid and misfires. */}
      <div
        onClick={() => setOpen(true)}
        style={{
          display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 6,
          minHeight: 46, padding: '6px 10px 6px 8px', borderRadius: 12,
          border: `1px solid ${open ? 'var(--ink, #181C24)' : '#D4D4CB'}`,
          background: 'var(--card, #fff)', cursor: 'pointer',
          boxShadow: open ? '0 0 0 3px rgba(24,28,36,.08)' : 'inset 0 1px 2px rgba(40,45,25,.04)',
          transition: 'box-shadow .15s, border-color .15s',
        }}
      >
        {value.map(n => (
          <span key={n} style={chip}>
            {n}
            <button
              type="button"
              aria-label={`Remove ${n}`}
              onClick={(e) => { e.stopPropagation(); onChange(value.filter(x => x !== n)) }}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--ink-soft, #4B5060)', fontSize: 15, lineHeight: 1, padding: 0 }}
            >
              &times;
            </button>
          </span>
        ))}
        <button
          type="button"
          aria-haspopup="listbox"
          aria-expanded={open}
          onClick={(e) => { e.stopPropagation(); setOpen(o => !o) }}
          style={{
            flex: 1, minWidth: 110, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8,
            background: 'none', border: 'none', padding: '6px 4px', cursor: 'pointer',
            fontFamily: 'var(--font-ui)', fontSize: 13.5, color: 'var(--ink-faint, #8B90A0)', textAlign: 'left',
          }}
        >
          <span>{value.length === 0 ? 'Select your niches' : full ? '' : 'Add more'}</span>
          <svg
            width="12" height="12" viewBox="0 0 24 24" fill="none"
            stroke="var(--ink-faint, #8B90A0)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"
            style={{ transition: 'transform .2s', transform: open ? 'rotate(180deg)' : 'none', flexShrink: 0 }}
            aria-hidden="true"
          >
            <path d="m6 9 6 6 6-6" />
          </svg>
        </button>
      </div>

      {open && (
        <div
          style={{
            position: 'absolute', top: 'calc(100% + 8px)', left: 0, right: 0, zIndex: 60,
            borderRadius: 14, border: '1px solid #EAEAE3', background: '#fff',
            boxShadow: '0 26px 52px -24px rgba(40,52,70,.5)',
            animation: 'fadeUp .16s cubic-bezier(.22,1,.36,1)', overflow: 'hidden',
          }}
        >
          <div style={{ padding: 8, borderBottom: '1px solid #F0F0EA' }}>
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search niches"
              aria-label="Search niches"
              style={{
                width: '100%', padding: '9px 11px', borderRadius: 10, border: '1px solid #EAEAE3',
                background: '#FAFAF7', fontFamily: 'var(--font-ui)', fontSize: 13.5, color: 'var(--ink, #181C24)', outline: 'none',
              }}
            />
          </div>

          <div role="listbox" aria-multiselectable="true" style={{ maxHeight: 280, overflowY: 'auto', padding: 6 }}>
            {options.length === 0 && (
              <div style={{ padding: '10px 11px', fontSize: 13, color: 'var(--ink-faint, #8B90A0)' }}>
                Not on the list. Use Other below to add it.
              </div>
            )}
            {options.map(n => {
              const active = value.includes(n)
              const disabled = !active && full
              return (
                <button
                  key={n}
                  type="button"
                  role="option"
                  aria-selected={active}
                  disabled={disabled}
                  onClick={() => toggle(n)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 10, width: '100%',
                    padding: '9px 11px', borderRadius: 10, border: 'none', textAlign: 'left',
                    fontFamily: 'var(--font-ui)', fontSize: 13.5, fontWeight: active ? 700 : 500,
                    color: 'var(--ink, #181C24)',
                    background: active ? '#F4F4F1' : 'transparent',
                    cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.4 : 1,
                  }}
                >
                  <span style={box(active)} aria-hidden="true">
                    {active && (
                      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>
                    )}
                  </span>
                  {n}
                </button>
              )
            })}
          </div>

          <div style={{ borderTop: '1px solid #F0F0EA', padding: 8 }}>
            {otherOpen ? (
              <div style={{ display: 'flex', gap: 8 }}>
                <input
                  autoFocus
                  value={typed}
                  onChange={(e) => setTyped(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addTyped() } }}
                  placeholder="Name your niche"
                  aria-label="Name your niche"
                  maxLength={30}
                  style={{ flex: 1, minWidth: 0, padding: '9px 11px', borderRadius: 10, border: '1px solid #EAEAE3', fontSize: 13.5, ...inputStyle }}
                />
                <button
                  type="button" onClick={addTyped} disabled={!typed.trim() || full}
                  style={{
                    padding: '0 16px', borderRadius: 999, border: 'none', flexShrink: 0,
                    background: 'var(--ink, #181C24)', color: '#fff', fontFamily: 'var(--font-ui)', fontWeight: 700, fontSize: 12.5,
                    cursor: typed.trim() && !full ? 'pointer' : 'not-allowed', opacity: typed.trim() && !full ? 1 : 0.4,
                  }}
                >
                  Add
                </button>
              </div>
            ) : (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                <button
                  type="button"
                  disabled={full}
                  onClick={() => setOtherOpen(true)}
                  style={{
                    background: 'none', border: 'none', padding: '6px 4px',
                    fontFamily: 'var(--font-ui)', fontSize: 13, fontWeight: 600,
                    color: 'var(--ink, #181C24)', cursor: full ? 'not-allowed' : 'pointer', opacity: full ? 0.4 : 1,
                  }}
                >
                  + Other / Not listed
                </button>
                {max != null && (
                  <span style={{ fontSize: 12, color: full ? '#92400e' : 'var(--ink-faint, #8B90A0)' }}>
                    {value.length} of {max}{full ? ', the most you can pick' : ''}
                  </span>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {max != null && !open && (
        <div style={{ fontSize: 12, color: 'var(--ink-faint, #8B90A0)', marginTop: 6 }}>
          Pick up to {max}. Brands filter by these.
        </div>
      )}
    </div>
  )
}

const chip: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: 7,
  padding: '5px 10px 5px 12px', borderRadius: 999,
  background: '#fff', border: '1px solid var(--ink, #181C24)',
  fontFamily: 'var(--font-ui)', fontSize: 13, fontWeight: 600, color: 'var(--ink, #181C24)',
}

const box = (active: boolean): React.CSSProperties => ({
  width: 18, height: 18, borderRadius: 6, flexShrink: 0,
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
  border: active ? '1px solid var(--ink, #181C24)' : '1.5px solid #D4D4CB',
  background: active ? 'var(--ink, #181C24)' : '#fff',
})

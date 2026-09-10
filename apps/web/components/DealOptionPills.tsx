'use client'

/**
 * The deal builder's option pills.
 *
 * Reel type, boosting rights and a delivery date, as they are drawn on a
 * deliverable row in the offer builder. They lived inside DealForm, which meant
 * the campaign placement editor - the same decision, taken over several
 * creators at once - had its own smaller, plainer controls: bare selects and
 * 0.6rem buttons for choices the offer builder gives a proper control.
 *
 * One definition, so the two screens cannot drift and a brand meets the same
 * control wherever they set terms.
 */

import { useState, useRef, useEffect } from 'react'

const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'] as const
const DAY_LABELS = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'] as const


export function DatePill({ value, onChange, id, invalid = false }: { value: string; onChange: (v: string) => void; id?: string; invalid?: boolean }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  // Viewing month/year (defaults to selected date or today)
  const base = value ? new Date(value + 'T00:00:00') : new Date()
  const [viewYear, setViewYear] = useState(base.getFullYear())
  const [viewMonth, setViewMonth] = useState(base.getMonth())

  // Close on outside click
  useEffect(() => {
    if (!open) return
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [open])

  // Build calendar grid
  const firstDay = new Date(viewYear, viewMonth, 1)
  const startDow = (firstDay.getDay() + 6) % 7 // Monday = 0
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate()
  const prevMonthDays = new Date(viewYear, viewMonth, 0).getDate()

  const cells: { day: number; current: boolean; dateStr: string }[] = []
  // Previous month fill
  for (let i = startDow - 1; i >= 0; i--) {
    const d = prevMonthDays - i
    const m = viewMonth === 0 ? 11 : viewMonth - 1
    const y = viewMonth === 0 ? viewYear - 1 : viewYear
    cells.push({ day: d, current: false, dateStr: `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}` })
  }
  // Current month
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push({ day: d, current: true, dateStr: `${viewYear}-${String(viewMonth + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}` })
  }
  // Next month fill
  const remaining = 7 - (cells.length % 7)
  if (remaining < 7) {
    for (let d = 1; d <= remaining; d++) {
      const m = viewMonth === 11 ? 0 : viewMonth + 1
      const y = viewMonth === 11 ? viewYear + 1 : viewYear
      cells.push({ day: d, current: false, dateStr: `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}` })
    }
  }

  const todayStr = new Date().toISOString().split('T')[0]

  function prev() {
    if (viewMonth === 0) { setViewMonth(11); setViewYear(viewYear - 1) }
    else setViewMonth(viewMonth - 1)
  }
  function next() {
    if (viewMonth === 11) { setViewMonth(0); setViewYear(viewYear + 1) }
    else setViewMonth(viewMonth + 1)
  }

  const displayText = value
    ? new Date(value + 'T00:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })
    : null

  return (
    <div ref={ref} id={id} style={{ position: 'relative', display: 'inline-flex' }}>
      <button
        type="button"
        aria-invalid={invalid || undefined}
        onClick={() => {
          if (!open) {
            const b = value ? new Date(value + 'T00:00:00') : new Date()
            setViewYear(b.getFullYear())
            setViewMonth(b.getMonth())
          }
          setOpen(!open)
        }}
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 7, height: 27,
          padding: '0 10px', borderRadius: 8,
          background: invalid ? '#fef2f2' : 'var(--sec, #F4F8FC)',
          /* Solid red at full weight when it is the thing being asked for —
             a dashed hairline reads as "optional", which is what it looked
             like right up until it blocked the submit. */
          border: invalid ? '1px solid #dc2626' : value ? '1px solid transparent' : '1px dashed var(--border-hairline)',
          boxShadow: invalid ? '0 0 0 3px rgba(220,38,38,.12)' : undefined,
          fontSize: 11.5, cursor: 'pointer', fontFamily: 'var(--font-ui)',
          color: invalid ? '#dc2626' : 'var(--ink)', whiteSpace: 'nowrap',
        }}
      >
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={invalid ? '#dc2626' : 'var(--ink-soft)'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" /><path d="M16 2v4M8 2v4M3 10h18" /></svg>
        <span style={{ color: invalid ? '#dc2626' : 'var(--ink-soft)', fontWeight: invalid ? 600 : 400 }}>Deliver by</span>
        {displayText && <b style={{ fontWeight: 700 }}>{displayText}</b>}
      </button>

      {open && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 6px)', left: 0, zIndex: 50,
          width: 280, padding: '14px 16px 12px',
          background: 'var(--card)', borderRadius: 16,
          border: '1px solid var(--hairline, #EAEAE3)',
          boxShadow: '0 4px 6px rgba(22,23,15,.04), 0 12px 28px rgba(22,23,15,.1), 0 32px 64px rgba(22,23,15,.06)',
          fontFamily: 'var(--font-ui)',
        }}>
          {/* Month nav */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <button type="button" onClick={prev} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 28, height: 28, borderRadius: 8, background: 'var(--sec, #F4F8FC)', border: 'none', cursor: 'pointer', color: 'var(--ink)' }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="m15 18-6-6 6-6" /></svg>
            </button>
            <span style={{ fontSize: 13.5, fontWeight: 700, letterSpacing: '-0.01em' }}>
              {MONTH_NAMES[viewMonth]} {viewYear}
            </span>
            <button type="button" onClick={next} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 28, height: 28, borderRadius: 8, background: 'var(--sec, #F4F8FC)', border: 'none', cursor: 'pointer', color: 'var(--ink)' }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="m9 18 6-6-6-6" /></svg>
            </button>
          </div>

          {/* Day-of-week headers */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 0, marginBottom: 4 }}>
            {DAY_LABELS.map((d) => (
              <span key={d} style={{ textAlign: 'center', fontSize: 10.5, fontWeight: 600, color: 'var(--ink-faint)', padding: '4px 0', letterSpacing: '0.04em' }}>{d}</span>
            ))}
          </div>

          {/* Day cells */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 2 }}>
            {cells.map((cell, i) => {
              const isSelected = cell.dateStr === value
              const isToday = cell.dateStr === todayStr
              return (
                <button
                  key={i}
                  type="button"
                  onClick={() => { onChange(cell.dateStr); setOpen(false) }}
                  style={{
                    width: '100%', aspectRatio: '1', display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 12.5, fontWeight: isSelected ? 800 : isToday ? 700 : 500,
                    fontFamily: 'var(--font-ui)',
                    borderRadius: 10, border: 'none', cursor: 'pointer',
                    background: isSelected ? 'var(--neon, #E8FF66)' : 'transparent',
                    color: !cell.current ? 'var(--ink-faint)' : isSelected ? 'var(--ink)' : 'var(--ink)',
                    opacity: cell.current ? 1 : 0.35,
                    outline: isToday && !isSelected ? '1.5px solid var(--border-hairline)' : 'none',
                    transition: 'background .12s',
                  }}
                  onMouseEnter={(e) => { if (!isSelected) (e.currentTarget as HTMLElement).style.background = 'var(--sec, #F4F8FC)' }}
                  onMouseLeave={(e) => { if (!isSelected) (e.currentTarget as HTMLElement).style.background = 'transparent' }}
                >
                  {cell.day}
                </button>
              )
            })}
          </div>

          {/* Footer: Today + Clear */}
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 10, paddingTop: 8, borderTop: '1px solid var(--border-hairline)' }}>
            <button type="button" onClick={() => { onChange(''); setOpen(false) }} style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--ink-soft)', background: 'none', border: 'none', cursor: 'pointer', padding: '2px 4px', fontFamily: 'var(--font-ui)' }}>Clear</button>
            <button type="button" onClick={() => { onChange(todayStr); setOpen(false) }} style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--ink)', background: 'none', border: 'none', cursor: 'pointer', padding: '2px 4px', fontFamily: 'var(--font-ui)' }}>Today</button>
          </div>
        </div>
      )}
    </div>
  )
}

/**
 * Boosting duration, in days.
 *
 * Presets cover what brands ask for; Custom turns the number into a field, so
 * "11 days" does not require a new preset. Capped at 999 — three digits is the
 * widest sensible campaign, and an uncapped box invites someone to type a year
 * into something that is multiplied by a daily rate.
 */
export function BoostingPill({ days, included, onChange }: {
  days: number | null
  included: boolean | null
  onChange: (days: number | null) => void
}) {
  const PRESETS = [7, 30, 90]
  const [custom, setCustom] = useState(false)
  const isCustom = custom || (included === true && days != null && days > 0 && !PRESETS.includes(days))

  const label = included === false
    ? 'Not included'
    : included === true && days ? `${days} days` : ''

  if (isCustom) {
    return (
      <span style={{
        display: 'inline-flex', alignItems: 'center', gap: 6, height: 27,
        padding: '0 10px', borderRadius: 999, background: 'var(--sec, #F1F4FA)',
        fontFamily: 'var(--font-ui)', fontSize: 11.5, fontWeight: 600,
      }}>
        <span style={{ color: 'var(--ink-soft)' }}>Boosting rights</span>
        <input
          type="text"
          inputMode="numeric"
          autoFocus
          aria-label="Boosting days"
          value={days ? String(days) : ''}
          onChange={(e) => {
            const digits = e.target.value.replace(/\D/g, '').replace(/^0+(?=\d)/, '').slice(0, 3)
            onChange(digits ? Number.parseInt(digits, 10) : null)
          }}
          style={{
            width: 34, height: 19, padding: '0 5px', borderRadius: 6,
            border: '1px solid var(--line, rgba(60,80,30,.16))', background: '#fff',
            fontFamily: 'var(--font-ui)', fontSize: 11.5, fontWeight: 700,
            color: 'var(--ink)', textAlign: 'center',
          }}
        />
        <span style={{ color: 'var(--ink-soft)' }}>days</span>
        <button
          type="button"
          onClick={() => { setCustom(false); onChange(null) }}
          aria-label="Back to preset durations"
          style={{ border: 'none', background: 'none', padding: 0, cursor: 'pointer', color: 'var(--ink-faint)', display: 'inline-flex' }}
        >
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round"><path d="M18 6 6 18M6 6l12 12" /></svg>
        </button>
      </span>
    )
  }

  return (
    <OptionPill
      label="Boosting rights"
      value={label}
      options={['7 days', '30 days', '90 days', 'Custom', 'Not included']}
      onChange={(v) => {
        if (v === 'Custom') { setCustom(true); onChange(null); return }
        if (v === 'Not included') { onChange(null); return }
        const n = Number.parseInt(v, 10)
        onChange(Number.isFinite(n) ? n : null)
      }}
    />
  )
}

export function OptionPill({ label, value, options, onChange }: { label: string; value: string; options: string[]; onChange: (v: string) => void }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7, height: 27, padding: '0 6px 0 10px', borderRadius: 8, background: 'var(--sec, #F4F8FC)', fontSize: 11.5, position: 'relative' }}>
      <span style={{ color: 'var(--ink-soft)' }}>{label}</span>
      {value && <b style={{ fontWeight: 700 }}>{value}</b>}
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--ink-soft)" strokeWidth="2.4" strokeLinecap="round"><path d="m6 9 6 6 6-6" /></svg>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        style={{ position: 'absolute', inset: 0, opacity: 0, cursor: 'pointer' }}
      >
        <option value="">Select...</option>
        {options.map((opt) => <option key={opt} value={opt}>{opt}</option>)}
      </select>
    </span>
  )
}

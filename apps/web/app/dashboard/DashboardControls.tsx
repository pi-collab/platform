'use client'

import { useState, useRef, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import type { Period } from './period-utils'

const PERIOD_OPTIONS: { value: Period; label: string }[] = [
  { value: 'this_year', label: 'This year' },
  { value: 'this_quarter', label: 'This quarter' },
  { value: 'this_month', label: 'This month' },
  { value: 'this_week', label: 'This week' },
  { value: 'custom', label: 'Custom' },
]

export function DateFilter({ basePath = '/dashboard' }: { basePath?: string } = {}) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const currentPeriod = (searchParams.get('period') as Period) || 'this_year'
  const [open, setOpen] = useState(false)
  const [showCustom, setShowCustom] = useState(currentPeriod === 'custom')
  const [customFrom, setCustomFrom] = useState(searchParams.get('from') || '')
  const [customTo, setCustomTo] = useState(searchParams.get('to') || '')
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [open])

  function navigate(period: Period, from?: string, to?: string) {
    const params = new URLSearchParams(searchParams.toString())
    params.set('period', period)
    if (period === 'custom' && from) params.set('from', from)
    else params.delete('from')
    if (period === 'custom' && to) params.set('to', to)
    else params.delete('to')
    router.push(`${basePath}?${params.toString()}`)
  }

  function handleSelect(period: Period) {
    if (period === 'custom') {
      setShowCustom(true)
      return
    }
    setShowCustom(false)
    setOpen(false)
    navigate(period)
  }

  function handleCustomApply() {
    if (customFrom && customTo) {
      setOpen(false)
      navigate('custom', customFrom, customTo)
    }
  }

  const currentLabel = currentPeriod === 'custom'
    ? (customFrom && customTo ? `${formatShortDate(customFrom)} – ${formatShortDate(customTo)}` : 'Custom')
    : PERIOD_OPTIONS.find((o) => o.value === currentPeriod)?.label ?? 'This year'

  return (
    <div ref={ref} style={{ position: 'relative', flexShrink: 0, zIndex: 40 }}>
      <button
        onClick={() => setOpen(!open)}
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 8,
          padding: '9px 14px', borderRadius: 12, border: '1px solid #D4D4CB',
          background: 'var(--card)', fontSize: '12.5px', fontWeight: 600,
          color: 'var(--ink)', cursor: 'pointer', fontFamily: 'inherit',
        }}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--wg-500)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" /><path d="M16 2v4M8 2v4M3 10h18" /></svg>
        {currentLabel}
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--ink-faint)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{ transition: 'transform .2s', transform: open ? 'rotate(180deg)' : 'rotate(0deg)' }}><path d="m6 9 6 6 6-6" /></svg>
      </button>

      {open && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 8px)', right: 0, zIndex: 50,
          minWidth: 220, borderRadius: 14,
          border: '1px solid #EAEAE3', background: '#fff',
          boxShadow: '0 26px 52px -24px rgba(40,52,70,.5)',
          padding: 6, animation: 'fadeUp .16s cubic-bezier(.22,1,.36,1)',
        }}>
          {PERIOD_OPTIONS.map((opt) => {
            const active = opt.value === currentPeriod && !(opt.value === 'custom' && !showCustom)
            return (
              <button
                key={opt.value}
                onClick={() => handleSelect(opt.value)}
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  width: '100%', padding: '9px 11px', borderRadius: 10,
                  fontFamily: 'var(--font-ui)', fontSize: 13,
                  fontWeight: active ? 700 : 500, color: 'var(--ink)',
                  background: active ? 'rgba(232,255,102,.28)' : 'transparent',
                  border: 'none', cursor: 'pointer', textAlign: 'left',
                }}
              >
                {opt.label}
                {active && (
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="var(--ink)" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>
                )}
              </button>
            )
          })}

          {showCustom && (
            <div style={{ padding: '10px 11px 6px', borderTop: '1px solid #EAEAE3', marginTop: 4 }}>
              <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
                <input
                  type="date"
                  value={customFrom}
                  onChange={(e) => setCustomFrom(e.target.value)}
                  style={dateInputStyle}
                />
                <input
                  type="date"
                  value={customTo}
                  onChange={(e) => setCustomTo(e.target.value)}
                  style={dateInputStyle}
                />
              </div>
              <button
                onClick={handleCustomApply}
                disabled={!customFrom || !customTo}
                style={{
                  width: '100%', padding: '8px 0', borderRadius: 8,
                  background: customFrom && customTo ? 'var(--neon)' : '#EAEAE3',
                  color: customFrom && customTo ? 'var(--ink)' : '#9EA096',
                  border: 'none', fontFamily: 'var(--font-ui)', fontSize: 12,
                  fontWeight: 700, cursor: customFrom && customTo ? 'pointer' : 'default',
                }}
              >
                Apply
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export function DashboardSearch() {
  const router = useRouter()
  const [query, setQuery] = useState('')
  const [focused, setFocused] = useState(false)

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const q = query.trim()
    if (!q) return
    // Route to deals search or browse depending on query
    router.push(`/deals?q=${encodeURIComponent(q)}`)
  }

  return (
    <form
      onSubmit={handleSubmit}
      style={{
        position: 'relative', zIndex: 1, display: 'flex', alignItems: 'center',
        gap: 14, marginTop: 28, padding: '14px 14px 14px 20px', borderRadius: 16,
        border: focused ? '1px solid var(--neon-deep)' : '1px solid #EAEAE3',
        background: 'var(--card)', transition: 'border-color .16s ease, box-shadow .16s ease',
        boxShadow: focused ? '0 0 0 4px rgba(218,254,12,.16)' : 'none',
      }}
    >
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#9EA096" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
        <circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" />
      </svg>
      <input
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        placeholder="Search creators, deals, campaigns..."
        style={{
          flex: 1, border: 'none', outline: 'none', background: 'transparent',
          fontFamily: 'var(--font-ui)', fontSize: 15, color: 'var(--ink)',
          caretColor: 'var(--ink)',
        }}
      />
      <button
        type="submit"
        style={{
          width: 42, height: 42, borderRadius: 12,
          background: 'var(--neon)', border: 'none', cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
        }}
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--ink)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M12 5l7 7-7 7" /></svg>
      </button>
    </form>
  )
}

function formatShortDate(dateStr: string): string {
  const d = new Date(dateStr)
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })
}

const dateInputStyle: React.CSSProperties = {
  flex: 1, padding: '6px 8px', borderRadius: 8,
  border: '1px solid #EAEAE3', background: '#F7F7F4',
  fontFamily: 'var(--font-ui)', fontSize: 12, color: 'var(--ink)',
  outline: 'none',
}

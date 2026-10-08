'use client'

import type React from 'react'

/**
 * One creator card in a pool grid: the Growth campaign pool and the Guapd
 * Experience creator pool render the same card. Transcribed from "Growth
 * Creator Pool"; the parts that differ by pool (which rate leads, an extra
 * panel, the button's words) are passed in.
 */
export interface PoolCardCreator {
  name: string
  handle: string
  photo: string | null
  niches: string[]
  followersLabel: string | null
  verified: boolean
  avgReachLabel: string | null
  engagementLabel: string | null
  interactionsLabel: string | null
}

export default function CreatorPoolCard({
  c, added, busy, disabled, rate, rateAction, extra, meta, button, buttonTitle, onToggle,
}: {
  c: PoolCardCreator
  added: boolean
  busy: boolean
  /** Cannot be toggled (e.g. doesn't sell the campaign's deliverable, or is locked). */
  disabled?: boolean
  /** The figure the card leads with, and what it is FOR. */
  rate: { paise: number | null; label: string }
  /** Sits at the end of the rate row (e.g. "View more"). */
  rateAction?: React.ReactNode
  /** Under the header (e.g. the full package list). */
  extra?: React.ReactNode
  /** A short line under the niches (e.g. track, place). */
  meta?: string | null
  /** Words on the button in each state. */
  button: { add: string; added: string; disabled?: string }
  buttonTitle?: string
  onToggle: () => void
}) {
  const initials = c.name.split(' ').map((w) => w[0]).slice(0, 2).join('').toUpperCase()

  return (
    <div className="ccard surface" style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 18 }}>
      <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start' }}>
        <div style={{ position: 'relative', width: 104, height: 104, flexShrink: 0, borderRadius: 14, background: 'var(--sec-2, #F7F4FB)', overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          {c.photo
            // eslint-disable-next-line @next/next/no-img-element
            ? <img src={c.photo} alt="" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />
            : <span style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 24, color: 'var(--ink-soft)' }}>{initials || '?'}</span>}
          {added && (
            <span style={{ position: 'absolute', bottom: 6, left: 6, display: 'inline-flex', alignItems: 'center', gap: 3, fontFamily: 'var(--font-ui)', fontSize: 9.5, fontWeight: 700, color: '#fff', background: 'rgba(24,28,36,.72)', borderRadius: 999, padding: '3px 8px' }}>
              <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>
              Added
            </span>
          )}
        </div>

        <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
            <span style={{ fontWeight: 700, fontSize: 15, color: 'var(--ink)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.name}</span>
            {/* Only a live Instagram connection earns this, the same rule the
                storefront follows. */}
            {c.verified && (
              <svg width="12" height="12" viewBox="0 0 24 24" style={{ flexShrink: 0 }} aria-label="Verified from Instagram">
                <circle cx="12" cy="12" r="10" fill="var(--neon-deep, #D2F04A)" />
                <path d="m7.5 12 2.8 2.8L16.5 8.6" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            )}
          </div>
          <div style={{ fontSize: 13, color: 'var(--ink)', marginTop: 3, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {c.handle}{c.followersLabel ? ` · ${c.followersLabel}` : ''}
          </div>
          <div style={{ fontSize: 11.5, color: 'var(--ink-faint)', marginTop: 4, lineHeight: 1.4 }}>
            {c.niches.join(' · ') || '—'}
          </div>
          {meta && <div style={{ fontSize: 11.5, color: 'var(--ink-soft)', marginTop: 3, lineHeight: 1.4 }}>{meta}</div>}
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginTop: 'auto', paddingTop: 8, flexWrap: 'wrap' }}>
            <span style={{ fontFamily: 'var(--font-num, var(--font-ui))', fontWeight: 700, fontSize: 15, color: 'var(--ink)' }}>
              {rate.paise != null ? inr(rate.paise) : '—'}
            </span>
            {/* Named, never a bare number. */}
            <span style={{ fontSize: 11, color: 'var(--ink-faint)' }}>{rate.label}</span>
            {rateAction}
          </div>
        </div>
      </div>

      {extra}

      {/* Three figures, and a dash where there is no measurement. A blank would
          read as zero, and a guess would read as verified. */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0,1fr))', padding: '12px 0', borderTop: '1px solid var(--border-hairline, #EAEAE3)', borderBottom: '1px solid var(--border-hairline, #EAEAE3)' }}>
        <PoolStat value={c.avgReachLabel} label="Avg reach" />
        <PoolStat value={c.engagementLabel} label="Engagement" divided />
        <PoolStat value={c.interactionsLabel} label="Interactions" divided />
      </div>

      <button
        type="button"
        onClick={onToggle}
        disabled={busy || disabled}
        className={added ? 'inkbtn' : 'addedbtn'}
        title={buttonTitle}
        style={{
          width: '100%', height: 38, borderRadius: 10, cursor: busy || disabled ? 'not-allowed' : 'pointer',
          fontFamily: 'var(--font-ui)', fontWeight: 700, fontSize: 12.5,
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
          background: added ? 'var(--ink)' : '#FFFFFF',
          color: added ? '#FFFFFF' : 'var(--ink)',
          border: added ? 'none' : '1.5px solid var(--border-hairline, #EAEAE3)',
          opacity: disabled ? 0.45 : 1,
        }}
      >
        {busy ? 'Working…' : disabled && button.disabled ? button.disabled : added ? (
          <>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>
            {button.added}
          </>
        ) : (
          <>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--ink)" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><path d="M12 5v14M5 12h14" /></svg>
            {button.add}
          </>
        )}
      </button>
    </div>
  )
}

export const inr = (paise: number) => '₹' + Math.round(paise / 100).toLocaleString('en-IN')

export function PoolStat({ value, label, divided }: { value: string | null; label: string; divided?: boolean }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 3, ...(divided ? { paddingLeft: 12, borderLeft: '1px solid var(--border-hairline, #EAEAE3)' } : {}) }}>
      <span style={{ fontFamily: 'var(--font-num, var(--font-ui))', fontWeight: 700, fontSize: 15, color: value ? 'var(--ink)' : 'var(--ink-faint)' }}>
        {value ?? '—'}
      </span>
      <span style={{ fontSize: 11, color: 'var(--ink-faint)' }}>{label}</span>
    </div>
  )
}

export function PoolSelect({ value, onChange, options, label }: {
  value: string; onChange: (v: string) => void; options: { value: string; label: string }[]; label?: string
}) {
  return (
    <select
      className="selctrl"
      aria-label={label}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      style={{
        minWidth: 0, boxSizing: 'border-box', padding: '8px 26px 8px 9px', flex: '1.5 1 180px',
        border: '1px solid var(--border-edge, rgba(24,28,36,.14))', borderRadius: 10, background: '#FFFFFF',
        fontFamily: 'var(--font-ui)', fontSize: 12.5, fontWeight: 600, color: 'var(--ink-soft)',
      }}
    >
      {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  )
}

'use client'

import { useState } from 'react'
import Link from 'next/link'

/**
 * Campaigns in motion: a list on the left, the selected one opened on the right.
 *
 * Transcribed from "Brand Dashboard". Selecting is local state rather than a
 * route change — the panel is a closer look at something already on screen, and
 * navigating away to see it would lose the list it was chosen from.
 */

export interface CampaignVM {
  id: string
  name: string
  /** Initials of the creators on it, in deal order. */
  creatorInitials: string[]
  creatorCount: number
  committedPaise: number
  deliverableCount: number
  startedOn: string
  /** "In review", "2 pending", "Your counter" — what it is waiting on. */
  stateLabel: string
  stateTone: 'review' | 'pending' | 'neutral'
}

const TONE: Record<CampaignVM['stateTone'], string> = {
  review: '#0F6B4A',
  pending: '#8C6417',
  neutral: 'var(--wg-500)',
}

const inr = (paise: number) => {
  const r = Math.round(paise / 100)
  if (r >= 100000) return '₹' + (r / 100000).toFixed(r % 100000 === 0 ? 0 : 1) + 'L'
  if (r >= 1000) return '₹' + Math.round(r / 1000) + 'K'
  return '₹' + r
}

export default function CampaignsInMotion({ campaigns }: { campaigns: CampaignVM[] }) {
  const [selectedId, setSelectedId] = useState(campaigns[0]?.id ?? null)
  const selected = campaigns.find((c) => c.id === selectedId) ?? campaigns[0]

  if (campaigns.length === 0) return null

  return (
    <section className="sr" style={{ marginTop: 'clamp(52px, 6vw, 80px)', borderRadius: 20, background: 'var(--card)', boxShadow: 'var(--sh-2)', overflow: 'hidden' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: 'clamp(24px,3vw,32px) clamp(24px,3vw,32px) 0' }}>
        <h2 style={{ fontFamily: 'var(--font-display)', fontWeight: 600, letterSpacing: '-0.02em', fontSize: 'clamp(23px,2.2vw,26px)', margin: 0 }}>
          Campaigns in motion
          <div aria-hidden="true" style={{ width: 40, height: 1, background: '#C9EB3C', marginTop: 16 }} />
        </h2>
        <Link href="/campaigns" style={{ fontFamily: 'var(--font-ui)', fontSize: 12, fontWeight: 600, color: 'var(--wg-600)', display: 'inline-flex', alignItems: 'center', gap: 5, textDecoration: 'none' }}>
          View all
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m9 18 6-6-6-6" /></svg>
        </Link>
      </div>

      <div className="cimgrid" style={{ display: 'grid', gridTemplateColumns: '1fr 1.2fr', marginTop: 20 }}>
        {/* ── The list ─────────────────────────────────────────────────── */}
        <div style={{ padding: '0 clamp(24px,3vw,32px) clamp(24px,3vw,32px)', borderRight: '1px solid rgba(24,28,36,.08)' }}>
          {campaigns.map((c) => {
            const on = c.id === selected?.id
            return (
              <button
                key={c.id}
                type="button"
                onClick={() => setSelectedId(c.id)}
                style={{
                  width: '100%', textAlign: 'left', border: 'none', cursor: 'pointer',
                  display: 'flex', alignItems: 'center', gap: 12, padding: 14, borderRadius: 12,
                  background: on ? '#F5F7FA' : 'transparent', marginBottom: 8,
                }}
              >
                <Stack initials={c.creatorInitials} ring={on ? '#F5F7FA' : '#fff'} size={26} />
                <span style={{ minWidth: 0 }}>
                  <span style={{ display: 'block', fontFamily: 'var(--font-ui)', fontWeight: 600, fontSize: 14, color: 'var(--ink)' }}>{c.name}</span>
                  <span style={{ display: 'block', fontSize: 11.5, color: TONE[c.stateTone], fontWeight: 600, marginTop: 2 }}>{c.stateLabel}</span>
                </span>
                <span style={{ marginLeft: 'auto', fontFamily: 'var(--font-ui)', fontWeight: 600, fontSize: 14, color: 'var(--ink)' }}>
                  {inr(c.committedPaise)}
                </span>
              </button>
            )
          })}
        </div>

        {/* ── The one you picked ───────────────────────────────────────── */}
        {selected && (
          <div style={{ padding: '0 clamp(24px,3vw,40px) clamp(24px,3vw,40px)' }}>
            <span style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '.08em', textTransform: 'uppercase', color: 'var(--wg-500)' }}>Selected</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 10, flexWrap: 'wrap' }}>
              <Link href={`/campaigns/${selected.id}`} style={{ fontFamily: 'var(--font-serif)', fontStyle: 'italic', fontWeight: 400, fontSize: 36, color: 'var(--ink)', textDecoration: 'none' }}>
                {selected.name}
              </Link>
              <Stack initials={selected.creatorInitials} ring="#fff" size={30} total={selected.creatorCount} />
            </div>
            <div style={{ fontFamily: 'var(--font-num, var(--font-ui))', fontWeight: 600, fontSize: 46, letterSpacing: '-0.03em', marginTop: 16, color: 'var(--ink)' }}>
              {inr(selected.committedPaise)}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginTop: 22, paddingTop: 22, borderTop: '1px solid rgba(24,28,36,.08)' }}>
              <div>
                <div style={{ fontSize: 10.5, fontWeight: 700, textTransform: 'uppercase', color: 'var(--wg-400)' }}>Deliverables</div>
                <div style={{ fontWeight: 600, fontSize: 15, marginTop: 4, color: 'var(--ink)' }}>
                  {selected.deliverableCount > 0
                    ? `${selected.deliverableCount} post${selected.deliverableCount === 1 ? '' : 's'}`
                    : '—'}
                </div>
              </div>
              <div>
                <div style={{ fontSize: 10.5, fontWeight: 700, textTransform: 'uppercase', color: 'var(--wg-400)' }}>Started on</div>
                <div style={{ fontWeight: 600, fontSize: 15, marginTop: 4, color: 'var(--ink)' }}>{selected.startedOn}</div>
              </div>
            </div>
          </div>
        )}
      </div>
    </section>
  )
}

/**
 * Overlapping creator avatars.
 *
 * The ring is the background they sit on, not white always: on the selected row
 * a white ring would draw a halo around each initial.
 */
function Stack({ initials, ring, size, total }: { initials: string[]; ring: string; size: number; total?: number }) {
  const shown = initials.slice(0, 2)
  const rest = (total ?? initials.length) - shown.length
  const base: React.CSSProperties = {
    width: size, height: size, borderRadius: '50%', background: 'var(--sec-2)',
    border: `2px solid ${ring}`, display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontFamily: 'var(--font-display)', fontWeight: 700, color: 'var(--wg-600)',
  }
  return (
    <span style={{ display: 'flex', flexShrink: 0 }}>
      {shown.map((t, i) => (
        <span key={i} style={{ ...base, fontSize: size * 0.38, marginLeft: i === 0 ? 0 : -(size / 3) }}>{t}</span>
      ))}
      {rest > 0 && (
        <span style={{ ...base, fontSize: size * 0.32, marginLeft: -(size / 3) }}>+{rest}</span>
      )}
    </span>
  )
}

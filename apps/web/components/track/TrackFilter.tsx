'use client'

import { TRACKS, TRACK_LABEL, TRACK_TONE, type Track } from '@/lib/track'

export type TrackFilterValue = Track | 'all'

/**
 * All / Deals / Growth, as chips.
 *
 * ── This is what a global mode switch would have been ───────────────────────
 * On /browse it does that job: a brand building a Growth campaign narrows to
 * Growth creators here rather than flipping the whole product into a mode. The
 * difference matters — a mode is a state you can forget you are in, and a
 * brand who forgets would wonder where half the roster went. A filter shows
 * its own state and defaults to showing everything.
 *
 * Same component on the campaigns list and the deals list, so the control is
 * learned once.
 */
export default function TrackFilter({
  value, onChange, counts,
}: {
  value: TrackFilterValue
  onChange: (v: TrackFilterValue) => void
  /** Optional per-track counts, e.g. { deals: 18, growth: 7 }. */
  counts?: Partial<Record<Track, number>>
}) {
  const total = counts ? (counts.deals ?? 0) + (counts.growth ?? 0) : undefined

  return (
    <div role="group" aria-label="Filter by track" style={{ display: 'inline-flex', gap: 6, flexWrap: 'wrap' }}>
      <Chip active={value === 'all'} onClick={() => onChange('all')} label="All" count={total} />
      {TRACKS.map((t) => (
        <Chip
          key={t}
          active={value === t}
          onClick={() => onChange(t)}
          label={TRACK_LABEL[t]}
          count={counts?.[t]}
          tone={TRACK_TONE[t]}
        />
      ))}
    </div>
  )
}

function Chip({
  active, onClick, label, count, tone,
}: {
  active: boolean
  onClick: () => void
  label: string
  count?: number
  tone?: { bg: string; fg: string; border: string }
}) {
  /* Active takes the track's own colour where it has one, so the chip you have
     pressed and the tags it is showing you are visibly the same thing. */
  const bg = active ? (tone?.bg ?? 'var(--ink, #181C24)') : 'transparent'
  const fg = active ? (tone?.fg ?? '#fff') : 'var(--wg-500, #6B7280)'
  const border = active ? (tone?.border ?? 'var(--ink, #181C24)') : 'rgba(24,28,36,.16)'

  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 5,
        padding: '6px 12px', borderRadius: 999, cursor: 'pointer',
        background: bg, color: fg, border: `1px solid ${border}`,
        fontFamily: 'var(--font-ui)', fontSize: 12.5, fontWeight: 700,
      }}
    >
      {label}
      {count != null && (
        <span style={{ opacity: 0.7, fontWeight: 600 }}>{count}</span>
      )}
    </button>
  )
}

'use client'

import { TRACK_LABEL, TRACK_TONE, type Track } from '@/lib/track'

/**
 * Which track a creator, campaign or deal belongs to.
 *
 * ── Shown, never inferred ───────────────────────────────────────────────────
 * There is deliberately no global Deals/Growth mode in the product — a brand
 * sees every creator and filters when they want to focus. That decision only
 * works if the track is legible on every row: without the tag, a brand looking
 * at a mixed list has no way to tell a ₹60,000 Deals creator from a ₹4,000
 * Growth one except by price, and the two are billed differently.
 *
 * One component, used on creator cards and rows, campaign cards and deal rows,
 * so the same thing looks the same everywhere. Colours come from lib/track,
 * which matches the indigo ops already uses for Growth.
 */
export default function TrackTag({ track, size = 'md' }: { track: Track | null; size?: 'sm' | 'md' }) {
  if (!track) return null

  const tone = TRACK_TONE[track]
  const small = size === 'sm'

  return (
    <span
      style={{
        display: 'inline-flex', alignItems: 'center', flexShrink: 0,
        padding: small ? '2px 7px' : '3px 9px',
        borderRadius: 999,
        fontFamily: 'var(--font-ui)',
        fontSize: small ? 10 : 11,
        fontWeight: 700,
        letterSpacing: '.01em',
        background: tone.bg,
        color: tone.fg,
        border: `1px solid ${tone.border}`,
        whiteSpace: 'nowrap',
      }}
    >
      {TRACK_LABEL[track]}
    </span>
  )
}

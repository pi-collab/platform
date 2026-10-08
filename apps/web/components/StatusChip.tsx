/**
 * THE status chip for Experience screens: a dot plus a label on a tinted pill.
 *
 * The shape and the maths are the brand deals table's pill (app/deals/
 * DealsTable.tsx, "Brand Deals"): the fill is the tint mixed 45% into white,
 * the border is the dot colour at ~19% alpha, the label is --wg-600. The tones
 * are that table's stage colours. Callers pass a tone, never raw colours, so
 * the palette lives here once.
 */
export type ChipTone = 'neutral' | 'grey' | 'blue' | 'violet' | 'green' | 'amber' | 'lime' | 'red'

const TONES: Record<ChipTone, { dot: string; bg: string }> = {
  neutral: { dot: '#8B90A0', bg: '#EEF1F5' },
  grey:    { dot: '#9AA08C', bg: '#F2F3EE' },
  blue:    { dot: '#4A7FB0', bg: '#E7F1FC' },
  violet:  { dot: '#7E6BC4', bg: '#F0EAFD' },
  green:   { dot: '#4C9E82', bg: '#E9F7F0' },
  amber:   { dot: '#C89A3C', bg: '#FCF6E4' },
  lime:    { dot: '#8FAF1F', bg: '#F4FBDC' },
  red:     { dot: '#C4494F', bg: '#FDF0F0' },
}

/** The dot colour for a tone, for places that show a status as a dot + label (the status board). */
export function toneDot(tone: ChipTone): string { return TONES[tone].dot }

function mixWithWhite(hex: string, tintPct: number): string {
  const n = parseInt(hex.slice(1), 16)
  const t = tintPct / 100
  const ch = (shift: number) => Math.round(((n >> shift) & 0xff) * t + 255 * (1 - t))
  return `rgb(${ch(16)}, ${ch(8)}, ${ch(0)})`
}

export default function StatusChip({ label, tone, width }: { label: string; tone: ChipTone; width?: number }) {
  const t = TONES[tone]
  return (
    <span style={{
      flexShrink: 0, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 7,
      width, padding: '6px 10px', borderRadius: 999,
      fontFamily: 'var(--font-ui)', fontSize: 11.5, fontWeight: 600, letterSpacing: '.01em',
      whiteSpace: 'nowrap',
      background: mixWithWhite(t.bg, 45),
      border: `1px solid ${t.dot}30`,
      color: 'var(--wg-600)',
    }}>
      <span style={{ width: 6, height: 6, borderRadius: '50%', flexShrink: 0, background: t.dot }} />
      {label}
    </span>
  )
}

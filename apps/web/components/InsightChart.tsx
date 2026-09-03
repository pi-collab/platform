import type { InsightPoint } from '@/lib/deal-post-insights'

/**
 * How a post's numbers grew.
 *
 * Inline SVG rather than a charting library: this is one line over a handful of
 * points, it renders on the server with no client JavaScript, and adding a
 * dependency to draw it would be a poor trade.
 *
 * ── The values are CUMULATIVE ───────────────────────────────────────────────
 * Instagram reports per-post insights as running totals. So the line is a
 * growth curve, not per-day figures, and it is labelled that way. Differencing
 * consecutive readings would look like daily numbers but would not be: the
 * refresh runs daily for a fortnight and then weekly, so one gap would be a day
 * and the next a week while sharing an axis.
 *
 * ── Why it hides below two points ───────────────────────────────────────────
 * One reading is a dot, and a chart of a dot invites a brand to read a trend
 * that is not there. Until a post has been refreshed at least once, the numbers
 * alone are the honest presentation.
 */

const METRICS: { key: keyof InsightPoint; label: string; colour: string }[] = [
  { key: 'views', label: 'Views', colour: 'var(--neon-deep, #7BA334)' },
  { key: 'reach', label: 'Reach', colour: '#4F46E5' },
  { key: 'totalInteractions', label: 'Interactions', colour: '#B4262A' },
]

export default function InsightChart({ history }: { history: InsightPoint[] }) {
  const series = METRICS.map((m) => ({
    ...m,
    points: history
      .map((p) => ({ at: p.at, value: p[m.key] as number | undefined }))
      .filter((p): p is { at: string; value: number } => typeof p.value === 'number'),
  })).filter((s) => s.points.length >= 2)

  if (series.length === 0) return null

  const W = 560
  const H = 132
  const PAD_L = 8
  const PAD_B = 20

  // One shared vertical scale, so the three lines are comparable against each
  // other rather than each filling the box and implying equal magnitude.
  const allValues = series.flatMap((s) => s.points.map((p) => p.value))
  const max = Math.max(...allValues, 1)

  const times = history.map((p) => new Date(p.at).getTime())
  const t0 = Math.min(...times)
  const t1 = Math.max(...times)
  const span = Math.max(1, t1 - t0)

  const x = (at: string) => PAD_L + ((new Date(at).getTime() - t0) / span) * (W - PAD_L * 2)
  const y = (v: number) => (H - PAD_B) - (v / max) * (H - PAD_B - 8)

  return (
    <figure style={{ margin: '14px 0 0' }}>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        width="100%"
        height={H}
        role="img"
        aria-label={`Growth over time. ${series.map((s) => `${s.label} reached ${s.points[s.points.length - 1].value}`).join('. ')}.`}
        style={{ display: 'block', overflow: 'visible' }}
      >
        {/* A baseline, so a flat line reads as flat rather than as missing. */}
        <line x1={PAD_L} y1={H - PAD_B} x2={W - PAD_L} y2={H - PAD_B} stroke="var(--hairline, rgba(24,28,36,.12))" strokeWidth="1" />

        {series.map((s) => (
          <g key={String(s.key)}>
            <polyline
              points={s.points.map((p) => `${x(p.at).toFixed(1)},${y(p.value).toFixed(1)}`).join(' ')}
              fill="none"
              stroke={s.colour}
              strokeWidth="2"
              strokeLinejoin="round"
              strokeLinecap="round"
            />
            {/* The latest reading, marked. It is the number shown above the
                chart, so the two should visibly be the same thing. */}
            <circle
              cx={x(s.points[s.points.length - 1].at)}
              cy={y(s.points[s.points.length - 1].value)}
              r="3"
              fill={s.colour}
            />
          </g>
        ))}

        <text x={PAD_L} y={H - 6} fontSize="10" fill="var(--ink-faint, #878D99)" fontFamily="var(--font-ui)">
          {shortDate(history[0].at)}
        </text>
        <text x={W - PAD_L} y={H - 6} fontSize="10" textAnchor="end" fill="var(--ink-faint, #878D99)" fontFamily="var(--font-ui)">
          {shortDate(history[history.length - 1].at)}
        </text>
      </svg>

      <figcaption style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 14px', marginTop: 8 }}>
        {series.map((s) => (
          <span key={String(s.key)} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontFamily: 'var(--font-ui)', fontSize: 11.5, color: 'var(--ink-faint)' }}>
            <span style={{ width: 9, height: 2, borderRadius: 2, background: s.colour }} />
            {s.label}
          </span>
        ))}
        <span style={{ fontFamily: 'var(--font-ui)', fontSize: 11, color: 'var(--ink-faint)', marginLeft: 'auto' }}>
          Running totals since posting &middot; {history.length} readings
        </span>
      </figcaption>
    </figure>
  )
}

function shortDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })
}

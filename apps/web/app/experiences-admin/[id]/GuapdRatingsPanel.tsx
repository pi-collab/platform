import type { ConsoleGuapdRatings } from '@/lib/experience-console-server'
import { card, kpiLabel } from '../ui'

/**
 * 0584: how the creators on this Experience rated Guapd, once paid. Private to
 * the Experiences staff; creators see only their own, the brand never sees it.
 */
export default function GuapdRatingsPanel({ data }: { data: ConsoleGuapdRatings }) {
  const rows = data.ratings
  const avg = rows.length ? rows.reduce((n, r) => n + Number(r.rating), 0) / rows.length : null
  const stars = (n: number) => '★'.repeat(n) + '☆'.repeat(5 - n)
  const day = (iso: string) => new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })
  return (
    <section className="surface" style={card}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <h2 className="sect-head">Creators rate Guapd</h2>
          <div className="sect-rule" />
        </div>
        <span style={{ ...kpiLabel, fontSize: 10.5 }}>
          {avg !== null ? `${avg.toFixed(1)} / 5 · ` : ''}{rows.length} of {data.paid_creators} paid creator{data.paid_creators === 1 ? '' : 's'} rated
        </span>
      </div>
      <p className="t-body" style={{ margin: '10px 0 0', fontSize: 13.5 }}>
        Once a creator is paid, their deal page asks how working with Guapd was. Only the team sees these.
      </p>
      <div style={{ marginTop: 14, display: 'grid', gap: 10 }}>
        {rows.length === 0 && <p className="t-body" style={{ margin: 0, color: 'var(--ink-soft)' }}>{data.paid_creators === 0 ? 'No creator has been paid yet.' : 'No ratings yet.'}</p>}
        {rows.map((r) => (
          <div key={r.deal_id} style={{ display: 'flex', justifyContent: 'space-between', gap: 12, padding: '10px 0', borderTop: '1px solid var(--border-hairline, #EAEAE3)' }}>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontFamily: 'var(--font-ui)', fontWeight: 700, fontSize: 13.5, color: 'var(--ink)' }}>{r.creator ?? 'Creator'}</div>
              {r.note && <div style={{ fontSize: 13, color: 'var(--ink-soft)', marginTop: 3, whiteSpace: 'pre-wrap' }}>“{r.note}”</div>}
            </div>
            <div style={{ textAlign: 'right', flexShrink: 0 }}>
              <div aria-label={`${r.rating} of 5`} style={{ fontSize: 15, letterSpacing: 1, color: 'var(--neon-deep)' }}>{stars(Number(r.rating))}</div>
              <div style={{ fontSize: 11.5, color: 'var(--ink-faint)', marginTop: 2 }}>{day(r.rated_at)}</div>
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}

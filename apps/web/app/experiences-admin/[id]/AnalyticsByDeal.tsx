import Link from 'next/link'
import { compactNumber } from '@/lib/compact-number'
import type { ConsolePerformancePost } from '@/lib/experience-console-server'

/**
 * 0577: the Experience's Analytics tab, one card per creator deal. Verified
 * numbers only (the same rule as every analytics screen); a deal's posts with
 * no numbers yet are counted so ops can chase them. Each card opens the deal's
 * own Analytics tab.
 */
export default function AnalyticsByDeal({ posts, waiting, names }: {
  posts: ConsolePerformancePost[]
  waiting: Record<string, number>
  /** Creator name per deal, for deals that have only waiting videos. */
  names: Record<string, string>
}) {
  const dealIds = Array.from(new Set([...posts.map((p) => p.deal_id), ...Object.keys(waiting)]))
  const rows = dealIds.map((dealId) => {
    const mine = posts.filter((p) => p.deal_id === dealId)
    const verified = mine.filter((p) => p.match_status === 'resolved' && p.metrics && Object.values(p.metrics).some((v) => typeof v === 'number'))
    const reach = verified.reduce((n, p) => n + (p.metrics?.reach ?? 0), 0)
    const views = verified.reduce((n, p) => n + (p.metrics?.views ?? 0), 0)
    const inter = verified.reduce((n, p) => n + (p.metrics?.totalInteractions ?? 0), 0)
    const unverified = mine.length - verified.length
    return {
      dealId, name: mine[0]?.creator_name ?? names[dealId] ?? 'Creator', posted: mine.length, verified: verified.length,
      unverified, waiting: waiting[dealId] ?? 0, reach, views, rate: reach > 0 ? (inter / reach) * 100 : null,
    }
  }).sort((a, b) => b.reach - a.reach || a.name.localeCompare(b.name))

  if (rows.length === 0) {
    return <p className="bx-perf-note">No collab videos have been sent to creators yet. Numbers appear here once a creator posts and adds the link.</p>
  }

  return (
    <div className="bx-perf-grid">
      {rows.map((r) => (
        <Link key={r.dealId} href={`/experiences-admin/deals/${r.dealId}?tab=analytics`} className="bx-perf-card bx-perf-deal" style={{ textDecoration: 'none', color: 'inherit', gridTemplateColumns: 'minmax(0, 1fr)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 10 }}>
            <span style={{ fontWeight: 700, fontSize: 14.5, color: 'var(--ink)' }}>{r.name}</span>
            <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink)' }}>Open →</span>
          </div>
          <div className="bx-perf-stats" style={{ gridTemplateColumns: 'repeat(3, minmax(0, 1fr))' }}>
            <Stat label="Reach" value={r.verified > 0 ? compactNumber(r.reach) : '—'} />
            <Stat label="Views" value={r.verified > 0 ? compactNumber(r.views) : '—'} />
            <Stat label="Engagement" value={r.rate != null ? `${r.rate.toFixed(1)}%` : '—'} />
          </div>
          <div style={{ fontSize: 12, color: 'var(--ink-soft)', marginTop: 8, lineHeight: 1.5 }}>
            {r.posted} posted{r.verified < r.posted ? ` · ${r.verified} verified` : ''}
            {r.unverified > 0 ? ` · ${r.unverified} without numbers yet` : ''}
            {r.waiting > 0 ? ` · ${r.waiting} waiting for a link` : ''}
          </div>
        </Link>
      ))}
    </div>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div style={{ fontWeight: 700, fontSize: 15, color: 'var(--ink)' }}>{value}</div>
      <div style={{ fontSize: 11, color: 'var(--ink-faint)' }}>{label}</div>
    </div>
  )
}

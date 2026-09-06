'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'

/**
 * Creator dashboard, mobile — built to "Creator Dashboard - Mobile Standalone".
 *
 * Renders below 720px; the existing desktop dashboard keeps everything above.
 * No new logic: every figure here is already computed by the page for desktop,
 * so a creator cannot see one number on a phone and a different one on a
 * laptop.
 *
 * ── Sections the mockup has that this does not ─────────────────────────────
 * TOP POSTS BY VIEWS. It needs per-post view counts, which come from a
 * connected Instagram account — and Instagram connection is still waiting on
 * Meta's App Review, so for every creator today the section would be an empty
 * ranked list. Drawn as nothing rather than as four blank rows.
 *
 * FOLLOWER COUNT beside the handle. Shown only when a social account actually
 * states one. The desktop page already refuses to invent this and the reason
 * holds here: a number a creator did not give us is one they will be asked
 * about by a brand.
 */

export interface MotionDeal {
  id: string
  title: string
  brandName: string
  status: string
  pricePaise: number
  /** Already-phrased line under the title, e.g. "Respond by 14 Aug". */
  meta: string | null
}

export interface ActionItem {
  id: string
  dealId: string
  title: string
  meta: string
  cta: string
}

export interface MonthPoint { label: string; amount: number }

function inrShort(paise: number): string {
  const r = Math.round(paise / 100)
  if (r >= 100000) { const v = r / 100000; return `₹${v % 1 === 0 ? v.toFixed(0) : v.toFixed(2).replace(/\.?0+$/, '')}L` }
  if (r >= 1000) return `₹${Math.round(r / 1000)}K`
  return `₹${r.toLocaleString('en-IN')}`
}

export default function CreatorDashboardMobile({
  firstName, handleLine, followersLabel, shopfrontSlug, period,
  totalEarnedPaise, dealCount, pendingPaise, activeCount, completedCount,
  paidCount, actions, motion, monthly, unreadNotifications = 0,
}: {
  firstName: string
  handleLine: string
  followersLabel: string | null
  shopfrontSlug: string | null
  period: string
  totalEarnedPaise: number
  dealCount: number
  pendingPaise: number
  activeCount: number
  completedCount: number
  paidCount: number
  actions: ActionItem[]
  motion: MotionDeal[]
  monthly: MonthPoint[]
  unreadNotifications?: number
}) {
  const router = useRouter()
  const peak = Math.max(1, ...monthly.map((m) => m.amount))

  return (
    <div className="cdash-m">
      <header className="cdash-m__head">
        <div style={{ minWidth: 0 }}>
          <h1 className="cdash-m__hi">
            Hey, <span className="cdash-m__hi-em">{firstName}</span>
          </h1>
          <div className="cdash-m__handle">
            {handleLine}{followersLabel && <> &middot; {followersLabel} followers</>}
          </div>
        </div>
        <div className="cdash-m__headactions">
          {shopfrontSlug && (
            <a href={`/c/${shopfrontSlug}`} target="_blank" rel="noopener noreferrer" className="cdash-m__pill">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" /><polyline points="15 3 21 3 21 9" /><line x1="10" y1="14" x2="21" y2="3" /></svg>
              Shopfront
            </a>
          )}
          <Link href="/creator/notifications?from=dashboard" className="cdash-m__bell" aria-label="Notifications">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
              <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.73 21a2 2 0 0 1-3.46 0" />
            </svg>
            {unreadNotifications > 0 && (
              <span className="mbell-badge" aria-label={`${unreadNotifications} unread`}>
                {unreadNotifications > 9 ? '9+' : unreadNotifications}
              </span>
            )}
          </Link>
        </div>
      </header>

      <div className="cdash-m__stack">
        {/* ── Overview ── */}
        <section className="cdash-m__card">
          <div className="cdash-m__cardhead">
            <span className="cdash-m__meta">Overview</span>
            {/* The period the whole screen is scoped to. A plain GET-style
                navigation, so the view is a shareable URL like everywhere else. */}
            <select
              className="cdash-m__period"
              value={period}
              onChange={(e) => router.push(`/creator/dashboard?period=${e.target.value}`)}
              aria-label="Period"
            >
              <option value="this_month">This month</option>
              <option value="this_quarter">Last 3 months</option>
              <option value="this_year">This year</option>
            </select>
          </div>

          <div className="cdash-m__kpis">
            <div className="cdash-m__kpi">
              <div className="cdash-m__meta">Total earned</div>
              <div className="cdash-m__figure tnum">{inrShort(totalEarnedPaise)}</div>
              <div className="cdash-m__meta">{dealCount} deal{dealCount === 1 ? '' : 's'}</div>
            </div>
            <div className="cdash-m__kpi cdash-m__kpi--right">
              <div className="cdash-m__meta">Pending</div>
              <div className="cdash-m__figure tnum">{inrShort(pendingPaise)}</div>
              <div className="cdash-m__meta">{pendingPaise > 0 ? 'Awaiting payment' : 'All caught up'}</div>
            </div>
            <div className="cdash-m__kpi cdash-m__kpi--top">
              <div className="cdash-m__meta">Active deals</div>
              <div className="cdash-m__figure tnum">{activeCount}</div>
              <div className="cdash-m__meta">In progress</div>
            </div>
            <div className="cdash-m__kpi cdash-m__kpi--top cdash-m__kpi--right">
              <div className="cdash-m__meta">Completed</div>
              <div className="cdash-m__figure tnum">{completedCount}</div>
              <div className="cdash-m__meta">
                {completedCount > 0 && paidCount === completedCount ? '100% paid out' : `${paidCount} paid out`}
              </div>
            </div>
          </div>
        </section>

        {/* ── Do first ── */}
        {actions.length > 0 && (
          <section>
            <div className="cdash-m__sechead">
              <span className="cdash-m__badge">Do first</span>
              <h2 className="cdash-m__h2">A few things need you</h2>
            </div>
            <div className="cdash-m__card cdash-m__card--flush">
              {actions.map((a) => (
                <Link key={a.id} href={`/creator/deals/${a.dealId}`} className="cdash-m__action">
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="cdash-m__actiontitle">{a.title}</div>
                    <div className="cdash-m__meta">{a.meta}</div>
                  </div>
                  <span className="cdash-m__cta">{a.cta}</span>
                </Link>
              ))}
            </div>
          </section>
        )}

        {/* ── Deals in motion ── */}
        {motion.length > 0 && (
          <section>
            <div className="cdash-m__sechead cdash-m__sechead--split">
              <h2 className="cdash-m__h2">Deals in motion</h2>
              <Link href="/creator/deals" className="cdash-m__viewall">View all</Link>
            </div>
            <div className="cdash-m__motion">
              {motion.map((d) => (
                <Link key={d.id} href={`/creator/deals/${d.id}`} className="cdash-m__deal">
                  <div className="cdash-m__dealtop">
                    <div style={{ minWidth: 0 }}>
                      <div className="cdash-m__brand">{d.brandName}</div>
                      <div className="cdash-m__meta">{d.status}</div>
                    </div>
                    <span className="cdash-m__price tnum">{inrShort(d.pricePaise)}</span>
                  </div>
                  <div className="cdash-m__dealfoot">
                    <span className="cdash-m__dealtitle">{d.title}</span>
                    {d.meta && <span className="cdash-m__meta">{d.meta}</span>}
                  </div>
                </Link>
              ))}
            </div>
          </section>
        )}

        {/* ── Performance ──
            Only drawn once there is something to draw. A chart of one month, or
            of nothing, is a shape that implies a trend it cannot support. */}
        {monthly.length >= 2 && (
          <section>
            <div className="cdash-m__sechead"><h2 className="cdash-m__h2">Performance</h2></div>
            <div className="cdash-m__card">
              <div className="cdash-m__chart" role="img" aria-label={`Earnings across ${monthly.length} months`}>
                {monthly.map((m) => (
                  <div key={m.label} className="cdash-m__bar">
                    <div className="cdash-m__barfill" style={{ height: `${Math.max(3, (m.amount / peak) * 100)}%` }} />
                    <span className="cdash-m__barlabel">{m.label}</span>
                  </div>
                ))}
              </div>
              <div className="cdash-m__chartfoot">
                <span className="cdash-m__meta">Best month</span>
                <span className="cdash-m__chartpeak tnum">{inrShort(peak)}</span>
              </div>
            </div>
          </section>
        )}
      </div>
    </div>
  )
}

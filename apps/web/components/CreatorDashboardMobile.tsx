'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'

/**
 * Creator dashboard, mobile — built to "Creator Dashboard - Mobile Standalone (1)".
 *
 * Renders below 720px; the desktop dashboard keeps everything above. Every
 * figure is computed by the page for desktop, so a creator cannot read one
 * number on a phone and another on a laptop.
 *
 * ── What is NOT here, and why ─────────────────────────────────────────────
 * TOP POSTS and YOUR REACH need per-post views, follower counts and engagement
 * from a connected Instagram account. That connection is still waiting on
 * Meta's App Review, so today the section would be four empty cards above three
 * dashes. Omitted rather than drawn hollow.
 *
 * THE CHANGE ARROWS (▲ 18%). Nothing computes a prior-period comparison. The
 * arrow is the most quotable thing on the screen and inventing it is worse than
 * leaving the space quiet.
 *
 * ON-TIME / RESPONSE / COMPLETION read "—". Nothing measures them. The desktop
 * dashboard prints 100% / ~4h / 100% as literals; that is not copied here.
 */

export interface MotionDeal {
  id: string
  brandName: string
  stageLabel: string
  /** Border tint for the stage chip, from the deal's own stage colour. */
  stageBorder: string
  /** 0–100. Derived from the stage, not decorative. */
  progress: number
  pricePaise: number
  title: string
  footLabel: string | null
  footValue: string | null
}

export interface ActionItem {
  id: string
  dealId: string
  title: string
  meta: string
  cta: string
}

export interface MonthPoint { label: string; amount: number }
export interface BrandRow { name: string; deals: number; posts: number; valuePaise: number; active: boolean }
export interface ReachPost { id: string; title: string; views: string; thumbUrl: string | null }
export interface Reach {
  followers: string
  engagement: string
  avgViews: string
  topPosts: ReachPost[]
}

export interface Earnings {
  allTimePaise: number
  thisMonthPaise: number
  last3MoPaise: number
  thisYearPaise: number
}

function inrShort(paise: number): string {
  const r = Math.round(paise / 100)
  if (r >= 100000) { const v = r / 100000; return `₹${v % 1 === 0 ? v.toFixed(0) : v.toFixed(2).replace(/\.?0+$/, '')}L` }
  if (r >= 1000) return `₹${Math.round(r / 1000)}K`
  return `₹${r.toLocaleString('en-IN')}`
}

/** Every section title carries the short lime rule. Its absence is most of why
 *  the first attempt read as generic. */
function Heading({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="cdash-m__h2">
      {children}
      <div className="cdash-m__secline" aria-hidden="true" />
    </h2>
  )
}

export default function CreatorDashboardMobile({
  firstName, handleLine, followersLabel, shopfrontSlug, period,
  totalEarnedPaise, dealCount, pendingPaise, activeCount, completedCount,
  paidCount, actions, motion, monthly, earnings, brands, reach, completedEver, track,
  changePct, unreadNotifications = 0,
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
  earnings: Earnings
  brands: BrandRow[]
  /** Null until Instagram is connected. Never stubbed with sample numbers. */
  reach: Reach | null
  completedEver: number
  /** Computed, never asserted. A dash means no basis yet, not zero. */
  track: { onTimePct: number | null; responseLabel: string; completionPct: number | null }
  /** Percent change against the previous window of the same length. Null when
   *  there is nothing to compare against — an arrow off a zero base is
   *  meaningless, and this is the most quotable number on the screen. */
  changePct: number | null
  unreadNotifications?: number
}) {
  const router = useRouter()

  return (
    <div className="cdash-m">
      <header className="cdash-m__head">
        <div style={{ minWidth: 0 }}>
          <h1 className="cdash-m__hi">
            Hey,{' '}
            <span className="cdash-m__hi-em">
              {firstName}
              <span className="cdash-m__hi-mark" aria-hidden="true" />
            </span>
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
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#12151C" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
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
        <section className="cdash-m__card" style={{ padding: 22 }}>
          <div className="cdash-m__cardhead">
            <span className="cdash-m__meta">Overview</span>
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
              <div className="cdash-m__meta">
                {dealCount} deal{dealCount === 1 ? '' : 's'}
                {changePct !== null && (
                  <> &middot; <span className="cdash-m__up">{changePct >= 0 ? '▲' : '▼'} {Math.abs(changePct)}%</span></>
                )}
              </div>
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
            <span className="cdash-m__badge">Do first</span>
            <div style={{ marginTop: 12 }}><Heading>A few things need you</Heading></div>
            <div className="cdash-m__card" style={{ marginTop: 16, padding: '6px 18px' }}>
              {actions.map((a) => (
                <Link key={a.id} href={`/creator/deals/${a.dealId}`} className="cdash-m__action">
                  <span className="cdash-m__actionicon" aria-hidden="true">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#12151C" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9" /><path d="M12 8v4l3 2" /></svg>
                  </span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="cdash-m__actiontitle">{a.title}</div>
                    <div className="cdash-m__actionmeta">{a.meta}</div>
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
            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
              <Heading>Deals in motion</Heading>
              <Link href="/creator/deals" className="cdash-m__viewall">View all</Link>
            </div>
            <div className="cdash-m__hscroll">
              {motion.map((d) => (
                <Link key={d.id} href={`/creator/deals/${d.id}`} className="cdash-m__card cdash-m__deal">
                  <div className="cdash-m__dealtop">
                    <span className="cdash-m__meta">{d.brandName}</span>
                    <span className="cdash-m__stagechip" style={{ border: `1px solid ${d.stageBorder}` }}>
                      {d.stageLabel}
                    </span>
                  </div>
                  <div className="cdash-m__dealfig tnum">{inrShort(d.pricePaise)}</div>
                  <div className="cdash-m__dealsub">{d.title}</div>
                  <div className="cdash-m__track">
                    <div className="cdash-m__trackfill" style={{ width: `${d.progress}%` }} />
                  </div>
                  {d.footLabel && (
                    <div className="cdash-m__dealfoot">{d.footLabel} <b>{d.footValue}</b></div>
                  )}
                </Link>
              ))}
            </div>
          </section>
        )}

        {/* ── Performance ──
            Always present, so the screen keeps its shape for a new creator.
            With fewer than two months there is no trend to draw, and a single
            point stretched across a grid implies one. */}
        <section className="cdash-m__card" style={{ padding: '20px 22px' }}>
          <Heading>Performance</Heading>
          {monthly.length >= 2
            ? <EarningsLine points={monthly} />
            : <p className="cdash-m__empty">Your earnings chart appears once you have been paid in two different months.</p>}
        </section>

        {/* ── Your reach ──
            Structure now, numbers when Instagram connects. Nothing here is
            invented: a follower count a creator did not give us is one they
            would screenshot and be asked about. */}
        <section className="cdash-m__card" style={{ padding: '20px 22px' }}>
          <Heading>Your reach</Heading>
          {reach ? (
            <>
              <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginTop: 18 }}>
                <span className="cdash-m__meta">Top posts</span>
                <span style={{ fontSize: 11.5, color: '#565C68' }}>by views</span>
              </div>
              <div className="cdash-m__hscroll">
                {reach.topPosts.map((post) => (
                  <div key={post.id} className="cdash-m__post">
                    <div className="cdash-m__postthumb">
                      {post.thumbUrl && <img src={post.thumbUrl} alt="" loading="lazy" />}
                    </div>
                    <div className="cdash-m__postbody">
                      <div className="cdash-m__posttitle">{post.title}</div>
                      <div className="cdash-m__meta">{post.views} views</div>
                    </div>
                  </div>
                ))}
              </div>
              <div className="cdash-m__three">
                <div>
                  <div className="cdash-m__meta">Followers</div>
                  <div className="cdash-m__threeval">{reach.followers}</div>
                </div>
                <div>
                  <div className="cdash-m__meta">Engagement</div>
                  <div className="cdash-m__threeval">{reach.engagement}</div>
                </div>
                <div>
                  <div className="cdash-m__meta">Avg views</div>
                  <div className="cdash-m__threeval">{reach.avgViews}</div>
                </div>
              </div>
            </>
          ) : (
            <p className="cdash-m__empty">
              Connect Instagram and your verified reach appears here &mdash; followers,
              engagement, average views and your best-performing posts.
            </p>
          )}
        </section>

        {/* ── Your earnings ── */}
        {earnings.allTimePaise > 0 && (
          <section>
            <Heading>Your earnings</Heading>
            <div className="cdash-m__card" style={{ marginTop: 16, padding: 22 }}>
              <span className="cdash-m__meta">Total earned &middot; all time</span>
              <div className="cdash-m__bigfig tnum" style={{ marginTop: 10 }}>{inrShort(earnings.allTimePaise)}</div>
              <div className="cdash-m__three">
                <div>
                  <div className="cdash-m__meta">This month</div>
                  <div className="cdash-m__threeval tnum">{inrShort(earnings.thisMonthPaise)}</div>
                </div>
                <div>
                  <div className="cdash-m__meta">Last 3 mo</div>
                  <div className="cdash-m__threeval tnum">{inrShort(earnings.last3MoPaise)}</div>
                </div>
                <div>
                  <div className="cdash-m__meta">This year</div>
                  <div className="cdash-m__threeval tnum">{inrShort(earnings.thisYearPaise)}</div>
                </div>
              </div>
            </div>
          </section>
        )}

        {/* ── Track record ── */}
        {completedEver > 0 && (
          <section>
            <Heading>Your track record</Heading>
            <div className="cdash-m__card" style={{ marginTop: 16, padding: 22 }}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                <div className="cdash-m__bigfig tnum" style={{ fontSize: 32 }}>{completedEver}</div>
                <div style={{ fontFamily: 'var(--font-ui)', fontSize: 13, color: '#565C68' }}>deals completed</div>
              </div>
              <div className="cdash-m__three">
                <div>
                  <div className="cdash-m__meta">On-time</div>
                  <div className="cdash-m__threeval cdash-m__threeval--strong">
                    {track.onTimePct === null ? '—' : `${track.onTimePct}%`}
                  </div>
                </div>
                <div>
                  <div className="cdash-m__meta">Response</div>
                  <div className="cdash-m__threeval cdash-m__threeval--strong">{track.responseLabel}</div>
                </div>
                <div>
                  <div className="cdash-m__meta">Completion</div>
                  <div className="cdash-m__threeval cdash-m__threeval--strong">
                    {track.completionPct === null ? '—' : `${track.completionPct}%`}
                  </div>
                </div>
              </div>
            </div>
          </section>
        )}

        {/* ── Brands ── */}
        {brands.length > 0 && (
          <section>
            <Heading>Brands you&rsquo;ve worked with</Heading>
            <div className="cdash-m__hscroll">
              {brands.map((b) => (
                <div key={b.name} className="cdash-m__card cdash-m__brandcard">
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span className="cdash-m__brandmark" aria-hidden="true">{b.name.slice(0, 1).toUpperCase()}</span>
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div className="cdash-m__brandname">{b.name}</div>
                      {b.active ? (
                        <span className="cdash-m__brandstate cdash-m__brandstate--active">
                          <span className="cdash-m__brandstate-dot" aria-hidden="true" />Active
                        </span>
                      ) : (
                        <span className="cdash-m__brandstate">Completed</span>
                      )}
                    </div>
                  </div>
                  <div className="cdash-m__brandfoot">
                    <div className="cdash-m__brandvalue tnum">{inrShort(b.valuePaise)}</div>
                    <div className="cdash-m__meta">
                      {b.deals} deal{b.deals === 1 ? '' : 's'}
                      {b.posts > 0 && <> &middot; {b.posts} post{b.posts === 1 ? '' : 's'}</>}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  )
}

/**
 * The earnings line, to the export's geometry: three gridlines, rupee labels
 * down the left, month labels beneath, and a neon dot on the final point.
 * Axis labels are derived from the peak rather than fixed at ₹0/20K/40K, or
 * the line would leave the grid on any creator earning more than the mockup.
 */
function EarningsLine({ points }: { points: MonthPoint[] }) {
  const TOP = 14, MID = 56, BOT = 98, L = 26, R = 310
  const peak = Math.max(1, ...points.map((p) => p.amount))
  const span = Math.max(1, points.length - 1)
  const xs = points.map((_, i) => 40 + i * ((300 - 40) / span))
  const ys = points.map((p) => BOT - (p.amount / peak) * (BOT - TOP))
  const line = xs.map((x, i) => `${x.toFixed(0)},${ys[i].toFixed(0)}`).join(' ')

  return (
    <svg viewBox="0 0 320 130" width="100%" style={{ display: 'block', marginTop: 12, overflow: 'visible', fontFamily: 'var(--font-ui)' }} role="img" aria-label="Earnings by month">
      <g stroke="rgba(26,27,22,.08)" strokeWidth="1">
        <line x1={L} y1={BOT} x2={R} y2={BOT} />
        <line x1={L} y1={MID} x2={R} y2={MID} />
        <line x1={L} y1={TOP} x2={R} y2={TOP} />
      </g>
      <g fill="#565C68" fontSize="9" fontWeight="600" textAnchor="end">
        <text x="22" y="101">₹0</text>
        <text x="22" y="59">{inrShort(peak / 2)}</text>
        <text x="22" y="17">{inrShort(peak)}</text>
      </g>
      <polyline points={line} fill="none" stroke="#12151C" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={xs[xs.length - 1]} cy={ys[ys.length - 1]} r="4.5" fill="#E8FF66" stroke="#12151C" strokeWidth="2" />
      <g fill="#565C68" fontSize="9" fontWeight="600" textAnchor="middle">
        {points.map((p, i) => <text key={p.label} x={xs[i]} y="115">{p.label}</text>)}
      </g>
    </svg>
  )
}

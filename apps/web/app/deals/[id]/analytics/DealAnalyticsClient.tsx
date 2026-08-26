'use client'

import { useState } from 'react'
import Link from 'next/link'

/* ──────────────────────────────────────────────────────────────────────────
   PLACEHOLDER / MOCK DATA
   Real data will come from the Meta Graph API (Instagram Insights)
   once the Meta app review + OAuth connect flow is built.
   See roadmap: "Meta APP + REVIEW" in docs/roadmap.md.
   ──────────────────────────────────────────────────────────────────────── */

interface DeliverableItem {
  id: string
  label: string
  platform: string
  type: 'reel' | 'story'
  liveDate: string
  postedUrl: string | null
  metrics: {
    primary: { label: string; value: string; subLabel: string }
    comparison: { value: string; direction: 'up' | 'down' }
    columns: { label: string; value: string }[]
  }
}

interface ChartDataPoint {
  x: number
  y: number
  label: string
}

interface CreatorBreakdown {
  id: string
  name: string
  avatarUrl: string | null
  isTop: boolean
  primaryMetric: { label: string; value: string }
  rows: { label: string; value: string }[]
}

interface DealAnalyticsProps {
  dealId: string
  dealRef: string | null
  postedDate: string | null
  brandName: string
  creatorName: string
  creatorId: string
  creatorAvatarUrl: string | null
  deliverables: DeliverableItem[]
  totalDeliverables: number
  totalValueFormatted: string
  chartData: {
    reel: { points: ChartDataPoint[]; benchmarkY: number; benchmarkLabel: string; yMax: number }
    story: { points: ChartDataPoint[]; benchmarkY: number; benchmarkLabel: string; yMax: number }
  }
  reelSummary: { heading: string; accentSpan: string }
  storySummary: { heading: string; accentSpan: string }
  isCampaign?: boolean
  campaignId?: string
  creatorBreakdowns?: {
    reel: CreatorBreakdown[]
    story: CreatorBreakdown[]
  }
}

/* ── Helpers ─────────────────────────────────────────────────────────── */

const META = {
  fontFamily: 'var(--font-ui)',
  fontWeight: 500,
  fontSize: '9.5px',
  lineHeight: '1.4',
  letterSpacing: '0.14em',
  textTransform: 'uppercase' as const,
  color: 'var(--ink-faint)',
}

const DISPLAY = {
  fontFamily: 'var(--font-display)',
  fontWeight: 800,
  letterSpacing: '-0.03em',
}

function formatDate(d: string | null) {
  if (!d) return '-'
  return new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
}

/* ── SVG Line Chart ──────────────────────────────────────────────────── */

function AreaChart({
  points,
  benchmarkY,
  benchmarkLabel,
  yMax,
  width = 680,
  height = 260,
}: {
  points: ChartDataPoint[]
  benchmarkY: number
  benchmarkLabel: string
  yMax: number
  width?: number
  height?: number
}) {
  const padL = 48
  const padR = 24
  const padT = 20
  const padB = 36
  const cw = width - padL - padR
  const ch = height - padT - padB

  const scaleX = (v: number) => padL + (v / (points.length - 1)) * cw
  const scaleY = (v: number) => padT + ch - (v / yMax) * ch

  const line = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${scaleX(i).toFixed(1)},${scaleY(p.y).toFixed(1)}`).join(' ')
  const area = `${line} L${scaleX(points.length - 1).toFixed(1)},${(padT + ch).toFixed(1)} L${scaleX(0).toFixed(1)},${(padT + ch).toFixed(1)} Z`
  const benchY = scaleY(benchmarkY)

  // Y-axis labels
  const yTicks = [0, Math.round(yMax * 0.25), Math.round(yMax * 0.5), Math.round(yMax * 0.75), yMax]
  const formatK = (n: number) => n >= 1000 ? `${Math.round(n / 1000)}K` : String(n)

  return (
    <svg viewBox={`0 0 ${width} ${height}`} style={{ width: '100%', height: 'auto', display: 'block' }}>
      {/* Y grid + labels */}
      {yTicks.map((t) => (
        <g key={t}>
          <line x1={padL} x2={width - padR} y1={scaleY(t)} y2={scaleY(t)} stroke="var(--hairline)" strokeWidth={1} />
          <text x={padL - 8} y={scaleY(t) + 4} textAnchor="end" style={{ fontSize: 10, fill: 'var(--ink-faint)', fontFamily: 'var(--font-ui)' }}>{formatK(t)}</text>
        </g>
      ))}
      {/* X labels */}
      {points.map((p, i) => (
        <text key={i} x={scaleX(i)} y={padT + ch + 22} textAnchor="middle" style={{ fontSize: 10, fill: 'var(--ink-faint)', fontFamily: 'var(--font-ui)' }}>{p.label}</text>
      ))}
      {/* Area fill */}
      <path d={area} fill="var(--sec)" opacity={0.6} />
      {/* Line */}
      <path d={line} fill="none" stroke="var(--ink)" strokeWidth={2} strokeLinejoin="round" />
      {/* Data points */}
      {points.map((p, i) => {
        const isLast = i === points.length - 1
        return (
          <circle
            key={i}
            cx={scaleX(i)}
            cy={scaleY(p.y)}
            r={isLast ? 6.5 : 3.5}
            fill={isLast ? 'var(--card, #fff)' : 'var(--ink)'}
            stroke={isLast ? 'var(--neon-deep)' : 'none'}
            strokeWidth={isLast ? 2.5 : 0}
          />
        )
      })}
      {/* Benchmark dashed line */}
      <line x1={padL} x2={width - padR} y1={benchY} y2={benchY} stroke="var(--ink-faint)" strokeWidth={1} strokeDasharray="6 4" />
      <text x={padL + 6} y={benchY - 8} style={{ fontSize: 9.5, fill: 'var(--ink-faint)', fontFamily: 'var(--font-ui)' }}>{benchmarkLabel}</text>
    </svg>
  )
}

/* ── Star Rating ─────────────────────────────────────────────────────── */

function StarRating({ rating, onRate }: { rating: number; onRate: (n: number) => void }) {
  const [hover, setHover] = useState(0)
  return (
    <div style={{ display: 'flex', gap: 4 }}>
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          onClick={() => onRate(n)}
          onMouseEnter={() => setHover(n)}
          onMouseLeave={() => setHover(0)}
          style={{
            background: 'none',
            border: 'none',
            padding: 2,
            cursor: 'pointer',
            fontSize: 32,
            color: n <= (hover || rating) ? 'var(--neon-deep)' : 'rgba(0,0,0,0.12)',
            transition: 'color 0.15s ease, transform 0.12s ease',
            transform: n <= hover ? 'scale(1.12)' : 'scale(1)',
          }}
          aria-label={`Rate ${n} star${n > 1 ? 's' : ''}`}
        >
          &#9733;
        </button>
      ))}
    </div>
  )
}

/* ── Main Component ──────────────────────────────────────────────────── */

export default function DealAnalyticsClient(props: DealAnalyticsProps) {
  const {
    dealId, dealRef, postedDate, brandName, creatorName, creatorId,
    creatorAvatarUrl, deliverables, totalDeliverables, totalValueFormatted,
    chartData, reelSummary, storySummary,
    isCampaign, campaignId, creatorBreakdowns,
  } = props

  const [activeTab, setActiveTab] = useState<'reel' | 'story'>('reel')
  const [starRating, setStarRating] = useState(0)
  const [reviewNote, setReviewNote] = useState('')
  const [reviewSubmitted, setReviewSubmitted] = useState(false)

  const backHref = isCampaign ? `/campaigns/${campaignId}` : `/deals/${dealId}`
  const backLabel = isCampaign ? 'Back to campaign' : 'Back to deal'

  const handleReviewSubmit = () => {
    // TODO: submit review via server action
    setReviewSubmitted(true)
  }

  return (
    <div style={{ maxWidth: 1080, margin: '0 auto', padding: 'clamp(18px,2.4vw,30px) clamp(22px,4vw,56px) clamp(56px,6vw,96px)', display: 'flex', flexDirection: 'column', gap: 22 }}>

      {/* ===== SECTION 1: Header Card ===== */}
      <div className="surface reveal" style={{ padding: '26px 28px', borderRadius: 20 }}>
        {/* Top row */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
          <Link href={backHref} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 600, color: 'var(--ink-soft)', textDecoration: 'none' }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6" /></svg>
            {backLabel}
          </Link>
          <span style={{ ...META, fontSize: '11px' }}>
            {dealRef ? `#${dealRef}` : ''}{postedDate ? ` \u00B7 posted ${formatDate(postedDate)}` : ''}
          </span>
        </div>

        {/* Title */}
        <h1 style={{ ...DISPLAY, fontSize: 'clamp(28px,3.8vw,38px)', lineHeight: 1.08, margin: '18px 0 0' }}>
          Deal analytics, {brandName} <span style={{ color: 'var(--neon-deep)' }}>&times; {creatorName}</span>
        </h1>

        {/* Bottom row */}
        <div style={{ borderTop: '1px solid var(--hairline)', marginTop: 20, paddingTop: 18, display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          {/* Share button */}
          <button
            type="button"
            style={{
              width: 40, height: 40, borderRadius: '50%', border: '1px solid var(--hairline)',
              background: 'var(--card, #fff)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
            }}
            aria-label="Share"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--ink-soft)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="18" cy="5" r="3" /><circle cx="6" cy="12" r="3" /><circle cx="18" cy="19" r="3" />
              <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" /><line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
            </svg>
          </button>
          {/* Download button */}
          <button
            type="button"
            style={{
              width: 40, height: 40, borderRadius: '50%', border: '1px solid var(--hairline)',
              background: 'var(--card, #fff)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
            }}
            aria-label="Download"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--ink-soft)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" />
            </svg>
          </button>
          {/* Re-engage button */}
          <Link
            href={`/deals/new?creator=${creatorId}`}
            style={{
              height: 42, borderRadius: 'var(--radius-pill)', background: 'var(--neon)',
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              padding: '0 22px', fontFamily: 'var(--font-ui)', fontWeight: 700, fontSize: 13,
              color: 'var(--ink)', textDecoration: 'none',
              boxShadow: '0 14px 26px -12px rgba(180,215,50,.7)',
              transition: 'box-shadow 0.22s, transform 0.18s',
            }}
          >
            Re-engage with {creatorName} &rarr;
          </Link>
        </div>
      </div>

      {/* ===== SECTION 2: How it is performing ===== */}
      <div className="surface reveal" style={{ padding: 22, borderRadius: 32 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', flexWrap: 'wrap', gap: 8, marginBottom: 18 }}>
          <h2 style={{ ...DISPLAY, fontSize: 20, margin: 0 }}>How it is performing</h2>
          <span style={META}>{totalDeliverables} delivered &middot; {totalValueFormatted}</span>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {deliverables.map((item) => (
            <div
              key={item.id}
              data-deliverable-card=""
              style={{
                borderRadius: 20, border: '1px solid var(--hairline)',
                boxShadow: '0 1px 2px rgba(22,23,15,.03), 0 8px 16px rgba(22,23,15,.04)',
                display: 'flex', gap: 0, overflow: 'hidden',
              }}
            >
              {/* Thumbnail placeholder */}
              <div style={{
                width: 160, minWidth: 160, aspectRatio: '9/16',
                borderRadius: '14px 0 0 14px',
                background: 'linear-gradient(135deg, var(--sec) 0%, var(--sec-mid) 50%, var(--sec-mid-2) 100%)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: 'var(--ink-faint)', fontSize: 11, fontWeight: 600,
              }}>
                {item.type === 'reel' ? 'Reel' : 'Story'}
              </div>

              {/* Content */}
              <div style={{ flex: 1, padding: '20px 22px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', minWidth: 0 }}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                    <span style={{ ...DISPLAY, fontSize: 14, fontWeight: 700 }}>{item.label}</span>
                    <span style={{ ...META, fontSize: '9px' }}>Live {formatDate(item.liveDate)}</span>
                  </div>
                  <div style={{ marginTop: 14 }}>
                    <div style={{ ...DISPLAY, fontSize: 36, lineHeight: 1 }}>{item.metrics.primary.value}</div>
                    <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--ink-soft)', marginTop: 4 }}>{item.metrics.primary.subLabel}</div>
                    <span style={{
                      display: 'inline-flex', alignItems: 'center', gap: 4,
                      marginTop: 8, padding: '3px 10px', borderRadius: 999,
                      fontSize: 11, fontWeight: 700,
                      background: item.metrics.comparison.direction === 'up' ? 'rgba(31,157,107,0.1)' : 'rgba(216,154,46,0.1)',
                      color: item.metrics.comparison.direction === 'up' ? 'var(--success)' : 'var(--warning)',
                    }}>
                      {item.metrics.comparison.direction === 'up' ? '\u25B2' : '\u25BC'} {item.metrics.comparison.value}
                    </span>
                  </div>
                </div>

                {/* Bottom metrics row */}
                <div style={{
                  display: 'grid', gridTemplateColumns: `repeat(${item.metrics.columns.length}, 1fr) auto`,
                  gap: 0, borderTop: '1px solid var(--hairline)', marginTop: 18, paddingTop: 14,
                  alignItems: 'end',
                }}>
                  {item.metrics.columns.map((col, i) => (
                    <div key={i} style={{ paddingRight: 16 }}>
                      <div style={META}>{col.label}</div>
                      <div style={{ ...DISPLAY, fontSize: 16, fontWeight: 700, marginTop: 4 }}>{col.value}</div>
                    </div>
                  ))}
                  {item.postedUrl && (
                    <a
                      href={item.postedUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{
                        fontSize: 12, fontWeight: 700, color: 'var(--ink-soft)',
                        textDecoration: 'none', whiteSpace: 'nowrap',
                      }}
                    >
                      View {item.type === 'reel' ? 'post' : 'story'} &rarr;
                    </a>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ===== SECTION 3: How this one measures up ===== */}
      <div className="surface reveal" style={{ padding: 22, borderRadius: 32 }}>
        <h2 style={{ ...DISPLAY, fontSize: 20, margin: '0 0 16px' }}>How this one measures up</h2>

        {/* Tab switcher */}
        <div style={{
          display: 'inline-flex', background: 'rgba(26,27,22,.05)', borderRadius: 999, padding: 4,
        }}>
          {(['reel', 'story'] as const).map((tab) => (
            <button
              key={tab}
              type="button"
              onClick={() => setActiveTab(tab)}
              style={{
                border: 'none', borderRadius: 999, padding: '7px 18px',
                fontFamily: 'var(--font-ui)', fontWeight: 600, fontSize: 13,
                cursor: 'pointer', transition: 'background 0.16s, color 0.16s',
                background: activeTab === tab ? 'var(--ink)' : 'transparent',
                color: activeTab === tab ? '#fff' : 'var(--ink-faint)',
              }}
            >
              Instagram {tab === 'reel' ? 'Reel' : 'Story'}
            </button>
          ))}
        </div>

        {/* Chart section */}
        <div style={{ marginTop: 24 }}>
          <div style={META}>01 &middot; Reach</div>
          <h3 style={{ ...DISPLAY, fontSize: 21, margin: '8px 0 18px' }}>
            {activeTab === 'reel'
              ? <>{reelSummary.heading} <span className="t-accent">{reelSummary.accentSpan}</span></>
              : <>{storySummary.heading} <span className="t-accent">{storySummary.accentSpan}</span></>
            }
          </h3>
          <AreaChart
            points={activeTab === 'reel' ? chartData.reel.points : chartData.story.points}
            benchmarkY={activeTab === 'reel' ? chartData.reel.benchmarkY : chartData.story.benchmarkY}
            benchmarkLabel={activeTab === 'reel' ? chartData.reel.benchmarkLabel : chartData.story.benchmarkLabel}
            yMax={activeTab === 'reel' ? chartData.reel.yMax : chartData.story.yMax}
          />
        </div>

        {/* Campaign-only: Full breakdown */}
        {isCampaign && creatorBreakdowns && (
          <div style={{ marginTop: 36 }}>
            <div style={META}>02 &middot; Full breakdown</div>
            <h3 style={{ ...DISPLAY, fontSize: 21, margin: '8px 0 20px' }}>
              Every metric, <span className="t-accent">creator by creator</span>
            </h3>

            <div
              data-breakdown-grid=""
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(4, 1fr)',
                gap: 24,
              }}
            >
              {(activeTab === 'reel' ? creatorBreakdowns.reel : creatorBreakdowns.story).map((cb) => (
                <div
                  key={cb.id}
                  style={{
                    borderRadius: 14, padding: '14px 10px',
                    display: 'flex', flexDirection: 'column', alignItems: 'center',
                    border: cb.isTop
                      ? '1.5px solid rgba(210,240,74,.55)'
                      : '1px solid var(--hairline)',
                    boxShadow: cb.isTop
                      ? '0 4px 16px rgba(210,240,74,.18), 0 8px 24px rgba(22,23,15,.06)'
                      : '0 1px 4px rgba(22,23,15,.04)',
                  }}
                >
                  {/* Avatar */}
                  <div style={{
                    width: 44, height: 44, borderRadius: '50%',
                    background: cb.avatarUrl
                      ? `url(${cb.avatarUrl}) center/cover`
                      : 'linear-gradient(135deg, var(--sec-mid), var(--sec-mid-2))',
                    marginBottom: 8,
                  }} />
                  <div style={{ fontFamily: 'var(--font-ui)', fontWeight: 700, fontSize: 13, color: 'var(--ink)', textAlign: 'center' }}>
                    {cb.name}
                  </div>
                  <div style={{ width: '80%', height: 1, background: 'var(--hairline)', margin: '10px 0' }} />
                  {/* Primary metric */}
                  <div style={{ ...DISPLAY, fontSize: 24, lineHeight: 1 }}>{cb.primaryMetric.value}</div>
                  <div style={{ fontSize: 10, fontWeight: 500, color: 'var(--ink-faint)', marginTop: 4 }}>{cb.primaryMetric.label}</div>
                  {/* Rows */}
                  <div style={{ width: '100%', marginTop: 10, display: 'flex', flexDirection: 'column', gap: 4 }}>
                    {cb.rows.map((row, i) => (
                      <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '2px 6px' }}>
                        <span style={{ fontSize: 11, color: 'var(--ink-faint)' }}>{row.label}</span>
                        <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink)' }}>{row.value}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* ===== SECTION 4: Review Card ===== */}
      <div className="surface reveal" style={{
        padding: '32px 22px', borderRadius: 20,
        display: 'flex', flexDirection: 'column', alignItems: 'center',
        maxWidth: 420, margin: '0 auto', width: '100%',
      }}>
        {/* Creator avatar */}
        <div style={{
          width: 44, height: 44, borderRadius: '50%',
          background: creatorAvatarUrl
            ? `url(${creatorAvatarUrl}) center/cover`
            : 'linear-gradient(135deg, var(--sec-mid), var(--sec-mid-2))',
        }} />

        <h3 style={{ ...DISPLAY, fontSize: 19, textAlign: 'center', margin: '14px 0 16px' }}>
          How was working with <span className="t-accent">{creatorName}</span>?
        </h3>

        {reviewSubmitted ? (
          <div style={{ textAlign: 'center', padding: '12px 0' }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--success)' }}>Thank you for your review!</div>
          </div>
        ) : (
          <>
            <StarRating rating={starRating} onRate={setStarRating} />

            <textarea
              value={reviewNote}
              onChange={(e) => setReviewNote(e.target.value)}
              placeholder="Add a note (optional)"
              rows={3}
              style={{
                width: '100%', marginTop: 16, padding: '12px 14px',
                borderRadius: 14, border: '1px solid var(--hairline)',
                fontFamily: 'var(--font-ui)', fontSize: 14,
                color: 'var(--ink)', resize: 'vertical', outline: 'none',
                transition: 'border-color 0.16s ease',
              }}
              onFocus={(e) => { e.currentTarget.style.borderColor = 'var(--neon-deep)' }}
              onBlur={(e) => { e.currentTarget.style.borderColor = 'var(--hairline)' }}
            />

            <button
              type="button"
              onClick={handleReviewSubmit}
              disabled={starRating === 0}
              style={{
                width: '100%', height: 48, marginTop: 16,
                borderRadius: 'var(--radius-pill)',
                background: starRating > 0 ? 'var(--ink)' : 'var(--hairline)',
                color: starRating > 0 ? '#fff' : 'var(--ink-faint)',
                border: 'none', fontFamily: 'var(--font-ui)',
                fontWeight: 800, fontSize: 14, cursor: starRating > 0 ? 'pointer' : 'not-allowed',
                transition: 'background 0.16s ease',
              }}
            >
              Submit review
            </button>
          </>
        )}
      </div>

      {/* ── Responsive overrides ── */}
      <style>{`
        @media (max-width: 700px) {
          /* Stack deliverable cards vertically on mobile */
          div[data-deliverable-card] {
            flex-direction: column !important;
          }
          div[data-deliverable-card] > div:first-child {
            width: 100% !important;
            min-width: unset !important;
            aspect-ratio: 16/9 !important;
            border-radius: 14px 14px 0 0 !important;
          }
          /* 2-column grid for creator breakdown */
          div[data-breakdown-grid] {
            grid-template-columns: repeat(2, 1fr) !important;
          }
        }
      `}</style>
    </div>
  )
}

/* ──────────────────────────────────────────────────────────────────────────
   Generate mock data for the analytics pages.
   Called from the server page.tsx to pass as props.
   ──────────────────────────────────────────────────────────────────────── */

export function generateMockAnalyticsData(opts: {
  dealId: string
  dealRef: string | null
  brandName: string
  creatorName: string
  creatorId: string
  creatorAvatarUrl: string | null
  postedDate: string | null
  postedUrl: string | null
  deliverableLabels: { label: string; platform: string }[]
}): Omit<DealAnalyticsProps, 'isCampaign' | 'campaignId' | 'creatorBreakdowns'> {
  const reelItems: DeliverableItem[] = []
  const storyItems: DeliverableItem[] = []

  // Build deliverable items from labels, alternating reel/story
  const labels = opts.deliverableLabels.length > 0
    ? opts.deliverableLabels
    : [{ label: 'Instagram Reel', platform: 'instagram' }, { label: 'Instagram Story', platform: 'instagram' }]

  labels.forEach((d, i) => {
    const isReel = d.label.toLowerCase().includes('reel') || (!d.label.toLowerCase().includes('story') && i % 2 === 0)
    const item: DeliverableItem = {
      id: `item-${i}`,
      label: d.label,
      platform: d.platform || 'instagram',
      type: isReel ? 'reel' : 'story',
      liveDate: opts.postedDate || '2026-08-05',
      postedUrl: opts.postedUrl,
      metrics: isReel
        ? {
            primary: { label: 'Engagement rate', value: '4.7%', subLabel: 'engagement rate' },
            comparison: { value: '1.2% vs your avg', direction: 'up' },
            columns: [
              { label: 'Reach', value: '368K' },
              { label: 'Likes', value: '12.4K' },
              { label: 'Comments', value: '842' },
              { label: 'Saves', value: '2.1K' },
            ],
          }
        : {
            primary: { label: 'Views', value: '184K', subLabel: 'views' },
            comparison: { value: '0.8% vs your avg', direction: 'down' },
            columns: [
              { label: 'Reach', value: '184K' },
              { label: 'Link taps', value: '3.2K' },
              { label: 'Replies', value: '127' },
              { label: 'Exits', value: '1.4K' },
            ],
          },
    }
    if (isReel) reelItems.push(item)
    else storyItems.push(item)
  })

  const allItems = [...reelItems, ...storyItems]

  return {
    dealId: opts.dealId,
    dealRef: opts.dealRef,
    postedDate: opts.postedDate,
    brandName: opts.brandName,
    creatorName: opts.creatorName,
    creatorId: opts.creatorId,
    creatorAvatarUrl: opts.creatorAvatarUrl,
    deliverables: allItems,
    totalDeliverables: allItems.length,
    totalValueFormatted: '\u20B960,000',
    chartData: {
      reel: {
        points: [
          { x: 0, y: 0, label: '0h' },
          { x: 1, y: 45000, label: '6h' },
          { x: 2, y: 120000, label: '12h' },
          { x: 3, y: 210000, label: '18h' },
          { x: 4, y: 290000, label: '24h' },
          { x: 5, y: 340000, label: '36h' },
          { x: 6, y: 368000, label: '48h' },
        ],
        benchmarkY: 150000,
        benchmarkLabel: 'Avg. reach other creators get with this brand \u00B7 150K',
        yMax: 400000,
      },
      story: {
        points: [
          { x: 0, y: 0, label: '0h' },
          { x: 1, y: 30000, label: '3h' },
          { x: 2, y: 85000, label: '6h' },
          { x: 3, y: 130000, label: '12h' },
          { x: 4, y: 165000, label: '18h' },
          { x: 5, y: 184000, label: '24h' },
        ],
        benchmarkY: 100000,
        benchmarkLabel: 'Avg. story reach other creators get with this brand \u00B7 100K',
        yMax: 200000,
      },
    },
    reelSummary: { heading: '368K reached in', accentSpan: '48 hours' },
    storySummary: { heading: '184K reached in', accentSpan: '24 hours' },
  }
}

export function generateMockCampaignBreakdowns(): {
  reel: CreatorBreakdown[]
  story: CreatorBreakdown[]
} {
  const mockCreators = [
    { id: 'c1', name: 'Ankit Sharma', isTop: true },
    { id: 'c2', name: 'Priya Mehta', isTop: false },
    { id: 'c3', name: 'Rohan Das', isTop: false },
    { id: 'c4', name: 'Sneha Iyer', isTop: false },
  ]

  return {
    reel: mockCreators.map((c) => ({
      id: c.id,
      name: c.name,
      avatarUrl: null,
      isTop: c.isTop,
      primaryMetric: { label: 'Engagement', value: c.isTop ? '5.2%' : `${(2 + Math.random() * 2).toFixed(1)}%` },
      rows: [
        { label: 'Reach', value: c.isTop ? '412K' : `${Math.round(100 + Math.random() * 200)}K` },
        { label: 'Likes', value: c.isTop ? '14.8K' : `${(2 + Math.random() * 8).toFixed(1)}K` },
        { label: 'Comments', value: c.isTop ? '1.2K' : `${Math.round(100 + Math.random() * 600)}` },
        { label: 'Saves', value: c.isTop ? '3.1K' : `${(0.5 + Math.random() * 2).toFixed(1)}K` },
      ],
    })),
    story: mockCreators.map((c) => ({
      id: c.id,
      name: c.name,
      avatarUrl: null,
      isTop: c.isTop,
      primaryMetric: { label: 'Views', value: c.isTop ? '220K' : `${Math.round(60 + Math.random() * 100)}K` },
      rows: [
        { label: 'Reach', value: c.isTop ? '220K' : `${Math.round(60 + Math.random() * 100)}K` },
        { label: 'Link taps', value: c.isTop ? '4.1K' : `${(0.5 + Math.random() * 2).toFixed(1)}K` },
        { label: 'Replies', value: c.isTop ? '189' : `${Math.round(20 + Math.random() * 100)}` },
        { label: 'Exits', value: c.isTop ? '1.8K' : `${(0.3 + Math.random() * 1.5).toFixed(1)}K` },
      ],
    })),
  }
}

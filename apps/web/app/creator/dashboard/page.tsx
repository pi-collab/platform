import { createClient } from '@/lib/supabase/server'
import { shouldAskOnboarding } from '@/lib/creator-onboarding'
import { verifyCreator } from '@/lib/creator-auth'
import Link from 'next/link'
import RealtimeDashboardListener from '@/components/RealtimeDashboardListener'
import { DateFilter } from '@/app/dashboard/DashboardControls'
import { periodToDateRange } from '@/app/dashboard/period-utils'
import type { Period } from '@/app/dashboard/period-utils'
import type { Metadata } from 'next'
import CreatorDashboardEmpty from './CreatorDashboardEmpty'
import { shouldShowCreatorApproved } from '@/lib/creator-approval'
import { redirect } from 'next/navigation'

export const metadata: Metadata = { title: 'Dashboard · Guapd Creator' }

interface InvoiceRow {
  deal_id: string
  status: string
  due_date: string | null
  creator_receives_paise: number
  paid_at: string | null
}

const VALID_PERIODS = new Set(['this_year', 'this_quarter', 'this_month', 'this_week', 'custom'])

export default async function CreatorDashboardPage({
  searchParams,
}: {
  searchParams: { period?: string; from?: string; to?: string }
}) {
  const { creatorId, creatorName } = await verifyCreator()

  // Newly-vetted creators see the approval screen once before the dashboard.
  // Checked here rather than in the layout: post-approval login lands on this
  // page, so it catches everyone without adding a query to every creator route.
  if (await shouldShowCreatorApproved(creatorId)) redirect('/signup/creator/approved')

  // Backstop for the CTA. Someone who closes the tab on the questions would
  // otherwise never see them again, and all three are required.
  if (await shouldAskOnboarding(creatorId)) redirect('/creator/welcome')
  const supabase = createClient()

  // Date range filtering
  const period = (searchParams.period && VALID_PERIODS.has(searchParams.period) ? searchParams.period : 'this_year') as Period
  const { from: periodFrom, to: periodTo } = periodToDateRange(period, searchParams.from, searchParams.to)
  const periodFromISO = periodFrom.toISOString()
  const periodToISO = periodTo.toISOString()

  const [{ data: deals }, { data: invoices }, { data: storefront }, { data: creatorRow }, { count: packageCount }] = await Promise.all([
    supabase
      .from('deals')
      .select('id, title, status, price_paise, last_offer_by, created_at, brands(id, name)')
      .neq('status', 'cancelled')
      .neq('status', 'declined')
      .gte('created_at', periodFromISO)
      .lte('created_at', periodToISO)
      .order('created_at', { ascending: false }),
    supabase
      .from('invoices')
      .select('deal_id, status, due_date, creator_receives_paise, paid_at'),
    supabase
      .from('creator_storefronts')
      .select('slug, is_published')
      .maybeSingle(),
    supabase
      .from('creators')
      .select('handle, social_accounts')
      .eq('id', creatorId)
      .maybeSingle(),
    // head + count: the checklist needs "any?", not the rows themselves.
    supabase
      .from('creator_products')
      .select('id', { count: 'exact', head: true })
      .eq('creator_id', creatorId)
      .eq('is_active', true),
  ])

  const allDeals = deals ?? []
  const rawInvoices = (invoices ?? []) as InvoiceRow[]

  // Scope invoices to only deals within the selected period
  const dealIds = new Set(allDeals.map(d => d.id))
  const allInvoices = rawInvoices.filter(inv => dealIds.has(inv.deal_id))

  const invoiceMap = new Map<string, InvoiceRow>()
  for (const inv of allInvoices) invoiceMap.set(inv.deal_id, inv)

  // ── NEEDS ATTENTION ──────────────────────────────────────
  const offersAwaiting = allDeals.filter(
    (d) => d.status === 'negotiating' && d.last_offer_by === 'brand'
  )
  const deliverablesToDo = allDeals.filter(
    (d) => d.status === 'agreed' || d.status === 'revision'
  )
  const invoicesToIssue = allDeals.filter(
    (d) => d.status === 'approved' && !invoiceMap.has(d.id)
  )

  // ── EARNINGS SUMMARY ─────────────────────────────────────
  const paidInvoices = allInvoices.filter((inv) => inv.status === 'paid')
  const totalEarned = paidInvoices.reduce((sum, inv) => sum + (inv.creator_receives_paise ?? 0), 0)
  const pendingAmount = allInvoices
    .filter((inv) => inv.status === 'accepted')
    .reduce((sum, inv) => sum + (inv.creator_receives_paise ?? 0), 0)

  const ACTIVE_STATUSES = new Set(['negotiating', 'agreed', 'delivered', 'revision', 'approved'])
  const COMPLETED_STATUSES = new Set(['complete', 'paid'])
  const activeDeals = allDeals.filter((d) => ACTIVE_STATUSES.has(d.status))
  const completedDeals = allDeals.filter((d) => COMPLETED_STATUSES.has(d.status))

  // ── DEALS IN FLIGHT (top 3 active)
  const dealsInFlight = activeDeals.slice(0, 3)

  // ── NEXT PAYOUT
  const nextPayoutInvoice = allInvoices.find((inv) => inv.status === 'accepted')
  const nextPayoutAmount = nextPayoutInvoice ? (nextPayoutInvoice.creator_receives_paise ?? 0) : 0

  // ── MONTHLY EARNINGS (for chart)
  const monthlyEarnings = computeMonthlyEarnings(paidInvoices)

  // ── BRAND AGGREGATION ────────────────────────────────────
  const brandAgg = new Map<string, { name: string; dealCount: number; earnedPaise: number; activePaise: number; hasActive: boolean; firstDealDate: string }>()
  for (const d of allDeals) {
    const raw = d.brands as unknown
    const b = Array.isArray(raw) ? raw[0] : (raw as { id: string; name: string } | null)
    if (!b) continue
    const inv = invoiceMap.get(d.id)
    const earned = inv?.status === 'paid' ? (inv.creator_receives_paise ?? 0) : 0
    const isActive = ACTIVE_STATUSES.has(d.status)
    const existing = brandAgg.get(b.id)
    if (existing) {
      existing.dealCount++
      existing.earnedPaise += earned
      if (isActive) { existing.activePaise += (d.price_paise ?? 0); existing.hasActive = true }
    } else {
      brandAgg.set(b.id, {
        name: b.name,
        dealCount: 1,
        earnedPaise: earned,
        activePaise: isActive ? (d.price_paise ?? 0) : 0,
        hasActive: isActive,
        firstDealDate: d.created_at,
      })
    }
  }
  const topBrands = Array.from(brandAgg.values())
    .sort((a, b) => b.dealCount - a.dealCount || b.earnedPaise - a.earnedPaise)
    .slice(0, 4)

  // ── First name for greeting
  const firstName = creatorName.split(' ')[0]

  // ── Nothing to show yet
  //
  // Counted WITHOUT the period filter. `deals` above is bounded by the selected
  // range, so a creator whose only deal was last year would otherwise be told
  // they have never had one — and be shown a first-run screen they have already
  // finished. The empty state is about the account, not the period.
  const { count: dealsEverCount } = await supabase
    .from('deals')
    .select('id', { count: 'exact', head: true })
    .neq('status', 'cancelled')
    .neq('status', 'declined')

  if ((dealsEverCount ?? 0) === 0) {
    // The handle line is drawn as "@handle · N followers" in the export. Only
    // what we actually know is shown: an invented follower count on a creator's
    // own dashboard is a number they will immediately know is wrong.
    const handle = (creatorRow?.handle ?? '').trim().replace(/^@/, '')
    const handleLine = handle ? `@${handle}` : 'Finish your profile to get discovered'
    return (
      <CreatorDashboardEmpty
        firstName={firstName}
        handleLine={handleLine}
        // Done when a social account carries a handle — the row exists from
        // signup, so its mere presence would mark the step complete before the
        // creator had done anything.
        hasSocials={Array.isArray(creatorRow?.social_accounts)
          && (creatorRow!.social_accounts as { handle?: string }[])
              .some((a) => typeof a?.handle === 'string' && a.handle.trim().length > 0)}
        hasPackages={(packageCount ?? 0) > 0}
        hasShopfront={Boolean(storefront)}
      />
    )
  }

  // ── Attention items
  const hasAttention = offersAwaiting.length > 0 || deliverablesToDo.length > 0 || invoicesToIssue.length > 0

  return (
    <div style={{ padding: 'clamp(20px, 3vw, 40px) clamp(18px, 4vw, 44px) clamp(56px, 6vw, 90px)' }}>
      <div style={{ maxWidth: 1080, margin: '0 auto' }}>
        <RealtimeDashboardListener />

        {/* ── HERO CARD ──────────────────────────────── */}
        <section className="neon-hover" style={heroCard}>
          <div style={{ position: 'relative', zIndex: 10, display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 24, flexWrap: 'wrap' }}>
            <div style={{ flex: '1 1 0%', minWidth: 240 }}>
              <span className="t-meta" style={{ display: 'inline-block', color: 'var(--meta)' }}>Welcome back</span>
              <h1 style={heroTitle}>
                Hey, <NameHighlight name={firstName} />.
              </h1>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 14, flexShrink: 0 }}>
              <DateFilter basePath="/creator/dashboard" />

              {/* Next payout card — always visible to prevent layout shift */}
              <div style={payoutCard}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
                  <span className="t-meta" style={{ color: 'var(--meta)' }}>Next payout</span>
                  <span style={{ fontFamily: 'var(--font-ui)', fontSize: 11, fontWeight: 600, color: 'var(--wg-600)', background: 'var(--paper-2)', borderRadius: 999, padding: '3px 10px' }}>
                    {nextPayoutAmount > 0 ? 'Pending' : 'None'}
                  </span>
                </div>
                <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 12, marginTop: 12 }}>
                  <div style={{ fontFamily: 'var(--font-ui)', fontWeight: 700, fontSize: 34, letterSpacing: '-0.045em', lineHeight: 0.9, color: 'var(--ink)' }}>{fmt(nextPayoutAmount)}</div>
                  <svg width="120" height="34" viewBox="0 0 92 28" fill="none" style={{ display: 'block', overflow: 'visible' }}>
                    <polyline points="2,22 10,21 18,23 26,18 34,19 42,15 50,16 58,12 66,13 74,9 82,10 90,5" stroke="var(--sec-ink)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                    <circle cx="90" cy="5" r="3" fill="var(--sec-ink)" stroke="var(--card)" strokeWidth="1.6" />
                  </svg>
                </div>
                {nextPayoutInvoice?.due_date ? (
                  <div className="t-meta" style={{ color: 'var(--meta)', marginTop: 8 }}>Due {new Date(nextPayoutInvoice.due_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}</div>
                ) : (
                  <div className="t-meta" style={{ color: 'var(--meta)', marginTop: 8 }}>No pending payouts</div>
                )}
              </div>
            </div>
          </div>

          {/* Action buttons */}
          <div style={{ position: 'relative', zIndex: 2, display: 'flex', gap: 12, flexWrap: 'wrap', marginTop: 22 }}>
            <Link href="/creator/storefront" className="ghost" style={ghostBtn}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20h9" /><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" /></svg>
              Edit your profile
            </Link>
            {storefront?.is_published ? (
              <Link href={`/c/${storefront.slug}`} className="neonbtn" style={neonBtn}>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M3 9h18l-1.5 11a2 2 0 0 1-2 2H6.5a2 2 0 0 1-2-2Z" /><path d="M3 9l2.5-5h13L21 9" /><path d="M9 13a3 3 0 0 0 6 0" /></svg>
                View your shopfront
              </Link>
            ) : (
              <Link href="/creator/storefront" className="neonbtn" style={neonBtn}>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M3 9h18l-1.5 11a2 2 0 0 1-2 2H6.5a2 2 0 0 1-2-2Z" /><path d="M3 9l2.5-5h13L21 9" /><path d="M9 13a3 3 0 0 0 6 0" /></svg>
                Set up your shopfront
              </Link>
            )}
          </div>

          {/* KPI Grid */}
          <div className="kpigrid" style={{ position: 'relative', zIndex: 2, marginTop: 24, borderRadius: 16, background: 'var(--card)', boxShadow: 'var(--sh-2)', overflow: 'hidden' }}>
            <KpiCell label="Total earned" value={fmt(totalEarned)} sub={`${completedDeals.length + paidInvoices.length} deals`} large />
            <KpiCell label="Pending" value={fmt(pendingAmount)} sub={pendingAmount === 0 ? 'All caught up' : 'Awaiting payment'} border />
            <KpiCell label="Active deals" value={String(activeDeals.length)} sub="In progress" border />
            <KpiCell label="Completed" value={String(completedDeals.length)} sub={completedDeals.length > 0 ? '100% paid out' : 'No deals yet'} border />
          </div>
        </section>

        {/* ── TICKER ──────────────────────────────────── */}
        <section style={{ position: 'relative', marginTop: 'clamp(28px, 3.2vw, 42px)', borderTop: '1px solid var(--line)', borderBottom: '1px solid var(--line)', padding: '12px 0', overflow: 'hidden', background: '#F7F7F4' }}>
          <div aria-hidden="true" style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 80, zIndex: 2, pointerEvents: 'none', background: 'linear-gradient(90deg,#F7F7F4,transparent)' }} />
          <div aria-hidden="true" style={{ position: 'absolute', right: 0, top: 0, bottom: 0, width: 80, zIndex: 2, pointerEvents: 'none', background: 'linear-gradient(270deg,#F7F7F4,transparent)' }} />
          <div className="mq">
            {Array.from({ length: 6 }).map((_, i) => (
              <TickerContent key={i} activeCount={activeDeals.length} totalEarned={totalEarned} completedCount={completedDeals.length} />
            ))}
          </div>
        </section>

        {/* ── DO FIRST (attention) ─────────────────────── */}
        {hasAttention && (
          <section className="neon-hover" style={{ position: 'relative', marginTop: 'clamp(28px, 3.2vw, 42px)', borderRadius: 16, background: 'var(--card)', boxShadow: 'var(--sh-2)', padding: 'clamp(24px, 3vw, 38px)' }}>
            <div style={{ marginBottom: 20 }}>
              <span style={doFirstBadge}>Do first</span>
              <h2 style={sectionHeading}>A few things need you<div aria-hidden="true" style={accentLine} /></h2>
            </div>
            <div>
              {offersAwaiting.length > 0 && (
                <AttentionRow
                  href="/creator/deals"
                  icon={<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--wg-700)" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z" /></svg>}
                  title={offersAwaiting.length === 1 ? 'New offer to review' : `${offersAwaiting.length} offers to review`}
                  sub="Awaiting you"
                  action="Review"
                />
              )}
              {deliverablesToDo.length > 0 && (
                <AttentionRow
                  href="/creator/deals"
                  icon={<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--wg-700)" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M12 16V4" /><path d="m6 10 6-6 6 6" /><path d="M4 20h16" /></svg>}
                  title={`${deliverablesToDo.length} deliverable${deliverablesToDo.length !== 1 ? 's' : ''} to submit`}
                  sub="Upload your draft"
                  action="Submit"
                  border
                />
              )}
              {invoicesToIssue.length > 0 && (
                <AttentionRow
                  href="/creator/deals"
                  icon={<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--wg-700)" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><path d="M14 2v6h6" /><path d="M9 13h6" /><path d="M9 17h4" /></svg>}
                  title={`${invoicesToIssue.length} invoice${invoicesToIssue.length !== 1 ? 's' : ''} to issue`}
                  sub="Send it to get paid faster"
                  action="Issue"
                  border
                />
              )}
            </div>
          </section>
        )}

        {/* ── DEALS IN MOTION ─────────────────────────── */}
        {dealsInFlight.length > 0 && (
          <section style={{ marginTop: 'clamp(52px, 6vw, 80px)' }}>
            <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 12, marginBottom: 24 }}>
              <h2 style={sectionHeading}>Deals in motion<div aria-hidden="true" style={accentLine} /></h2>
              <Link href="/creator/deals" style={viewAllLink}>View all<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m9 18 6-6-6-6" /></svg></Link>
            </div>
            <div className="g3">
              {dealsInFlight.map((d, i) => {
                const raw = d.brands as unknown
                const brand = Array.isArray(raw) ? raw[0] : (raw as { id: string; name: string } | null)
                const brandName = brand?.name ?? 'Brand'
                const brandInitial = brandName.charAt(0).toUpperCase()
                const isFirst = i === 0 && d.status === 'negotiating' && d.last_offer_by === 'brand'
                return (
                  <Link key={d.id} href={`/creator/deals/${d.id}`} className="dealcard" tabIndex={0} style={{
                    display: 'block', borderRadius: 20, background: 'var(--card)', overflow: 'hidden',
                    textDecoration: 'none',
                    border: isFirst ? '1.5px solid rgb(166,210,87)' : 'none',
                    boxShadow: isFirst ? 'rgba(40,45,25,0.22) 0px 20px 48px -30px' : 'var(--sh-2)',
                  }}>
                    <div style={{ background: 'transparent', padding: '20px 22px 0', display: 'flex', alignItems: 'center', gap: 13 }}>
                      <div style={{ position: 'relative', width: 40, height: 40, borderRadius: '50%', overflow: 'hidden', background: 'var(--sec-2)', flexShrink: 0 }}>
                        <span style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 16, color: 'var(--wg-500)' }}>{brandInitial}</span>
                      </div>
                      <span style={{ fontFamily: 'var(--font-ui)', fontWeight: 600, fontSize: 15, color: 'var(--ink)' }}>{brandName}</span>
                    </div>
                    <div style={{ padding: '26px 26px 30px' }}>
                      <div style={{ fontFamily: 'var(--font-ui)', fontWeight: 700, fontSize: 60, letterSpacing: '-0.045em', lineHeight: 1, color: 'var(--ink)' }}>{fmt(d.price_paise ?? 0)}</div>
                      <DealBreadcrumb status={d.status} />
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 14 }}>
                        <DealStatusLabel status={d.status} lastOfferBy={d.last_offer_by} />
                        <span className="dealgo" style={{ display: 'inline-flex', color: 'var(--ink)' }}>
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="m9 18 6-6-6-6" /></svg>
                        </span>
                      </div>
                    </div>
                  </Link>
                )
              })}
            </div>
          </section>
        )}

        {/* ── CHART + TRACK RECORD ────────────────────── */}
        <div className="ctgrid" style={{ marginTop: 'clamp(52px, 6vw, 80px)' }}>
          {/* Chart */}
          <section className="neon-hover" style={{ position: 'relative', overflow: 'hidden', borderRadius: 24, background: 'var(--card)', padding: 'clamp(14px, 1.6vw, 20px) clamp(18px, 2vw, 26px)', boxShadow: 'var(--sh-2)' }}>
            <div style={{ position: 'relative', display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap', marginBottom: 8 }}>
              <div>
                <h2 style={{ ...sectionHeading, margin: 0 }}>Your earnings<div aria-hidden="true" style={accentLine} /></h2>
                <div style={{ fontFamily: 'var(--font-ui)', fontSize: 12.5, color: 'var(--wg-500)', marginTop: 6 }}>Monthly earnings</div>
              </div>
              {monthlyEarnings.length > 0 && (
                <div style={{ textAlign: 'right' }}>
                  <div className="t-meta" style={{ color: 'var(--meta)' }}>Best month</div>
                  <div style={{ fontFamily: 'var(--font-ui)', fontWeight: 700, fontSize: 24, letterSpacing: '-0.045em', marginTop: 5 }}>
                    {fmt(Math.max(...monthlyEarnings.map(m => m.amount)))}
                    <span style={{ fontSize: 14, color: 'var(--wg-500)', fontWeight: 600 }}> · {monthlyEarnings.reduce((best, m) => m.amount > best.amount ? m : best, monthlyEarnings[0]).label}</span>
                  </div>
                </div>
              )}
            </div>
            <EarningsChart data={monthlyEarnings} />
          </section>

          {/* Track record */}
          <section className="neon-hover" style={{ position: 'relative', overflow: 'hidden', borderRadius: 20, background: 'var(--card)', padding: 'clamp(24px, 2.6vw, 34px)', boxShadow: 'var(--sh-2)', display: 'flex', alignItems: 'center' }}>
            <div aria-hidden="true" style={{ position: 'absolute', bottom: -120, left: '6%', width: 300, height: 300, borderRadius: '50%', background: 'radial-gradient(circle, rgba(232,255,102,0.07), transparent 68%)', pointerEvents: 'none' }} />
            <div style={{ position: 'relative', zIndex: 2, width: '100%' }}>
              <span className="t-meta" style={{ display: 'block', color: 'var(--meta)', marginBottom: 12 }}>Your track record</span>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
                <div style={{ fontFamily: 'var(--font-ui)', fontWeight: 700, fontSize: 'clamp(34px, 3.6vw, 44px)', letterSpacing: '-0.045em', lineHeight: 1 }}>{completedDeals.length}</div>
                <div style={{ fontFamily: 'var(--font-ui)', fontSize: 13, color: 'var(--wg-500)' }}>deals completed</div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 0, marginTop: 22 }}>
                <TrackRow label="On-time delivery" value={completedDeals.length > 0 ? '100%' : '—'} />
                <TrackRow label="Avg response" value={completedDeals.length > 0 ? '~4h' : '—'} />
                <TrackRow label="Completion rate" value={completedDeals.length > 0 ? '100%' : '—'} />
              </div>
            </div>
          </section>
        </div>

        {/* ── YOUR REACH ──────────────────────────────── */}
        <section className="neon-hover" style={{ marginTop: 'clamp(52px, 6vw, 80px)', borderRadius: 20, background: 'var(--card)', padding: 'clamp(24px, 3vw, 36px)', boxShadow: 'var(--sh-2)' }}>
          <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 12, marginBottom: 24 }}>
            <div>
              <h2 style={{ ...sectionHeading, margin: 0 }}>Your reach</h2>
              <div aria-hidden="true" style={accentLine} />
              <div style={{ fontFamily: 'var(--font-ui)', fontSize: 12.5, color: 'var(--wg-500)', marginTop: 12 }}>Coming soon</div>
            </div>
          </div>
          <div className="reachstat" style={{ border: '1px solid var(--line)', borderRadius: 16, overflow: 'hidden' }}>
            <ReachCell label="Followers" value="—" />
            <ReachCell label="Engagement" value="—" border />
            <ReachCell label="Avg views" value="—" border />
          </div>
        </section>

        {/* ── BRANDS YOU'VE WORKED WITH ───────────────── */}
        {topBrands.length > 0 && (
          <section style={{ marginTop: 'clamp(52px, 6vw, 80px)' }}>
            <h2 style={sectionHeading}>Brands you&apos;ve worked with<div aria-hidden="true" style={accentLine} /></h2>
            <div className="brandgrid" style={{ marginTop: 24 }}>
              {topBrands.map((brand) => {
                const initial = brand.name.charAt(0).toUpperCase()
                return (
                  <div key={brand.name} className="brandc" tabIndex={0} style={brandCardStyle}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                      <div style={{ position: 'relative', width: 40, height: 40, borderRadius: '50%', overflow: 'hidden', flexShrink: 0, background: 'var(--sec-2)' }}>
                        <span style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 16, color: 'var(--wg-500)' }}>{initial}</span>
                      </div>
                      <div style={{ minWidth: 0, flex: '1 1 0%' }}>
                        <div style={{ fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: 17, letterSpacing: 0 }}>{brand.name}</div>
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 10.5, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase' as const, color: brand.hasActive ? 'var(--lime-700)' : 'var(--wg-500)', marginTop: 5 }}>
                          <span style={{ width: 6, height: 6, borderRadius: '50%', background: brand.hasActive ? 'var(--lime-700)' : 'linear-gradient(90deg,var(--sec-mid),var(--sec-mid-2))' }} />
                          {brand.hasActive ? 'Active' : 'Completed'}
                        </span>
                      </div>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14, marginTop: 22, paddingTop: 20, borderTop: '1px solid var(--line)' }}>
                      <div>
                        <div style={brandStatNum}>{brand.hasActive ? fmt(brand.activePaise) : fmt(brand.earnedPaise)}</div>
                        <div className="t-meta" style={{ color: 'var(--meta)', marginTop: 6 }}>{brand.hasActive ? 'in progress' : 'earned'}</div>
                      </div>
                      <div>
                        <div style={brandStatNum}>{brand.dealCount}</div>
                        <div className="t-meta" style={{ color: 'var(--meta)', marginTop: 6 }}>deals</div>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          </section>
        )}

        {/* ── CTA BANNER ──────────────────────────────── */}
        <section style={{ marginTop: 'clamp(52px, 6vw, 80px)', position: 'relative', overflow: 'hidden', borderRadius: 32, background: 'linear-gradient(115deg,var(--sec) 0%,var(--sec-2) 26%,var(--card) 55%,#FCFDF6 100%)', minHeight: 300, display: 'flex', alignItems: 'center', padding: 'clamp(32px, 4vw, 60px)', boxShadow: 'var(--sh-2)' }}>
          <div className="brandmoment" style={{ position: 'relative', zIndex: 2 }}>
            <div>
              <h2 style={{ fontFamily: 'var(--font-display)', fontWeight: 700, letterSpacing: '-0.025em', lineHeight: 1, fontSize: 'clamp(38px, 4.8vw, 62px)', margin: 0, color: 'var(--ink)' }}>
                Brand–creator deals<br />without the <span style={{ fontFamily: 'var(--font-serif)', fontStyle: 'italic', fontWeight: 400, letterSpacing: 0, fontSize: '1.12em' }}>chaos</span>.
              </h2>
              <p style={{ fontFamily: 'var(--font-ui)', fontSize: 15, lineHeight: 1.6, color: 'var(--wg-600)', margin: '16px 0 0', maxWidth: 400 }}>
                One home for offers, contracts, content, and payments, so you can focus on making, not chasing.
              </p>
              {storefront?.is_published ? (
                <Link href={`/c/${storefront.slug}`} className="neonbtn" style={{ ...neonBtn, marginTop: 26 }}>
                  Share your shopfront
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m9 18 6-6-6-6" /></svg>
                </Link>
              ) : (
                <Link href="/creator/storefront" className="neonbtn" style={{ ...neonBtn, marginTop: 26 }}>
                  Set up your shopfront
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m9 18 6-6-6-6" /></svg>
                </Link>
              )}
            </div>
            <div style={{ position: 'relative', aspectRatio: '1 / 1', width: '100%', maxWidth: 280, justifySelf: 'center', borderRadius: 24, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <span style={{ fontFamily: 'var(--font-ui)', fontSize: 11, fontWeight: 600, letterSpacing: '0.16em', textTransform: 'uppercase' as const, color: 'var(--wg-400)' }} />
            </div>
          </div>
        </section>

        {/* ── FOOTER ──────────────────────────────────── */}
        <footer style={{ marginTop: 'clamp(52px, 6vw, 80px)', padding: 'clamp(24px, 3vw, 40px) 0 8px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 170px), 1fr))', gap: 'clamp(28px, 4vw, 56px)' }}>
            <div style={{ maxWidth: 300 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 22, letterSpacing: '-0.02em' }}>guapd</span>
              </div>
              <p style={{ fontFamily: 'var(--font-ui)', fontSize: 14, lineHeight: 1.6, color: 'var(--wg-500)', margin: '14px 0 18px' }}>
                Brand–creator deals without the <span style={{ fontFamily: 'var(--font-serif)', fontStyle: 'italic', fontWeight: 400, letterSpacing: 0, fontSize: '1.12em' }}>chaos</span>.
              </p>
            </div>
          </div>
          <div style={{ marginTop: 'clamp(32px, 4vw, 52px)', paddingTop: 18, borderTop: '1px solid var(--line)' }}>
            <span style={{ fontFamily: 'var(--font-ui)', fontSize: 12, color: 'var(--wg-400)' }}>© 2026 Guapd. All rights reserved.</span>
          </div>
        </footer>
      </div>
    </div>
  )
}

// ── Sub-components ───────────────────────────────────────────

function NameHighlight({ name }: { name: string }) {
  return (
    <span style={{ position: 'relative', display: 'inline-block' }}>
      <span aria-hidden="true" style={{ position: 'absolute', inset: '24% -0.06em 16%', background: 'var(--lime-400)', borderRadius: 14, transform: 'rotate(-1.6deg)', zIndex: 0 }} />
      <span style={{ position: 'relative', zIndex: 1, fontFamily: 'var(--font-serif)', fontStyle: 'italic', fontWeight: 400, letterSpacing: 0, fontSize: '1.12em' }}>{name}</span>
    </span>
  )
}

function KpiCell({ label, value, sub, large, border }: { label: string; value: string; sub: string; large?: boolean; border?: boolean }) {
  return (
    <div style={{ padding: 'clamp(22px, 2.2vw, 30px)', display: 'flex', flexDirection: 'column', borderLeft: border ? '1px solid var(--hair)' : undefined }}>
      <div className="t-meta" style={{ color: 'var(--meta)' }}>{label}</div>
      <div style={{ display: 'flex', alignItems: 'flex-end', minHeight: 64, marginTop: 16 }}>
        <div style={{ fontFamily: 'var(--font-ui)', fontWeight: 700, fontSize: large ? 'clamp(48px, 5.2vw, 70px)' : 'clamp(30px, 3.2vw, 40px)', lineHeight: 0.9, letterSpacing: '-0.045em', color: 'var(--ink)' }}>{value}</div>
      </div>
      <div className="t-meta" style={{ color: 'var(--meta)', marginTop: 12 }}>{sub}</div>
    </div>
  )
}

function TickerContent({ activeCount, totalEarned, completedCount }: { activeCount: number; totalEarned: number; completedCount: number }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 22, paddingRight: 22 }}>
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 9 }}><span style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--amber)' }} />{activeCount} deal{activeCount !== 1 ? 's' : ''} in motion</span><span style={{ color: 'var(--lime-700)' }}>✦</span>
      <span>{fmt(totalEarned)} earned</span><span style={{ color: 'var(--lime-700)' }}>✦</span>
      <span>{completedCount} completed</span><span style={{ color: 'var(--lime-700)' }}>✦</span>
    </span>
  )
}

function AttentionRow({ href, icon, title, sub, action, border }: { href: string; icon: React.ReactNode; title: string; sub: string; action: string; border?: boolean }) {
  return (
    <Link href={href} className="drow" style={{ display: 'grid', gridTemplateColumns: 'auto 1fr auto auto', alignItems: 'center', gap: 16, padding: '18px 12px', borderRadius: 12, textDecoration: 'none', borderTop: border ? '1px solid var(--hair)' : undefined }}>
      <span style={{ width: 40, height: 40, borderRadius: 12, background: '#EEEEE0', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{icon}</span>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontFamily: 'var(--font-ui)', fontWeight: 600, fontSize: 14.5, color: 'var(--ink)' }}>{title}</div>
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 7, fontFamily: 'var(--font-ui)', fontSize: 12, color: 'var(--wg-500)', marginTop: 3 }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, color: 'var(--amber)', fontWeight: 600 }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--amber)' }} />
            {sub.includes('Awaiting') ? 'Awaiting you' : sub}
          </span>
        </div>
      </div>
      <span className="pillbtn" style={pillBtnStyle}>{action}</span>
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#9A9C8E" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m9 18 6-6-6-6" /></svg>
    </Link>
  )
}

function DealBreadcrumb({ status }: { status: string }) {
  const stages = ['Offer', 'Terms', 'Content', 'Paid']
  const activeIdx = status === 'negotiating' ? 0 : status === 'agreed' ? 1 : status === 'delivered' || status === 'revision' ? 2 : status === 'approved' || status === 'paid' || status === 'complete' ? 3 : -1
  return (
    <div className="t-meta" style={{ color: 'var(--meta)', marginTop: 16 }}>
      {stages.map((s, i) => (
        <span key={s}>
          <span style={{ color: i === activeIdx ? 'var(--ink)' : '#C6C8BA', fontWeight: i === activeIdx ? 700 : 400 }}>{s}</span>
          {i < stages.length - 1 && <span style={{ color: '#C6C8BA' }}> · </span>}
        </span>
      ))}
    </div>
  )
}

function DealStatusLabel({ status, lastOfferBy }: { status: string; lastOfferBy: string | null }) {
  let label = ''
  let bg = 'var(--sec-2)'
  if (status === 'negotiating' && lastOfferBy === 'brand') { label = 'New offer received'; bg = 'var(--lime-200)' }
  else if (status === 'negotiating') { label = 'Negotiating terms'; bg = 'var(--sec-2)' }
  else if (status === 'agreed') { label = 'Terms agreed'; bg = 'var(--sec-2)' }
  else if (status === 'delivered') { label = 'In review'; bg = 'var(--sec-2)' }
  else if (status === 'revision') { label = 'Revision requested'; bg = 'var(--sec-2)' }
  else if (status === 'approved') { label = 'Approved'; bg = 'var(--lime-200)' }
  else label = status
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', fontFamily: 'var(--font-ui)', fontSize: 11, fontWeight: 600, color: 'var(--lime-950)', background: bg, padding: '4px 11px', borderRadius: 999 }}>{label}</span>
  )
}

function TrackRow({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12, padding: '13px 0', borderTop: '1px solid var(--sec)' }}>
      <span style={{ fontFamily: 'var(--font-ui)', fontSize: 13, color: 'var(--wg-600)' }}>{label}</span>
      <span style={{ fontFamily: 'var(--font-ui)', fontSize: 14, fontWeight: 700, color: 'var(--ink)', letterSpacing: '-0.02em' }}>{value}</span>
    </div>
  )
}

function ReachCell({ label, value, border }: { label: string; value: string; border?: boolean }) {
  return (
    <div style={{ padding: 'clamp(20px, 2vw, 26px)', display: 'flex', flexDirection: 'column', borderLeft: border ? '1px solid var(--hair)' : undefined }}>
      <div className="t-meta" style={{ color: 'var(--meta)' }}>{label}</div>
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 12, marginTop: 14 }}>
        <div style={{ fontFamily: 'var(--font-ui)', fontWeight: 700, fontSize: 'clamp(40px, 4.4vw, 54px)', letterSpacing: '-0.045em', lineHeight: 0.9 }}>{value}</div>
      </div>
      <div className="t-meta" style={{ color: 'var(--meta)', marginTop: 12 }}>Coming soon</div>
    </div>
  )
}

function EarningsChart({ data }: { data: { label: string; amount: number }[] }) {
  if (data.length === 0) {
    return (
      <div style={{ padding: '40px 0', textAlign: 'center', fontFamily: 'var(--font-ui)', fontSize: 13, color: 'var(--wg-500)' }}>
        No earnings data yet
      </div>
    )
  }

  const maxVal = Math.max(...data.map(d => d.amount), 1)
  const W = 900, H = 270, PAD_L = 60, PAD_R = 16, Y_TOP = 24, Y_BOT = 220
  const usable = W - PAD_L - PAD_R
  const step = data.length > 1 ? usable / (data.length - 1) : usable
  const points = data.map((d, i) => {
    const x = PAD_L + 36 + i * step
    const y = Y_BOT - ((d.amount / maxVal) * (Y_BOT - Y_TOP))
    return { x, y, ...d }
  })
  const polyPoints = points.map(p => `${p.x},${p.y}`).join(' ')
  const areaPath = `M${points[0].x},${points[0].y} ${points.slice(1).map(p => `L${p.x},${p.y}`).join(' ')} L${points[points.length - 1].x},${Y_BOT} L${points[0].x},${Y_BOT} Z`

  const gridLines = [0, maxVal / 2, maxVal]
  const gridYs = gridLines.map(v => Y_BOT - ((v / maxVal) * (Y_BOT - Y_TOP)))

  return (
    <div style={{ position: 'relative' }}>
      <svg viewBox={`0 0 ${W} 270`} width="100%" preserveAspectRatio="xMidYMid meet" style={{ position: 'relative', display: 'block', overflow: 'visible', fontFamily: 'var(--font-ui)' }}>
        <defs>
          <linearGradient id="creatorAreaG" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" style={{ stopColor: 'var(--sec-mid)', stopOpacity: 0.7 }} />
            <stop offset="55%" style={{ stopColor: 'var(--sec-2)', stopOpacity: 0.5 }} />
            <stop offset="100%" style={{ stopColor: 'var(--sec)', stopOpacity: 0 }} />
          </linearGradient>
        </defs>
        <g stroke="rgba(26,27,22,.06)" strokeWidth="1">
          {gridYs.map((y, i) => <line key={i} x1={PAD_L} y1={y} x2={W - PAD_R} y2={y} />)}
        </g>
        <g fill="var(--meta)" fontSize="9.5" fontWeight="500" letterSpacing=".14em" textAnchor="end">
          {gridLines.map((v, i) => <text key={i} x={PAD_L - 10} y={gridYs[i] + 3}>{fmt(v * 100)}</text>)}
        </g>
        <path d={areaPath} fill="url(#creatorAreaG)" style={{ opacity: 1 }} />
        <polyline points={polyPoints} fill="none" stroke="var(--ink)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
        {points.slice(0, -1).map((p, i) => (
          <circle key={i} cx={p.x} cy={p.y} r="4" stroke="var(--ink)" strokeWidth="2" fill="var(--card)" />
        ))}
        {points.length > 0 && (
          <circle cx={points[points.length - 1].x} cy={points[points.length - 1].y} r="6" fill="var(--lime-400)" stroke="var(--ink)" strokeWidth="2.4" />
        )}
        <g fill="var(--meta)" fontSize="9.5" fontWeight="500" letterSpacing=".14em" textAnchor="middle">
          {points.slice(0, -1).map((p, i) => <text key={i} x={p.x} y={242}>{p.label.slice(0, 3).toUpperCase()}</text>)}
        </g>
        {points.length > 0 && (
          <g textAnchor="middle">
            <text x={points[points.length - 1].x} y={242} fill="var(--lime-700)" fontSize="9.5" fontWeight="800" letterSpacing=".1em">{points[points.length - 1].label.slice(0, 3).toUpperCase()}</text>
            <text x={points[points.length - 1].x} y={256} fill="var(--wg-400)" fontSize="7.5" fontWeight="700" letterSpacing=".16em">NOW</text>
          </g>
        )}
      </svg>
    </div>
  )
}

// ── Helpers ──────────────────────────────────────────────────

function fmt(paise: number): string {
  if (paise === 0) return '\u20B90'
  const rupees = paise / 100
  if (rupees >= 10000000) return `\u20B9${(rupees / 10000000).toFixed(1)}Cr`
  if (rupees >= 100000) return `\u20B9${(rupees / 100000).toFixed(2)}L`
  if (rupees >= 1000) return `\u20B9${Math.round(rupees / 1000)}K`
  return `\u20B9${rupees.toLocaleString('en-IN')}`
}

function computeMonthlyEarnings(invoices: InvoiceRow[]): { label: string; amount: number }[] {
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  const buckets = new Map<string, number>()

  for (const inv of invoices) {
    if (!inv.paid_at) continue
    const d = new Date(inv.paid_at)
    const key = `${d.getFullYear()}-${String(d.getMonth()).padStart(2, '0')}`
    buckets.set(key, (buckets.get(key) ?? 0) + (inv.creator_receives_paise ?? 0))
  }

  if (buckets.size === 0) return []

  const sorted = Array.from(buckets.entries()).sort((a, b) => a[0].localeCompare(b[0]))
  const last6 = sorted.slice(-6)
  return last6.map(([key, amount]) => {
    const [, m] = key.split('-')
    return { label: months[parseInt(m, 10)], amount }
  })
}

// ── Style constants ─────────────────────────────────────────

const heroCard: React.CSSProperties = {
  position: 'relative', overflow: 'visible', borderRadius: 24,
  background: 'var(--card)', boxShadow: 'var(--sh-2)',
  padding: 'clamp(26px, 3vw, 40px) clamp(24px, 3vw, 40px) clamp(28px, 3.4vw, 40px)',
}

const heroTitle: React.CSSProperties = {
  fontFamily: 'var(--font-display)', fontWeight: 700, letterSpacing: '-0.025em',
  lineHeight: 1, fontSize: 'clamp(54px, 6.2vw, 80px)',
  margin: '12px 0 0', color: 'var(--ink)', whiteSpace: 'nowrap',
}


const payoutCard: React.CSSProperties = {
  width: 304, maxWidth: '100%', borderRadius: 18,
  background: 'linear-gradient(125deg,var(--sec),var(--sec-2))',
  border: '1px solid var(--sec-mid-2)', boxShadow: 'var(--sh-2)',
  padding: '20px 22px',
}

const ghostBtn: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: 8,
  padding: '12px 18px', borderRadius: 999,
  background: 'var(--card)', border: '1px solid var(--line)',
  fontFamily: 'var(--font-ui)', fontWeight: 600, fontSize: 13, color: 'var(--ink)',
  textDecoration: 'none',
}

const neonBtn: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: 8,
  padding: '12px 20px', borderRadius: 999,
  background: 'var(--lime-400)', border: '1px solid transparent',
  fontFamily: 'var(--font-ui)', fontWeight: 700, fontSize: 13, color: 'var(--lime-950)',
  boxShadow: 'rgba(180,215,50,0.7) 0px 14px 26px -12px',
  textDecoration: 'none',
}

const sectionHeading: React.CSSProperties = {
  fontFamily: 'var(--font-display)', fontWeight: 700, letterSpacing: '-0.025em',
  fontSize: 'clamp(23px, 2.2vw, 26px)', margin: '0 0 0',
  color: 'var(--ink)',
}

const accentLine: React.CSSProperties = {
  width: 40, height: 1, background: 'rgb(201,235,60)', marginTop: 16,
}

const viewAllLink: React.CSSProperties = {
  fontFamily: 'var(--font-ui)', fontSize: 12, fontWeight: 600, color: 'var(--wg-600)',
  display: 'inline-flex', alignItems: 'center', gap: 5, textDecoration: 'none',
}

const doFirstBadge: React.CSSProperties = {
  fontFamily: 'var(--font-ui)', fontSize: 10, fontWeight: 700,
  letterSpacing: '0.08em', textTransform: 'uppercase',
  color: 'var(--lime-950)', background: 'var(--lime-400)',
  borderRadius: 999, padding: '4px 12px',
  boxShadow: 'rgba(180,215,50,0.9) 0px 8px 16px -8px',
}

const pillBtnStyle: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
  minWidth: 110, borderRadius: 999, padding: '10px 18px',
  fontFamily: 'var(--font-ui)', fontWeight: 700, fontSize: 12.5,
  color: 'var(--lime-950)', background: 'var(--lime-400)',
  border: '1px solid transparent',
  boxShadow: 'rgba(180,215,50,0.9) 0px 10px 20px -10px',
}

const brandCardStyle: React.CSSProperties = {
  display: 'block', borderRadius: 18, background: 'var(--card)',
  textDecoration: 'none', padding: 34,
  boxShadow: 'var(--sh-2)',
}

const brandStatNum: React.CSSProperties = {
  fontFamily: 'var(--font-ui)', fontWeight: 700, fontSize: 26,
  letterSpacing: '-0.045em', color: 'var(--ink)',
}

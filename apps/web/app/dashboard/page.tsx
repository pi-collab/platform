import { createClient } from '@/lib/supabase/server'
import { verifyBrand } from '@/lib/brand-auth'
import HeldNotice from '@/components/HeldNotice'
import ApprovalNotice from '@/components/ApprovalNotice'
import { shouldShowApprovalNotice } from '@/lib/approval-notice'
import { deriveDisplayStatus } from '@/lib/deal-status'
import Link from 'next/link'
import RealtimeDashboardListener from '@/components/RealtimeDashboardListener'
import { DateFilter, DashboardSearch } from './DashboardControls'
import { periodToDateRange } from './period-utils'
import type { Period } from './period-utils'

interface DealRow {
  id: string
  title: string
  status: string
  price_paise: number
  is_posted: boolean | null
  created_at: string
  creator_id: string
  campaign_id: string | null
  creators: unknown
}

interface InvoiceRow {
  deal_id: string
  status: string
  due_date: string | null
  brand_pays_paise: number
  paid_at: string | null
}

interface CampaignRow {
  id: string
  name: string
  budget_paise: number | null
}

const VALID_PERIODS = new Set(['this_year', 'this_quarter', 'this_month', 'this_week', 'custom'])

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: { period?: string; from?: string; to?: string }
}) {
  const brand = await verifyBrand()
  const supabase = createClient()

  // Held-deal count is deliberately its OWN query rather than derived from the
  // list/period query above. Those are scoped by tab, search text, page and
  // date range; this notice reports ACCOUNT state, so deriving it from a
  // filtered view meant switching tabs or typing in search made it vanish
  // while the deals were still held. RLS scopes it to this brand.
  const { count: heldCount } = await supabase
    .from('deals')
    .select('id', { count: 'exact', head: true })
    .not('held_at', 'is', null)

  // Only asked once the brand is approved, so unapproved brands do not pay for
  // two event lookups on every dashboard load.
  const showApproval =
    brand.brandStatus === 'approved' && (await shouldShowApprovalNotice(brand.brandId))


  // Date range filtering
  const period = (searchParams.period && VALID_PERIODS.has(searchParams.period) ? searchParams.period : 'this_year') as Period
  const { from: periodFrom, to: periodTo } = periodToDateRange(period, searchParams.from, searchParams.to)
  const periodFromISO = periodFrom.toISOString()
  const periodToISO = periodTo.toISOString()

  const [{ data: deals }, { data: invoices }, { count: campaignCount }, { data: campaigns }] = await Promise.all([
    supabase
      .from('deals')
      .select('id, title, status, price_paise, is_posted, created_at, creator_id, campaign_id, creators(id, full_name, profile_photo_url)')
      .neq('status', 'cancelled')
      .neq('status', 'declined')
      .gte('created_at', periodFromISO)
      .lte('created_at', periodToISO)
      .order('created_at', { ascending: false }),
    supabase
      .from('invoices')
      .select('deal_id, status, due_date, brand_pays_paise, paid_at'),
    supabase
      .from('campaigns')
      .select('id', { count: 'exact', head: true }),
    supabase
      .from('campaigns')
      .select('id, name, budget_paise')
      .order('created_at', { ascending: false })
      .limit(5),
  ])

  const allDeals = (deals ?? []) as DealRow[]
  const allInvoices = (invoices ?? []) as InvoiceRow[]

  const invoiceMap = new Map<string, InvoiceRow>()
  for (const inv of allInvoices) invoiceMap.set(inv.deal_id, inv)

  const dealStatuses = allDeals.map((d) => {
    const inv = invoiceMap.get(d.id)
    const derived = deriveDisplayStatus(d.status, inv?.status ?? null, inv?.due_date ?? null)
    return { deal: d, invoice: inv ?? null, derived }
  })

  // ── NEEDS ATTENTION
  const invoicesToAccept = dealStatuses.filter((ds) => ds.derived.label === 'invoice to accept')
  const paymentsDue = dealStatuses.filter((ds) => ds.derived.label === 'payment due')
  const overdue = dealStatuses.filter((ds) => ds.derived.label === 'overdue')
  const submissionsToReview = dealStatuses.filter((ds) => ds.deal.status === 'delivered')
  const awaitingApproval = dealStatuses.filter((ds) => ds.deal.status === 'revision')

  const paymentsDueTotal = paymentsDue.reduce((sum, ds) => sum + (ds.invoice?.brand_pays_paise ?? 0), 0)
  const overdueTotal = overdue.reduce((sum, ds) => sum + (ds.invoice?.brand_pays_paise ?? 0), 0)
  const attentionCount = invoicesToAccept.length + paymentsDue.length + overdue.length + submissionsToReview.length + awaitingApproval.length

  // ── ACTIVITY SUMMARY
  const ACTIVE_STATUSES = new Set(['negotiating', 'agreed', 'delivered', 'revision', 'approved'])
  const COMPLETED_STATUSES = new Set(['complete', 'paid'])

  const activeDeals = allDeals.filter((d) => ACTIVE_STATUSES.has(d.status))
  const completedDeals = allDeals.filter((d) => COMPLETED_STATUSES.has(d.status))
  const totalDeals = allDeals.length

  const budgetSpent = allInvoices
    .filter((inv) => inv.status === 'paid')
    .reduce((sum, inv) => sum + (inv.brand_pays_paise ?? 0), 0)

  const uniqueCreators = new Set(allDeals.map((d) => d.creator_id))

  // ── DEALS IN FLIGHT (top 3 active)
  const dealsInFlight = allDeals.filter((d) => ACTIVE_STATUSES.has(d.status)).slice(0, 3)

  // ── TOP CREATORS
  const creatorAgg = new Map<string, { name: string; photo: string | null; dealCount: number; totalPaise: number; latestDealId: string }>()
  for (const d of allDeals) {
    const c = (Array.isArray(d.creators) ? d.creators[0] : d.creators) as { id: string; full_name: string; profile_photo_url: string | null } | null
    if (!c) continue
    const existing = creatorAgg.get(c.id)
    if (existing) {
      existing.dealCount++
      existing.totalPaise += d.price_paise ?? 0
    } else {
      creatorAgg.set(c.id, { name: c.full_name, photo: c.profile_photo_url, dealCount: 1, totalPaise: d.price_paise ?? 0, latestDealId: d.id })
    }
  }
  const topCreators = Array.from(creatorAgg.values())
    .sort((a, b) => b.dealCount - a.dealCount || b.totalPaise - a.totalPaise)
    .slice(0, 4)

  const brandFirstName = brand.brandName?.split(' ')[0] ?? 'there'
  const allCampaigns = (campaigns ?? []) as CampaignRow[]

  // ── MONTHLY SPEND (for chart)
  const monthlySpend = computeMonthlySpend(allInvoices)

  // ── CAMPAIGN BUDGET (spend per campaign)
  const campaignSpend = new Map<string, number>()
  for (const d of allDeals) {
    if (!d.campaign_id) continue
    const inv = invoiceMap.get(d.id)
    if (inv?.status === 'paid') {
      campaignSpend.set(d.campaign_id, (campaignSpend.get(d.campaign_id) ?? 0) + (inv.brand_pays_paise ?? 0))
    }
  }
  const campaignsWithBudget = allCampaigns
    .filter((c) => c.budget_paise && c.budget_paise > 0)
    .slice(0, 2)
    .map((c) => ({
      name: c.name,
      budgetPaise: c.budget_paise!,
      spentPaise: campaignSpend.get(c.id) ?? 0,
    }))
  const totalCampaignBudget = campaignsWithBudget.reduce((s, c) => s + c.budgetPaise, 0)
  const totalCampaignSpent = campaignsWithBudget.reduce((s, c) => s + c.spentPaise, 0)
  const budgetPct = totalCampaignBudget > 0 ? Math.round((totalCampaignSpent / totalCampaignBudget) * 100) : 0

  // ── EMPTY STATE
  if (totalDeals === 0) {
    return (
      <main style={{ position: 'relative', zIndex: 1, padding: 'clamp(20px, 3vw, 40px) clamp(18px, 4vw, 44px) clamp(56px, 6vw, 90px)' }}>
        <div style={{ maxWidth: 1080, margin: '0 auto' }}>
          {/* Above the hero: a brand whose first deal is sitting unsent needs
              to know that before anything else on the page. */}
          {showApproval && <ApprovalNotice />}

          <HeldNotice
            heldCount={heldCount ?? 0}
            status={brand.brandStatus}
            rejectionReason={brand.rejectionReason}
          />

          <section style={{ position: 'relative', overflow: 'hidden', borderRadius: 24, background: 'var(--card)', boxShadow: 'var(--sh-2)', padding: 'clamp(26px, 3vw, 40px) clamp(24px, 3vw, 40px) clamp(28px, 3.4vw, 40px)' }}>
            <div style={{ position: 'relative', zIndex: 2 }}>
              <span className="t-meta" style={{ display: 'inline-block', color: 'var(--meta)' }}>Welcome</span>
              <h1 style={heroH1Style}>Hey, <NameHighlight name={brandFirstName} />.</h1>
              <div style={badgeRowStyle}>
                <span style={badgeDotStyle}><span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--lime-700)' }} />Brand</span>
              </div>
              <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' as const, marginTop: 22 }}>
                <Link href="/browse" style={ghostBtnStyle}>
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" /></svg>
                  Browse creators
                </Link>
                <Link href="/deals/new" style={neonBtnStyle}>
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M12 5v14M5 12h14" /></svg>
                  Start a new deal
                </Link>
              </div>
            </div>
          </section>

          <section style={{ marginTop: 40, borderRadius: 24, background: 'var(--card)', boxShadow: 'var(--sh-2)', padding: '64px 38px', textAlign: 'center' as const, display: 'flex', flexDirection: 'column' as const, alignItems: 'center' }}>
            <p style={{ fontSize: 20, fontWeight: 700, color: 'var(--ink)', margin: '0 0 8px' }}>Start your first deal</p>
            <p style={{ fontSize: 14, color: 'var(--wg-500)', margin: '0 0 24px', maxWidth: 360 }}>
              Browse vetted creators and send your first offer. Your dashboard will light up once deals are in motion.
            </p>
            <Link href="/browse" style={neonBtnStyle}>Browse creators</Link>
          </section>
        </div>
      </main>
    )
  }

  return (
    <main style={{ position: 'relative', zIndex: 1, padding: 'clamp(20px, 3vw, 40px) clamp(18px, 4vw, 44px) clamp(56px, 6vw, 90px)' }}>
      <RealtimeDashboardListener />
      <div style={{ maxWidth: 1080, margin: '0 auto' }}>

        {/* Above the hero: a brand whose deals are sitting unsent needs to know
            that before anything else on the page. Rendered in BOTH dashboard
            states — the empty one is where a brand held on its FIRST send
            actually lands, so it is the one that matters most. */}
        {showApproval && <ApprovalNotice />}

        <HeldNotice
          heldCount={heldCount ?? 0}
          status={brand.brandStatus}
          rejectionReason={brand.rejectionReason}
        />

        {/* ── HERO CARD ─────────────────────────────────────── */}
        <section className="neon-hover" style={{ position: 'relative', overflow: 'visible', borderRadius: 24, background: 'var(--card)', boxShadow: 'var(--sh-2)', padding: 'clamp(26px, 3vw, 40px) clamp(24px, 3vw, 40px) clamp(28px, 3.4vw, 40px)' }}>
          <div style={{ position: 'relative', zIndex: 2, display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 24, flexWrap: 'wrap' as const }}>
            <div style={{ flex: '1 1 0%', minWidth: 260 }}>
              <span className="t-meta" style={{ display: 'inline-block', color: 'var(--meta)' }}>HEY, {brandFirstName.toUpperCase()}</span>
              <h1 style={heroH1Style}>Let&rsquo;s get you <NameHighlight name="guapd" />.</h1>
            </div>
            {/* Date filter */}
            <DateFilter />
          </div>

          {/* Search bar */}
          <DashboardSearch />

          {/* KPI GRID — 3 bordered cards */}
          <div style={{ position: 'relative', zIndex: 0, marginTop: 24, display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }} className="kpigrid">
            <div style={kpiCardStyle}>
              <div className="t-meta" style={{ color: 'var(--meta)' }}>LIVE REACH</div>
              <div style={{ marginTop: 20 }}>
                <div style={kpiBigNum}>{formatRupees(budgetSpent)}</div>
              </div>
              <div className="t-meta" style={{ color: 'var(--meta)', marginTop: 14 }}>ACCOUNTS REACHED {completedDeals.length > 0 && <>&middot; <span style={{ color: 'var(--lime-700)' }}>&triangle; {Math.round((completedDeals.length / Math.max(totalDeals, 1)) * 100)}%</span></>}</div>
            </div>
            <div style={kpiCardStyle}>
              <div className="t-meta" style={{ color: 'var(--meta)' }}>ACTIVE DEALS</div>
              <div style={{ marginTop: 20 }}>
                <div style={kpiBigNum}>{activeDeals.length}</div>
              </div>
              <div className="t-meta" style={{ color: 'var(--meta)', marginTop: 14 }}>ACROSS {campaignCount ?? 0} CAMPAIGN{(campaignCount ?? 0) !== 1 ? 'S' : ''}</div>
            </div>
            <div style={kpiCardStyle}>
              <div className="t-meta" style={{ color: 'var(--meta)' }}>CREATORS</div>
              <div style={{ marginTop: 20 }}>
                <div style={kpiBigNum}>{uniqueCreators.size}</div>
              </div>
              <div className="t-meta" style={{ color: 'var(--meta)', marginTop: 14 }}>WORKED WITH YOU</div>
            </div>
          </div>
        </section>

        {/* ── SCROLLING TICKER ──────────────────────────────── */}
        <section style={{ position: 'relative', marginTop: 'clamp(28px, 3.2vw, 42px)', borderTop: '1px solid var(--line)', borderBottom: '1px solid var(--line)', padding: '12px 0', overflow: 'hidden' }}>
            <div aria-hidden="true" style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 80, zIndex: 2, pointerEvents: 'none', background: 'linear-gradient(90deg, rgb(247,247,244), rgba(247,247,244,0))' }} />
            <div aria-hidden="true" style={{ position: 'absolute', right: 0, top: 0, bottom: 0, width: 80, zIndex: 2, pointerEvents: 'none', background: 'linear-gradient(270deg, rgb(247,247,244), rgba(247,247,244,0))' }} />
            <div className="mq">
              {[0, 1].map((i) => (
                <span key={i} aria-hidden={i > 0 || undefined} style={{ display: 'inline-flex', alignItems: 'center', gap: 22, paddingRight: 22 }}>
                  <span>{submissionsToReview.length} submission{submissionsToReview.length !== 1 ? 's' : ''} to review</span>
                  <span style={{ color: 'var(--lime-700)' }}>✦</span>
                  <span>{activeDeals.length} deal{activeDeals.length !== 1 ? 's' : ''} in flight</span>
                  <span style={{ color: 'var(--lime-700)' }}>✦</span>
                  <span>{formatRupees(budgetSpent)} total invested</span>
                  <span style={{ color: 'var(--lime-700)' }}>✦</span>
                  <span>{uniqueCreators.size} creator{uniqueCreators.size !== 1 ? 's' : ''} on roster</span>
                  <span style={{ color: 'var(--lime-700)' }}>✦</span>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 9 }}>
                    <span style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--amber)' }} />
                    {attentionCount} thing{attentionCount !== 1 ? 's' : ''} need you
                  </span>
                  <span style={{ color: 'var(--lime-700)' }}>✦</span>
                  <span>{formatRupees(paymentsDueTotal + overdueTotal)} ready to release</span>
                  <span style={{ color: 'var(--lime-700)' }}>✦</span>
                  <span>{completedDeals.length} deal{completedDeals.length !== 1 ? 's' : ''} completed</span>
                  <span style={{ color: 'var(--lime-700)' }}>✦</span>
                  <span>{(campaignCount ?? 0)} campaign{(campaignCount ?? 0) !== 1 ? 's' : ''} running</span>
                  <span style={{ color: 'var(--lime-700)' }}>✦</span>
                </span>
              ))}
            </div>
          </section>

        {/* ── DO FIRST / ATTENTION ────────────────────────────── */}
        {attentionCount > 0 && (
          <section className="neon-hover" style={{ position: 'relative', marginTop: 'clamp(28px, 3.2vw, 42px)', borderRadius: 16, background: 'var(--card)', boxShadow: 'var(--sh-2)', padding: 'clamp(24px, 3vw, 38px)' }}>
            <div style={{ marginBottom: 20 }}>
              <span style={{ fontFamily: 'inherit', fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase' as const, color: 'var(--lime-950)', background: 'var(--lime-400)', borderRadius: 'var(--radius-pill)', padding: '4px 12px', boxShadow: 'rgba(180,215,50,0.9) 0px 8px 16px -8px' }}>Do first</span>
              <h2 style={sectionH2Style}>
                A few things need you
                <div aria-hidden="true" style={{ width: 40, height: 1, background: 'rgb(201,235,60)', marginTop: 16 }} />
              </h2>
            </div>
            <div>
              {overdue.length > 0 && (
                <AttentionRow
                  icon={<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--wg-700)" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="5" width="20" height="14" rx="3" /><path d="M2 10h20" /></svg>}
                  label={`${formatRupees(overdueTotal)} payment to release`}
                  sublabel={<><span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, color: 'var(--amber)', fontWeight: 600 }}><span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--amber)' }} />Overdue by {overdue.length} deal{overdue.length !== 1 ? 's' : ''}</span></>}
                  action="Release"
                  href="/deals"
                  first
                />
              )}
              {submissionsToReview.length > 0 && (
                <AttentionRow
                  icon={<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--wg-700)" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z" /><circle cx="12" cy="12" r="3" /></svg>}
                  label={`${submissionsToReview.length} submission${submissionsToReview.length !== 1 ? 's' : ''} to review`}
                  sublabel={<><span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, color: 'var(--amber)', fontWeight: 600 }}><span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--amber)' }} />Awaiting you</span><span style={{ color: 'rgb(198,200,186)' }}>&middot;</span><span>Creators are waiting on feedback</span></>}
                  action="Review"
                  href="/deals"
                  first={overdue.length === 0}
                />
              )}
              {awaitingApproval.length > 0 && (
                <AttentionRow
                  icon={<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--wg-700)" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><path d="M14 2v6h6" /><path d="m9 15 2 2 4-4" /></svg>}
                  label={`${awaitingApproval.length} deal${awaitingApproval.length !== 1 ? 's' : ''} awaiting approval`}
                  sublabel={<span>Terms are ready for your sign-off</span>}
                  action="Approve"
                  href="/deals"
                  first={overdue.length === 0 && submissionsToReview.length === 0}
                />
              )}
              {paymentsDue.length > 0 && (
                <AttentionRow
                  icon={<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--wg-700)" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="5" width="20" height="14" rx="3" /><path d="M2 10h20" /></svg>}
                  label={`${formatRupees(paymentsDueTotal)} payment${paymentsDue.length !== 1 ? 's' : ''} due`}
                  sublabel={<span>{paymentsDue.length} deal{paymentsDue.length !== 1 ? 's' : ''}</span>}
                  action="Pay"
                  href="/deals"
                  first={overdue.length === 0 && submissionsToReview.length === 0 && awaitingApproval.length === 0}
                />
              )}
              {invoicesToAccept.length > 0 && (
                <AttentionRow
                  icon={<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--wg-700)" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><path d="M14 2v6h6" /><path d="m9 15 2 2 4-4" /></svg>}
                  label={`${invoicesToAccept.length} invoice${invoicesToAccept.length !== 1 ? 's' : ''} to review`}
                  sublabel={<span>Review and approve</span>}
                  action="Approve"
                  href="/deals"
                  first={overdue.length === 0 && submissionsToReview.length === 0 && awaitingApproval.length === 0 && paymentsDue.length === 0}
                />
              )}
            </div>
          </section>
        )}

        {/* ── DEALS IN FLIGHT ──────────────────────────────── */}
        {dealsInFlight.length > 0 && (
          <section style={{ marginTop: 'clamp(52px, 6vw, 80px)' }}>
            <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 12, marginBottom: 24 }}>
              <h2 style={sectionH2Style}>
                My Deals
                <div aria-hidden="true" style={{ width: 40, height: 1, background: 'rgb(201,235,60)', marginTop: 16 }} />
              </h2>
              <Link href="/deals" style={{ fontSize: 12, fontWeight: 600, color: 'var(--wg-600)', display: 'inline-flex', alignItems: 'center', gap: 5, flexShrink: 0, textDecoration: 'none' }}>
                View all
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m9 18 6-6-6-6" /></svg>
              </Link>
            </div>
            <div className="g3">
              {dealsInFlight.map((d, i) => {
                const c = (Array.isArray(d.creators) ? d.creators[0] : d.creators) as { id: string; full_name: string; profile_photo_url: string | null } | null
                const initials = (c?.full_name ?? '??').split(' ').map((w) => w[0]).join('').toUpperCase().slice(0, 2)
                return (
                  <Link key={d.id} href={`/deals/${d.id}`} className="dealcard" style={{
                    display: 'block',
                    borderRadius: 20,
                    background: 'var(--card)',
                    overflow: 'hidden',
                    textDecoration: 'none',
                    border: 'none',
                    boxShadow: 'var(--sh-2)',
                  }}>
                    {/* Creator avatar + name */}
                    <div style={{ padding: '20px 22px 0', display: 'flex', alignItems: 'center', gap: 13 }}>
                      {c?.profile_photo_url ? (
                        <img src={c.profile_photo_url} alt={c.full_name} style={{ width: 40, height: 40, borderRadius: '50%', objectFit: 'cover' as const, flexShrink: 0 }} />
                      ) : (
                        <div style={{ width: 40, height: 40, borderRadius: '50%', background: 'var(--sec-2)', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 14, color: 'var(--wg-500)' }}>{initials}</div>
                      )}
                      <span style={{ fontWeight: 600, fontSize: 15, color: 'var(--ink)' }}>{c?.full_name ?? 'Creator'}</span>
                    </div>
                    {/* Amount + status */}
                    <div style={{ padding: '26px 26px 30px' }}>
                      <div style={{ fontWeight: 700, fontSize: 60, letterSpacing: '-0.045em', lineHeight: 1, color: 'var(--ink)' }}>
                        {formatRupees(d.price_paise)}
                      </div>
                      {/* Status breadcrumb trail */}
                      <div className="t-meta" style={{ color: 'var(--meta)', marginTop: 16 }}>
                        <DealBreadcrumb status={d.status} />
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginTop: 14 }}>
                        <DealStatusLabel status={d.status} />
                        <span className="dealgo" style={{ display: 'inline-flex', color: 'var(--ink)', flexShrink: 0 }}>
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

        {/* ── CHART + CAMPAIGNS GRID ─────────────────── */}
        <div style={{ marginTop: 'clamp(52px, 6vw, 80px)', display: 'grid', gridTemplateColumns: '1.63fr 1fr', gap: 'clamp(16px, 2vw, 20px)', alignItems: 'stretch' }} className="ctgrid">
          {/* Your quarter yet — chart */}
          <section className="neon-hover" style={{ position: 'relative', overflow: 'hidden', borderRadius: 24, background: 'var(--card)', padding: 'clamp(18px, 2vw, 26px)', boxShadow: 'var(--sh-2)' }}>
            <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' as const, marginBottom: 8 }}>
              <div>
                <h2 style={{ ...sectionH2Style, margin: 0 }}>Your quarter yet</h2>
                <div style={{ fontSize: '12.5px', color: 'var(--wg-500)', marginTop: 8 }}>Monthly creator spend</div>
              </div>
              {monthlySpend.length > 0 && (
                <div style={{ textAlign: 'right' as const }}>
                  <div className="t-meta" style={{ color: 'var(--meta)' }}>Biggest month</div>
                  <div style={{ fontWeight: 700, fontSize: 24, letterSpacing: '-0.045em', marginTop: 5, whiteSpace: 'nowrap' as const }}>
                    {formatRupees(Math.max(...monthlySpend.map((m) => m.total)))}
                    <span style={{ fontSize: 14, color: 'var(--wg-500)', fontWeight: 600 }}> &middot; {monthlySpend[monthlySpend.length - 1]?.label}</span>
                  </div>
                </div>
              )}
            </div>
            <SpendChart data={monthlySpend} />
          </section>

          {/* Campaigns running — budget */}
          <section className="neon-hover" style={{ position: 'relative', overflow: 'hidden', borderRadius: 20, background: 'var(--card)', padding: 'clamp(24px, 2.6vw, 34px)', boxShadow: 'var(--sh-2)', display: 'flex', alignItems: 'center' }}>
            <div style={{ position: 'relative', zIndex: 2, width: '100%' }}>
              <span className="t-meta" style={{ display: 'block', color: 'var(--meta)', marginBottom: 12 }}>Campaigns running</span>
              <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12 }}>
                <h2 style={{ ...sectionH2Style, margin: 0, fontSize: 'clamp(26px, 2.9vw, 34px)', lineHeight: 1.15 }}>
                  Budget <span style={{ color: 'var(--ink)', background: 'linear-gradient(125deg,var(--sec),var(--sec-2))', padding: '2px 12px', borderRadius: 9, fontStyle: 'italic', fontWeight: 400, letterSpacing: 0, fontSize: '1.1em', fontFamily: 'var(--font-serif)' }}>used</span>
                </h2>
                <div style={{ textAlign: 'right' as const, flexShrink: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: 28, letterSpacing: '-0.045em' }}>{budgetPct}%</div>
                  <div style={{ fontSize: 11, color: 'var(--wg-500)', whiteSpace: 'nowrap' as const }}>of {formatRupees(totalCampaignBudget)}</div>
                </div>
              </div>
              {/* Overall progress bar */}
              <div style={{ height: 12, borderRadius: 20, background: 'linear-gradient(90deg,var(--sec),var(--sec-2))', marginTop: 24, overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${Math.min(budgetPct, 100)}%`, borderRadius: 20, background: 'var(--lime-400)' }} />
              </div>
              {/* Per-campaign bars */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 16, marginTop: 20 }}>
                {campaignsWithBudget.map((c) => {
                  const pct = c.budgetPaise > 0 ? Math.round((c.spentPaise / c.budgetPaise) * 100) : 0
                  return (
                    <div key={c.name}>
                      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8 }}>
                        <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink)' }}>{c.name}</span>
                        <span style={{ fontSize: '11.5px', fontWeight: 700, color: 'var(--wg-500)', whiteSpace: 'nowrap' as const, flexShrink: 0 }}>{formatRupees(c.spentPaise)} / {formatRupees(c.budgetPaise)}</span>
                      </div>
                      <div style={{ height: 7, borderRadius: 20, background: 'linear-gradient(90deg,var(--sec),var(--sec-2))', marginTop: 10, overflow: 'hidden' }}>
                        <div style={{ height: '100%', width: `${Math.min(pct, 100)}%`, borderRadius: 20, background: 'linear-gradient(90deg,var(--sec-mid),var(--sec-mid-2))' }} />
                      </div>
                    </div>
                  )
                })}
                {campaignsWithBudget.length === 0 && (
                  <div style={{ fontSize: 13, color: 'var(--wg-500)' }}>No campaigns with budgets yet</div>
                )}
              </div>
              <Link href="/campaigns" style={{ ...ghostBtnStyle, marginTop: 22, fontSize: '12.5px' }}>
                Manage campaigns
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m9 18 6-6-6-6" /></svg>
              </Link>
            </div>
          </section>
        </div>

        {/* ── YOUR REACH ─────────────────────────────────── */}
        <section className="neon-hover" style={{ marginTop: 'clamp(52px, 6vw, 80px)', borderRadius: 20, background: 'var(--card)', padding: 'clamp(24px, 3vw, 36px)', boxShadow: 'var(--sh-2)' }}>
          <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 12, marginBottom: 24 }}>
            <div>
              <h2 style={{ ...sectionH2Style, margin: 0 }}>Your reach</h2>
              <div aria-hidden="true" style={{ width: 40, height: 1, background: 'rgb(201,235,60)', marginTop: 16 }} />
              <div style={{ fontSize: '12.5px', color: 'var(--wg-500)', marginTop: 12 }}>Across all live campaigns</div>
            </div>
          </div>
          <div style={{ border: '1px solid var(--line)', borderRadius: 16, overflow: 'hidden', display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)' }} className="reachstat">
            <div style={{ padding: 'clamp(20px, 2vw, 26px)', display: 'flex', flexDirection: 'column' as const }}>
              <div className="t-meta" style={{ color: 'var(--meta)' }}>Total reach</div>
              <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 12, marginTop: 14 }}>
                <div style={{ fontWeight: 700, fontSize: 'clamp(38px, 4.2vw, 52px)', letterSpacing: '-0.045em', lineHeight: 0.9 }}>—</div>
              </div>
              <div className="t-meta" style={{ color: 'var(--meta)', marginTop: 12 }}>Coming soon</div>
            </div>
            <div style={{ padding: 'clamp(20px, 2vw, 26px)', display: 'flex', flexDirection: 'column' as const, borderLeft: '1px solid var(--hair)' }}>
              <div className="t-meta" style={{ color: 'var(--meta)' }}>Avg engagement</div>
              <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 12, marginTop: 14 }}>
                <div style={{ fontWeight: 700, fontSize: 'clamp(38px, 4.2vw, 52px)', letterSpacing: '-0.045em', lineHeight: 0.9 }}>—</div>
              </div>
              <div className="t-meta" style={{ color: 'var(--meta)', marginTop: 12 }}>Coming soon</div>
            </div>
            <div style={{ padding: 'clamp(20px, 2vw, 26px)', display: 'flex', flexDirection: 'column' as const, borderLeft: '1px solid var(--hair)' }}>
              <div className="t-meta" style={{ color: 'var(--meta)' }}>Return on spend</div>
              <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 12, marginTop: 14 }}>
                <div style={{ fontWeight: 700, fontSize: 'clamp(38px, 4.2vw, 52px)', letterSpacing: '-0.045em', lineHeight: 0.9 }}>—</div>
              </div>
              <div className="t-meta" style={{ color: 'var(--meta)', marginTop: 12 }}>Coming soon</div>
            </div>
          </div>
        </section>

        {/* ── CREATORS YOU WORK WITH MOST ──────────────── */}
        {topCreators.length > 0 && (
          <section style={{ marginTop: 'clamp(52px, 6vw, 80px)' }}>
            <h2 style={{ ...sectionH2Style, margin: '0 0 24px' }}>
              Creators you work with most
              <div aria-hidden="true" style={{ width: 40, height: 1, background: 'rgb(201,235,60)', marginTop: 16 }} />
            </h2>
            <div className="brandgrid">
              {topCreators.map((c) => {
                const initials = c.name.split(' ').map((w) => w[0]).join('').toUpperCase().slice(0, 2)
                return (
                  <div key={c.name} className="brandc" style={{ display: 'block', borderRadius: 18, background: 'var(--card)', padding: 'clamp(24px, 2.6vw, 34px)', boxShadow: 'var(--sh-2)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                      {c.photo ? (
                        <img src={c.photo} alt={c.name} style={{ width: 40, height: 40, borderRadius: '50%', objectFit: 'cover' as const, flexShrink: 0 }} />
                      ) : (
                        <div style={{ width: 40, height: 40, borderRadius: '50%', flexShrink: 0, background: 'var(--sec-2)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 14, color: 'var(--wg-500)' }}>{initials}</div>
                      )}
                      <div style={{ minWidth: 0, flex: '1 1 0%' }}>
                        <div style={{ fontWeight: 600, fontSize: 17, letterSpacing: 0 }}>{c.name}</div>
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: '10.5px', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase' as const, color: 'var(--lime-700)', marginTop: 5 }}>
                          <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--lime-700)' }} />Active
                        </span>
                      </div>
                      <Link href={`/deals/new?from=${c.latestDealId}`} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, flexShrink: 0, background: 'var(--lime-400)', borderRadius: 'var(--radius-pill)', padding: '9px 16px', fontWeight: 700, fontSize: '12.5px', color: 'var(--lime-950)', boxShadow: 'rgba(180,215,50,0.85) 0px 10px 20px -10px', textDecoration: 'none' }}>
                        View deals
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m9 18 6-6-6-6" /></svg>
                      </Link>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14, marginTop: 22, paddingTop: 20, borderTop: '1px solid var(--line)' }}>
                      <div>
                        <div style={creatorStatVal}>{formatRupees(c.totalPaise)}</div>
                        <div className="t-meta" style={{ color: 'var(--meta)', marginTop: 6 }}>paid out</div>
                      </div>
                      <div>
                        <div style={creatorStatVal}>{c.dealCount}</div>
                        <div className="t-meta" style={{ color: 'var(--meta)', marginTop: 6 }}>deals</div>
                      </div>
                      <div />
                    </div>
                  </div>
                )
              })}
            </div>
          </section>
        )}

        {/* ── BOTTOM CTA CARD ─────────────────────────────── */}
        <section style={{ marginTop: 'clamp(52px, 6vw, 80px)', borderRadius: 24, background: 'linear-gradient(135deg, #FFFFFF 0%, #FAFAFA 50%, #F3F3F0 100%)', boxShadow: 'var(--sh-2)', padding: 'clamp(40px, 5vw, 64px) clamp(28px, 4vw, 48px)', position: 'relative', overflow: 'hidden' }}>
          <div style={{ position: 'absolute', top: 0, right: 0, width: '50%', height: '100%', background: 'linear-gradient(135deg, transparent 0%, rgba(243,243,240,0.6) 100%)', pointerEvents: 'none' }} />
          <h2 style={{ fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: 'clamp(28px, 3.6vw, 42px)', letterSpacing: '-0.025em', lineHeight: 1.15, margin: 0, color: 'var(--ink)', position: 'relative', zIndex: 1 }}>
            Creator campaigns<br />without the <span style={{ fontFamily: 'var(--font-serif)', fontStyle: 'italic', fontWeight: 400, letterSpacing: 0, fontSize: '1.05em' }}>chaos</span>.
          </h2>
          <p style={{ fontFamily: 'var(--font-ui)', fontSize: 14.5, color: '#5C5E52', lineHeight: 1.6, margin: '18px 0 0', maxWidth: 440, position: 'relative', zIndex: 1 }}>
            One home for offers, contracts, content and payments &mdash; so you can focus on the work, not the chasing.
          </p>
          <Link href="/campaigns" style={{ ...neonBtnStyle, marginTop: 26, position: 'relative', zIndex: 1 }}>
            Plan your next campaign
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m9 18 6-6-6-6" /></svg>
          </Link>
        </section>

      </div>
    </main>
  )
}

// ── Sub-components ──────────────────────────────────────────

function NameHighlight({ name }: { name: string }) {
  return (
    <span style={{ position: 'relative', display: 'inline-block' }}>
      <span aria-hidden="true" style={{ position: 'absolute', inset: '24% -0.06em 16%', background: 'var(--lime-400)', borderRadius: 14, transform: 'rotate(-1.6deg)', zIndex: 0 }} />
      <span style={{ position: 'relative', zIndex: 1, fontFamily: 'var(--font-serif)', fontStyle: 'italic', fontWeight: 400, letterSpacing: 0, fontSize: '1.12em' }}>{name}</span>
    </span>
  )
}

function AttentionRow({ icon, label, sublabel, action, href, first }: {
  icon: React.ReactNode; label: string; sublabel: React.ReactNode; action: string; href: string; first: boolean
}) {
  return (
    <Link href={href} className="drow" style={{
      display: 'grid',
      gridTemplateColumns: 'auto 1fr auto auto',
      alignItems: 'center',
      gap: 16,
      padding: '18px 12px',
      borderRadius: 12,
      textDecoration: 'none',
      color: 'inherit',
      borderTop: first ? 'none' : '1px solid var(--hair)',
    }}>
      <span style={{ width: 40, height: 40, borderRadius: 12, background: 'rgb(238,240,234)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
        {icon}
      </span>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontWeight: 600, fontSize: '14.5px', color: 'var(--ink)' }}>{label}</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 7, flexWrap: 'wrap' as const, fontSize: 12, color: 'var(--wg-500)', marginTop: 3 }}>
          {sublabel}
        </div>
      </div>
      <span className="pillbtn" style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 112, height: 40, borderRadius: 'var(--radius-pill)', fontWeight: 700, fontSize: '12.5px', color: 'var(--lime-950)', background: 'var(--lime-400)', border: '1px solid transparent', boxShadow: 'rgba(180,215,50,0.9) 0px 10px 20px -10px' }}>{action}</span>
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#9A9C8E" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m9 18 6-6-6-6" /></svg>
    </Link>
  )
}

function DealBreadcrumb({ status }: { status: string }) {
  const stages = ['Offer', 'Terms', 'Content', 'Paid']
  const activeMap: Record<string, string> = {
    negotiating: 'Offer',
    agreed: 'Terms',
    delivered: 'Content',
    revision: 'Content',
    approved: 'Content',
    paid: 'Paid',
    complete: 'Paid',
  }
  const activeStage = activeMap[status] ?? 'Offer'

  return (
    <>
      {stages.map((s, i) => (
        <span key={s}>
          {i > 0 && <span style={{ color: 'rgb(198,200,186)' }}> &middot; </span>}
          <span style={s === activeStage ? { color: 'var(--ink)', fontWeight: 700 } : { color: 'rgb(198,200,186)' }}>{s}</span>
        </span>
      ))}
    </>
  )
}

function DealStatusLabel({ status }: { status: string }) {
  const map: Record<string, { label: string; bg: string }> = {
    negotiating: { label: 'Negotiating', bg: 'var(--sec-2)' },
    agreed: { label: 'Agreed — awaiting content', bg: 'var(--sec-2)' },
    delivered: { label: 'Submitted — to review', bg: 'var(--lime-200)' },
    revision: { label: 'Revision requested', bg: 'var(--sec-2)' },
    approved: { label: 'Approved — awaiting payment', bg: 'var(--sec-2)' },
  }
  const s = map[status] ?? { label: status, bg: 'var(--sec-2)' }
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', fontSize: 11, fontWeight: 600, color: 'var(--lime-950)', background: s.bg, padding: '4px 11px', borderRadius: 'var(--radius-pill)' }}>
      {s.label}
    </span>
  )
}

// ── Chart helpers ───────────────────────────────────────────

const MONTH_LABELS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

function computeMonthlySpend(invoices: InvoiceRow[]): { label: string; total: number }[] {
  const now = new Date()
  const months: { label: string; total: number }[] = []
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    months.push({ label: MONTH_LABELS[d.getMonth()]!, total: 0 })
  }

  for (const inv of invoices) {
    if (inv.status !== 'paid' || !inv.paid_at) continue
    const pd = new Date(inv.paid_at)
    for (let mi = 0; mi < months.length; mi++) {
      const ref = new Date(now.getFullYear(), now.getMonth() - (5 - mi), 1)
      if (pd.getFullYear() === ref.getFullYear() && pd.getMonth() === ref.getMonth()) {
        months[mi]!.total += inv.brand_pays_paise ?? 0
        break
      }
    }
  }
  return months
}

function SpendChart({ data }: { data: { label: string; total: number }[] }) {
  if (data.length === 0 || data.every((d) => d.total === 0)) {
    return (
      <div style={{ padding: '40px 0', textAlign: 'center' as const, color: 'var(--wg-500)', fontSize: 13 }}>
        No spend data yet
      </div>
    )
  }

  const W = 900, H = 270, PL = 60, PR = 40, PT = 24, PB = 50
  const maxVal = Math.max(...data.map((d) => d.total), 1)
  // Round max up to nice number for axis
  const niceMax = maxVal <= 0 ? 100 : Math.ceil(maxVal / 10000000) * 10000000 > maxVal * 1.5
    ? Math.ceil(maxVal / 1000000) * 1000000
    : Math.ceil(maxVal / 10000000) * 10000000
  const usableW = W - PL - PR
  const usableH = H - PT - PB

  const points = data.map((d, i) => {
    const x = PL + (i / Math.max(data.length - 1, 1)) * usableW
    const y = PT + usableH - (d.total / niceMax) * usableH
    return { x, y, label: d.label, total: d.total }
  })

  const polyline = points.map((p) => `${p.x},${p.y}`).join(' ')
  const areaPath = `M${points[0]!.x},${points[0]!.y} ${points.slice(1).map((p) => `L${p.x},${p.y}`).join(' ')} L${points[points.length - 1]!.x},${PT + usableH} L${points[0]!.x},${PT + usableH} Z`

  const midY = PT + usableH / 2
  const midVal = niceMax / 2

  return (
    <div style={{ position: 'relative' }}>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" preserveAspectRatio="xMidYMid meet" style={{ display: 'block', overflow: 'visible' }}>
        <defs>
          <linearGradient id="areaG" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" style={{ stopColor: 'var(--sec-mid)', stopOpacity: 0.7 }} />
            <stop offset="55%" style={{ stopColor: 'var(--sec-2)', stopOpacity: 0.5 }} />
            <stop offset="100%" style={{ stopColor: 'var(--sec)', stopOpacity: 0 }} />
          </linearGradient>
        </defs>
        {/* Grid lines */}
        <g stroke="rgba(26,27,22,.06)" strokeWidth="1">
          <line x1={PL} y1={PT + usableH} x2={W - PR} y2={PT + usableH} />
          <line x1={PL} y1={midY} x2={W - PR} y2={midY} />
          <line x1={PL} y1={PT} x2={W - PR} y2={PT} />
        </g>
        {/* Y-axis labels */}
        <g fill="var(--meta)" fontSize="9.5" fontWeight="500" letterSpacing=".14em" textAnchor="end">
          <text x={PL - 10} y={PT + usableH + 3}>₹0</text>
          <text x={PL - 10} y={midY + 3}>{formatRupees(midVal)}</text>
          <text x={PL - 10} y={PT + 3}>{formatRupees(niceMax)}</text>
        </g>
        {/* Area fill */}
        <path d={areaPath} fill="url(#areaG)" />
        {/* Line */}
        <polyline points={polyline} fill="none" stroke="var(--ink)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
        {/* Dots */}
        <g stroke="var(--ink)" strokeWidth="2" fill="var(--card)">
          {points.slice(0, -1).map((p, i) => (
            <circle key={i} cx={p.x} cy={p.y} r="4" />
          ))}
        </g>
        {/* Last dot (neon) */}
        <circle cx={points[points.length - 1]!.x} cy={points[points.length - 1]!.y} r="6" fill="var(--lime-400)" stroke="var(--ink)" strokeWidth="2.4" />
        {/* X-axis labels */}
        <g fill="var(--meta)" fontSize="9.5" fontWeight="500" letterSpacing=".14em" textAnchor="middle">
          {points.slice(0, -1).map((p, i) => (
            <text key={i} x={p.x} y={PT + usableH + 22}>{p.label.toUpperCase()}</text>
          ))}
        </g>
        {/* Current month label */}
        <g textAnchor="middle">
          <text x={points[points.length - 1]!.x} y={PT + usableH + 22} fill="var(--lime-700)" fontSize="9.5" fontWeight="800" letterSpacing=".1em">{points[points.length - 1]!.label.toUpperCase()}</text>
          <text x={points[points.length - 1]!.x} y={PT + usableH + 36} fill="var(--wg-400)" fontSize="7.5" fontWeight="700" letterSpacing=".16em">NOW</text>
        </g>
      </svg>
    </div>
  )
}

// ── Helpers ─────────────────────────────────────────────────

function formatRupees(paise: number): string {
  const rupees = paise / 100
  if (rupees >= 10000000) return `₹${(rupees / 10000000).toFixed(1)}Cr`
  if (rupees >= 100000) return `₹${(rupees / 100000).toFixed(1)}L`
  if (rupees >= 1000) return `₹${(rupees / 1000).toFixed(0)}K`
  return `₹${rupees.toLocaleString('en-IN')}`
}

// ── Styles (exact match to Chandreyee's Brand Dashboard v3 HTML) ──

const heroH1Style: React.CSSProperties = {
  fontFamily: 'var(--font-heading)',
  fontWeight: 700,
  letterSpacing: '-0.025em',
  lineHeight: 1,
  fontSize: 'clamp(46px, 5.8vw, 74px)',
  margin: '12px 0 0',
  color: 'var(--ink)',
}

const badgeRowStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 10,
  marginTop: 18,
  fontSize: 13,
  color: 'var(--wg-600)',
  flexWrap: 'wrap',
}

const badgeDotStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 6,
}

const dotSep: React.CSSProperties = {
  width: 3,
  height: 3,
  borderRadius: '50%',
  background: 'rgb(180,182,168)',
  display: 'inline-block',
}

const ghostBtnStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 8,
  padding: '12px 18px',
  borderRadius: 'var(--radius-pill)',
  background: 'var(--card)',
  border: '1px solid var(--line)',
  fontWeight: 600,
  fontSize: 13,
  color: 'var(--ink)',
  textDecoration: 'none',
}

const neonBtnStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 8,
  padding: '12px 20px',
  borderRadius: 'var(--radius-pill)',
  background: 'var(--lime-400)',
  border: '1px solid transparent',
  fontWeight: 700,
  fontSize: 13,
  color: 'var(--lime-950)',
  boxShadow: 'rgba(180,215,50,0.7) 0px 14px 26px -12px',
  textDecoration: 'none',
}

const kpiCardStyle: React.CSSProperties = {
  padding: 'clamp(22px, 2.2vw, 30px)',
  display: 'flex',
  flexDirection: 'column',
  border: '1px solid #EAEAE3',
  borderRadius: 16,
  background: 'var(--card)',
}

const kpiCellStyle: React.CSSProperties = {
  padding: 'clamp(22px, 2.2vw, 30px)',
  display: 'flex',
  flexDirection: 'column',
}

const kpiBigNum: React.CSSProperties = {
  fontWeight: 700,
  fontSize: 'clamp(44px, 5vw, 66px)',
  lineHeight: 0.9,
  letterSpacing: '-0.045em',
  color: 'var(--ink)',
}

const kpiMedNum: React.CSSProperties = {
  fontWeight: 700,
  fontSize: 'clamp(28px, 3.1vw, 38px)',
  lineHeight: 0.9,
  letterSpacing: '-0.045em',
  color: 'var(--ink)',
}

const sectionH2Style: React.CSSProperties = {
  fontFamily: 'var(--font-heading)',
  fontWeight: 700,
  letterSpacing: '-0.025em',
  fontSize: 'clamp(23px, 2.2vw, 26px)',
  margin: '14px 0 0',
}

const creatorStatVal: React.CSSProperties = {
  fontWeight: 700,
  fontSize: 26,
  letterSpacing: '-0.045em',
  color: 'var(--ink)',
}

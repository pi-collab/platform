import { experienceStaffGate } from '@/lib/experience-staff-auth'
import { listLegThreads } from '@/lib/experience-console-server'
import { countDealsByTab, dealMatchesTab } from '@/lib/deal-tabs'
import DealsTable, { type StageConfig } from '@/app/deals/DealsTable'
import type { LegStage } from '@/lib/experience-console-server'
import NoAccess from '../NoAccess'

export const dynamic = 'force-dynamic'

const PAGE_SIZE = 20

/* 0565: the pill says where the deal really is. Tones follow the Deals list:
   blue offer, violet in production, amber Guapd's move, lime/green nearly done. */
const T = {
  blue: { dot: '#4A7FB0', bg: '#E7F1FC' }, violet: { dot: '#7E6BC4', bg: '#F0EAFD' }, amber: { dot: '#C89A3C', bg: '#FCF6E4' },
  lime: { dot: '#8FAF1F', bg: '#F4FBDC' }, green: { dot: '#4C9E82', bg: '#E9F7F0' }, grey: { dot: '#9AA08C', bg: '#F2F3EE' }, red: { dot: '#C4494F', bg: '#FDF0F0' },
}
const day = (d: string | null) => d ? new Date(`${d}T00:00:00`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) : ''
function legStage(s: LegStage | null): StageConfig | null {
  if (!s) return null
  switch (s.key) {
    case 'offer': return { label: 'Offer with creator', ...T.blue, hot: false }
    case 'creator_countered': return { label: 'Creator countered', ...T.amber, hot: true }
    case 'shoot_ahead': return { label: s.shoot_date ? `Shoot ${day(s.shoot_date)}` : 'Shoot to schedule', ...T.violet, hot: false }
    case 'record_shoot': return { label: 'Record the shoot', ...T.amber, hot: true }
    case 'did_not_shoot': return { label: 'Did not shoot', ...T.red, hot: false }
    case 'videos': return { label: `Videos ${s.approved} of ${s.total} approved`, ...T.violet, hot: false }
    case 'posting': return { label: s.waiting > 0 ? `${s.waiting} collab post${s.waiting === 1 ? '' : 's'} to come` : 'Posting', ...T.lime, hot: false }
    case 'invoice_due': return { label: 'Waiting for invoice', ...T.lime, hot: false }
    case 'to_pay': return { label: 'Invoice in · to pay', ...T.amber, hot: true }
    case 'payout': return { label: s.payout_status === 'requested' ? 'Payout to approve' : 'Payout on its way', ...T.green, hot: s.payout_status === 'requested' }
    case 'paid': return { label: 'Paid', ...T.grey, hot: false }
    case 'declined': return { label: 'Declined', ...T.red, hot: false }
    case 'cancelled': return { label: 'Cancelled', ...T.grey, hot: false }
  }
}
/* Guapd's move: a creator counter, a shoot to record, an invoice to pay, a payout to approve. */
const GUAPD_MOVE = new Set(['creator_countered', 'record_shoot', 'to_pay'])
const TABS = ['all', 'needs_you', 'negotiating', 'agreed', 'delivered', 'paid', 'declined']

/**
 * Every deal Guapd has sent to a creator from an Experience, on the brand Deals
 * list's design (6.1). Staff-only. Read through the gated thread list; no
 * money on the list (amounts stay behind the Experience's operational screens).
 */
export default async function ConsoleDealsPage({ searchParams }: { searchParams?: { q?: string; status?: string; page?: string } }) {
  const gate = await experienceStaffGate()
  if (!gate.ok) return <NoAccess reason={gate.reason} />
  const r = await listLegThreads(null)
  const rows = r.ok ? r.data : []
  // A creator countered and Guapd has not answered: Guapd's move.
  // Tabs: "Needs you" is Guapd's move; "Posted · paid" once the main payout is paid.
  const all = rows.map((x) => {
    const k = x.stage?.key
    const move = (k != null && GUAPD_MOVE.has(k)) || (x.stage?.key === 'payout' && x.stage.payout_status === 'requested')
    return { x, countable: { status: k === 'paid' ? 'paid' : move && x.status !== 'negotiating' ? 'delivered' : x.status, is_posted: false, awaiting_brand: move } }
  })

  const status = searchParams?.status && TABS.includes(searchParams.status) ? searchParams.status : null
  const q = (searchParams?.q ?? '').replace(/[^a-zA-Z0-9 \-]/g, '').trim().slice(0, 100).toLowerCase()
  const filtered = all.filter(({ x, countable }) =>
    (!status || dealMatchesTab(countable, status)) &&
    (!q || `${x.creator_name} ${x.experience_title} ${x.brand_name} ${x.deal_ref ?? ''}`.toLowerCase().includes(q)))
  const page = Math.max(1, parseInt(searchParams?.page ?? '1', 10) || 1)
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const slice = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  const deals = slice.map(({ x }) => ({
    id: x.deal_id, deal_ref: x.deal_ref, title: x.experience_title, deliverables: x.brand_name,
    price_paise: null, fee_percent: null, fee_mode: null, price_per_extra_revision_paise: null,
    revisions_used: null, revision_limit: null, status: x.status, is_posted: false,
    created_at: x.sent_at ?? new Date(0).toISOString(), track: null,
    creator: { id: x.deal_id, full_name: x.creator_name, profile_photo_url: x.creator_photo },
    invoiceStatus: null, invoiceDueDate: null, stage: legStage(x.stage),
  }))

  return (
    <main style={{ position: 'relative', zIndex: 1, padding: 'clamp(20px, 3vw, 40px) clamp(18px, 4vw, 44px) clamp(56px, 6vw, 90px)', maxWidth: 1200, margin: '0 auto', boxSizing: 'content-box' }}>
      <section style={{ borderRadius: 24, background: 'var(--card)', padding: 'clamp(26px, 3vw, 40px) clamp(24px, 3vw, 40px) clamp(28px, 3.4vw, 40px)' }}>
        <h1 style={{ fontFamily: 'var(--font-display)', fontWeight: 600, letterSpacing: '-0.02em', lineHeight: 1, fontSize: 'clamp(34px, 4.4vw, 44px)', margin: 0, color: 'var(--ink)' }}>
          Experience <span style={{ fontFamily: 'var(--font-serif)', fontStyle: 'italic', fontWeight: 400, fontSize: '1.05em', letterSpacing: 0 }}>deals</span>
        </h1>
        <p style={{ fontFamily: 'var(--font-ui)', fontSize: 14, color: 'var(--wg-600)', margin: '8px 0 0' }}>
          {r.ok ? `${rows.length} deal${rows.length === 1 ? '' : 's'} sent to creators across every Experience.` : `Could not load the deals: ${r.error}`}
        </p>
      </section>
      <DealsTable deals={deals} currentStatus={status} currentQuery={searchParams?.q ?? ''} currentPage={page} totalPages={totalPages}
        totalCount={filtered.length} tabCounts={countDealsByTab(all.map((a) => a.countable), TABS)} creatorFilter={null} pageSize={PAGE_SIZE}
        basePath="/experiences-admin/deals" />
    </main>
  )
}

import { experienceStaffGate } from '@/lib/experience-staff-auth'
import { listLegThreads } from '@/lib/experience-console-server'
import { countDealsByTab, dealMatchesTab } from '@/lib/deal-tabs'
import DealsTable from '@/app/deals/DealsTable'
import NoAccess from '../NoAccess'

export const dynamic = 'force-dynamic'

const PAGE_SIZE = 20
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
  const all = rows.map((x) => ({ x, countable: { status: x.status, is_posted: false, awaiting_brand: x.open_counter?.proposed_by === 'creator' } }))

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
    invoiceStatus: null, invoiceDueDate: null,
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

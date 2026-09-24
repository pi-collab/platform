import { createClient } from '@/lib/supabase/server'
import BrandDealsEmpty from './BrandDealsEmpty'
import HeldNotice from '@/components/HeldNotice'
import { verifyBrand } from '@/lib/brand-auth'
import Link from 'next/link'
import DealsTable from './DealsTable'
import { countDealsByTab, TAB_STATUSES } from '@/lib/deal-tabs'

const PAGE_SIZE = 20

/** Whitelist search query to alphanumeric, space, hyphen only. */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function sanitizeQuery(raw: string | null | undefined): string {
  if (!raw) return ''
  return raw.replace(/[^a-zA-Z0-9 \-]/g, '').trim().slice(0, 100)
}

/** Validate that a string is one of the known deal statuses or virtual filters. */
function validStatus(s: string | null | undefined): string | null {
  const VALID = new Set(['negotiating', 'agreed', 'delivered', 'revision', 'approved', 'paid', 'complete', 'declined', 'cancelled', 'needs_you'])
  return s && VALID.has(s) ? s : null
}

export default async function DealsListPage({
  searchParams,
}: {
  searchParams: { q?: string; status?: string; page?: string; sort?: string; creator?: string }
}) {
  const brand = await verifyBrand()

  const q = sanitizeQuery(searchParams.q)
  const status = validStatus(searchParams.status)
  /* One creator's deals, arrived at from the dashboard's "View deals". Validated
     as a uuid rather than passed through: it goes into .eq() on a scoped query,
     and an unparseable value should narrow to nothing rather than error. The
     tab counts and the KPI row are narrowed with it, so a tab never counts
     deals the list below cannot show. */
  const creatorId = UUID_RE.test(searchParams.creator ?? '') ? searchParams.creator! : null
  const page = Math.max(1, parseInt(searchParams.page ?? '1', 10) || 1)
  const from = (page - 1) * PAGE_SIZE
  const to = from + PAGE_SIZE - 1

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

  // Build query -- RLS scopes to brand's own deals
  let query = supabase
    .from('deals')
    .select('id, deal_ref, title, deliverables, price_paise, fee_percent, fee_mode, price_per_extra_revision_paise, revisions_used, revision_limit, status, is_posted, held_at, created_at, track, creators(id, full_name, profile_photo_url)', { count: 'exact' })

  // Status filter (server-side)
  // Built from TAB_STATUSES, the same definition the counts use. They were
  // written out separately here and in the component, which is how a tab could
  // filter on one rule and count on another.
  /* WHOSE MOVE a negotiation is. The creator's counter is an event, not a
     status - deals.last_offer_by looks like the answer and is never updated -
     so the ids are resolved here and used by BOTH the filter below and the tab
     counts. Computing it twice is how a tab comes to count one thing and show
     another, which is the bug this file's own comment describes. */
  const awaitingBrandIds = new Set<string>()
  {
    const { data: negotiating } = await supabase
      .from('deals').select('id').eq('status', 'negotiating')
    const ids = (negotiating ?? []).map((d) => d.id)
    if (ids.length > 0) {
      const { data: evts } = await supabase
        .from('events')
        .select('deal_id, event_type, created_at')
        .in('deal_id', ids)
        .in('event_type', ['deal.counter_offer', 'deal.brand_counter'])
        .order('created_at', { ascending: true })
      const lastBy = new Map<string, string>()
      for (const e of evts ?? []) lastBy.set(e.deal_id, e.event_type)
      for (const [id, type] of Array.from(lastBy.entries())) {
        if (type === 'deal.counter_offer') awaitingBrandIds.add(id)
      }
    }
  }

  if (status === 'needs_you') {
    /* Work to review, OR a counter to answer. Expressed as one .or() so the
       rows match the count exactly. */
    const ids = Array.from(awaitingBrandIds)
    query = ids.length > 0
      ? query.or(`status.in.(${TAB_STATUSES.needs_you.join(',')}),id.in.(${ids.join(',')})`)
      : query.in('status', TAB_STATUSES.needs_you)
  } else if (status === 'paid') {
    // The only tab that also matches a flag, so it cannot be a plain .in().
    query = query.or(`status.in.(${TAB_STATUSES.paid.join(',')}),is_posted.eq.true`)
  } else if (status && TAB_STATUSES[status]) {
    query = query.in('status', TAB_STATUSES[status])
  } else if (status) {
    query = query.eq('status', status)
  }

  if (creatorId) query = query.eq('creator_id', creatorId)

  /* Search -- sanitized q is safe for ILIKE and .or() filter string.

     The CREATOR's name is part of it, which it was not before: a brand
     searching "Sneha" got nothing, because the text was only matched against
     the deal's own columns. The name lives on another table, and PostgREST
     cannot OR a filter on an embedded resource against filters on base
     columns, so the matching creators are resolved first and their ids join
     the same .or(). Capped, because this is a filter clause, not a report. */
  if (q) {
    const { data: matchedCreators } = await supabase
      .from('creators')
      .select('id')
      .ilike('full_name', `%${q}%`)
      .limit(50)
    const creatorIds = (matchedCreators ?? []).map((c) => c.id)
    const clauses = [`deal_ref.ilike.%${q}%`, `title.ilike.%${q}%`, `deliverables.ilike.%${q}%`]
    if (creatorIds.length > 0) clauses.push(`creator_id.in.(${creatorIds.join(',')})`)
    query = query.or(clauses.join(','))
  }

  // Order + paginate
  query = query.order('created_at', { ascending: false }).range(from, to)

  // Also fetch ALL deals (unfiltered) for KPI computation + invoices
  const [{ data: deals, error, count }, { data: invoices }, { data: allDealsForKpi }, { data: dealCensus }] = await Promise.all([
    query,
    supabase.from('invoices').select('deal_id, status, due_date'),
    (() => {
      /* Only the status is read now: the counters are counts, and the fee
         columns were here for a "committed" figure the design replaced with
         "total deals". */
      let k = supabase
        .from('deals')
        .select('id, status')
        .not('status', 'in', '(cancelled,declined)')
      if (creatorId) k = k.eq('creator_id', creatorId)
      return k
    })(),
    // Every deal, unpaginated, for the tab counts. Separate from the KPI query
    // above because that one excludes cancelled and declined, and the Declined
    // tab needs to count exactly those. Narrowed by creator alongside the list
    // so the tabs and the rows agree.
    (() => {
      let c = supabase.from('deals').select('id, status, is_posted')
      if (creatorId) c = c.eq('creator_id', creatorId)
      return c
    })(),
  ])

  if (error) {
    return (
      <main style={container}>
        <p style={{ color: '#dc2626' }}>Error loading deals: {error.message}</p>
      </main>
    )
  }

  // Index invoices by deal_id
  const invoiceMap = new Map<string, { status: string; due_date: string | null }>()
  for (const inv of invoices ?? []) {
    invoiceMap.set(inv.deal_id, { status: inv.status, due_date: inv.due_date })
  }

  const all = (deals ?? []).map((d) => {
    const raw = d.creators as unknown
    const creator = Array.isArray(raw) ? raw[0] ?? null : (raw as { id: string; full_name: string; profile_photo_url: string | null } | null)
    const inv = invoiceMap.get(d.id) ?? null
    return { ...d, creator, invoiceStatus: inv?.status ?? null, invoiceDueDate: inv?.due_date ?? null }
  })

  /* Whose deals the chip names. Taken from a row where there is one, looked up
     where the creator filter and a status tab have narrowed to nothing — a chip
     that reads "this creator" tells the brand less than no chip at all. */
  let creatorFilterName = ''
  if (creatorId) {
    creatorFilterName = all.find((d) => d.creator?.id === creatorId)?.creator?.full_name ?? ''
    if (!creatorFilterName) {
      const { data: cr } = await supabase
        .from('creators').select('full_name').eq('id', creatorId).maybeSingle()
      creatorFilterName = cr?.full_name ?? 'this creator'
    }
  }

  const totalCount = count ?? 0
  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE))

  /* ── Counters ─────────────────────────────────────────────────────────────
     Over every deal the brand has, not the current page.

     "Live right now" is the deals IN FLIGHT. It read `is_posted === true`
     before, which counts FINISHED deals — the opposite of what the label says,
     and the number a brand would use to decide whether anything is running.

     "Total deals" counts everything including declined, which is what a total
     means; the census is the query that keeps those. */
  const kpiDeals = allDealsForKpi ?? []
  const HOT_STATUSES = new Set(['negotiating', 'delivered', 'approved'])
  const DONE_STATUSES = new Set(['paid', 'complete', 'declined', 'cancelled'])
  const needsActionCount = kpiDeals.filter((d) => HOT_STATUSES.has(d.status)).length
  const liveCount = kpiDeals.filter((d) => !DONE_STATUSES.has(d.status)).length
  const totalDealsEver = (dealCensus ?? []).length

  // Held deals belong to a brand not yet cleared to send. Surfaced FIRST and
  // prominently — a brand seeing no creator response with no explanation
  // assumes the product is broken, and may re-send and create duplicates.

  // The genuinely-empty screen. Returned BEFORE the hero: the drawn state
  // carries its own "My deals" heading and counters, so rendering it inside
  // the existing hero would put two headings on one page.
  //
  // HeldNotice stays above it. A brand whose first deal is sitting unsent needs
  // that before anything else, and the design has nowhere to put a banner.
  if (totalCount === 0 && !q && !status && !creatorId) {
    return (
      // NOT `container`. That caps at 1080 and the drawn screen sets its own
      // 1200, the same width the brand dashboard's empty state uses; nested, the
      // narrower cap wins and the two screens disagree by 120px.
      //
      // HeldNotice keeps the page width, since it belongs to the page rather
      // than to the drawn screen.
      <main style={{ position: 'relative', zIndex: 1, padding: 'clamp(20px, 3vw, 40px) clamp(18px, 4vw, 44px) clamp(56px, 6vw, 90px)' }}>
        <div style={{ maxWidth: 1200, margin: '0 auto' }}>
          <HeldNotice
            heldCount={heldCount ?? 0}
            status={brand.brandStatus}
            rejectionReason={brand.rejectionReason}
            showDealsLink={false}
          />
        </div>
        <BrandDealsEmpty />
      </main>
    )
  }
  
  return (
    <main style={container}>

      <HeldNotice
        heldCount={heldCount ?? 0}
        status={brand.brandStatus}
        rejectionReason={brand.rejectionReason}
        showDealsLink={false}
      />

      {/* ══════ HERO ══════
          Transcribed from "Brand Deals": the title and the one button on one
          row, then the counters as a hairline-divided plate inside the same
          card — the shape the brand dashboard's hero already uses. */}
      <section style={heroCard}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 24, flexWrap: 'wrap' as const }}>
          <div style={{ flex: 1, minWidth: 240 }}>
            <h1 style={{ fontFamily: 'var(--font-display)', fontWeight: 600, letterSpacing: '-0.02em', lineHeight: 1, fontSize: 'clamp(34px, 4.4vw, 44px)', margin: 0, color: 'var(--ink)' }}>
              My <span style={{ fontFamily: 'var(--font-serif)', fontStyle: 'italic', fontWeight: 400, fontSize: '1.05em', letterSpacing: 0 }}>deals</span>
            </h1>
            <p style={{ fontFamily: 'var(--font-ui)', fontSize: 14, color: 'var(--wg-600)', margin: '8px 0 0' }}>
              Everything you have running with creators, newest first.
            </p>
          </div>
          <Link href="/browse" className="neonbtn" style={neonBtnStyle}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 9h18v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /><path d="M8 9V6a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v3" /><path d="M3 9h18" /><path d="M11 13h2" />
            </svg>
            New deal
          </Link>
        </div>

        {/* ── Counters ──
            "Live right now" means deals IN FLIGHT — not declined, not finished.
            It counted posted deals before, which is the opposite thing and made
            a brand with nine deals running read zero. */}
        <div className="kpis" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 0, marginTop: 24, borderRadius: 16, background: 'var(--card)', boxShadow: 'var(--sh-2)', overflow: 'hidden' }}>
          <Link href="/deals?status=needs_you" style={{ ...kpiCell, textDecoration: 'none', color: 'inherit' }} className="kpicell">
            <div style={kpiLabel}>Needs your action</div>
            <div style={kpiValue}>{needsActionCount}</div>
          </Link>
          <div style={{ ...kpiCell, borderLeft: '1px solid var(--hair)' }}>
            <div style={kpiLabel}>Live right now</div>
            <div style={kpiValue}>{liveCount}</div>
          </div>
          <div style={{ ...kpiCell, borderLeft: '1px solid var(--hair)' }}>
            <div style={kpiLabel}>Total deals</div>
            <div style={kpiValue}>{totalDealsEver}</div>
          </div>
        </div>
      </section>

      {/* ══════ DEALS LIST (or empty state) ══════ */}
      {/* The empty case returns earlier, with the drawn screen. Reaching here
          means there are deals, or a search or filter is narrowing them, and a
          zero-result search wants the table and its controls, not a first-run
          screen telling someone to start their first deal. */}
      <DealsTable
        deals={all}
        currentStatus={status}
        currentQuery={q}
        /* The name, not the id: the chip has to say whose deals these are, and
           the id is already in the URL. */
        creatorFilter={creatorId ? { id: creatorId, name: creatorFilterName } : null}
        currentPage={page}
        totalPages={totalPages}
        totalCount={totalCount}
        /* Passed, not mirrored: the range label needs the server's page size,
           and a second copy of the number is a thing that drifts. */
        pageSize={PAGE_SIZE}
        /* The census carries the same awaiting_brand flag the filter above
           used, so the number on a tab is the number of rows behind it. */
        tabCounts={countDealsByTab(
          ((dealCensus ?? []) as { id: string; status: string; is_posted?: boolean | null }[])
            .map((d) => ({ ...d, awaiting_brand: awaitingBrandIds.has(d.id) })),
          ['needs_you', 'negotiating', 'agreed', 'delivered', 'paid', 'declined'],
        )}
      />
    </main>
  )
}


// ── Styles ──
const container: React.CSSProperties = {
  position: 'relative',
  zIndex: 1,
  padding: 'clamp(20px, 3vw, 40px) clamp(18px, 4vw, 44px) clamp(56px, 6vw, 90px)',
  maxWidth: 1200,
  margin: '0 auto',
  /* content-box so the cap measures the CONTENT. With the global border-box,
     the padding above would come out of the 1200 and leave ~1112 — which is
     why this page looked narrower than dashboard and browse, both of which pad
     an outer wrapper and cap an inner div. */
  boxSizing: 'content-box',
}

const heroCard: React.CSSProperties = {
  borderRadius: 24,
  background: 'var(--card)',
  padding: 'clamp(26px, 3vw, 40px) clamp(24px, 3vw, 40px) clamp(28px, 3.4vw, 40px)',
}

const kpiCell: React.CSSProperties = {
  padding: 'clamp(22px, 2.2vw, 30px)',
  display: 'flex',
  flexDirection: 'column',
}

const kpiLabel: React.CSSProperties = {
  fontFamily: 'var(--font-ui)',
  fontSize: 11,
  fontWeight: 700,
  letterSpacing: '0.08em',
  textTransform: 'uppercase',
  color: 'var(--wg-500)',
}

const kpiValue: React.CSSProperties = {
  fontFamily: 'var(--font-ui)',
  fontWeight: 600,
  fontSize: 'clamp(34px, 3.6vw, 40px)',
  lineHeight: 1,
  letterSpacing: '-0.03em',
  color: 'var(--ink)',
  fontVariantNumeric: 'tabular-nums lining-nums',
  marginTop: 14,
}

const neonBtnStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 8,
  height: 46,
  padding: '0 22px',
  borderRadius: 999,
  background: 'var(--lime-400)',
  color: 'var(--lime-950)',
  fontFamily: 'var(--font-ui)',
  fontWeight: 700,
  fontSize: 13,
  textDecoration: 'none',
  whiteSpace: 'nowrap',
  border: 'none',
  cursor: 'pointer',
  flexShrink: 0,
  boxShadow: '0 8px 16px -8px rgba(180,215,50,.55)',
}

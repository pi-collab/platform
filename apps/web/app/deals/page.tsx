import { createClient } from '@/lib/supabase/server'
import HeldNotice from '@/components/HeldNotice'
import { verifyBrand } from '@/lib/brand-auth'
import Link from 'next/link'
import { calculateFee } from '@/lib/fee'
import DealsTable from './DealsTable'

const PAGE_SIZE = 20

/** Whitelist search query to alphanumeric, space, hyphen only. */
function sanitizeQuery(raw: string | null | undefined): string {
  if (!raw) return ''
  return raw.replace(/[^a-zA-Z0-9 \-]/g, '').trim().slice(0, 100)
}

/** Validate that a string is one of the known deal statuses or virtual filters. */
function validStatus(s: string | null | undefined): string | null {
  const VALID = new Set(['negotiating', 'agreed', 'delivered', 'revision', 'approved', 'paid', 'complete', 'declined', 'cancelled', 'needs_you'])
  return s && VALID.has(s) ? s : null
}

function brandTotal(d: { price_paise: number | null; fee_percent: number | null; fee_mode: string | null; price_per_extra_revision_paise: number | null; revisions_used: number | null; revision_limit: number | null }): number | null {
  if (d.price_paise == null || d.price_paise <= 0) return null
  const fee = calculateFee(d.price_paise, d.fee_percent ?? 0, (d.fee_mode as 'on_top' | 'deducted') ?? 'on_top')
  const extra = Math.max(0, (d.revisions_used ?? 0) - (d.revision_limit ?? 0))
  const overage = extra * (d.price_per_extra_revision_paise ?? 0)
  return fee.brand_pays_paise + overage
}

function formatRupees(paise: number): string {
  const rupees = paise / 100
  if (rupees >= 100_000) { const v = (rupees / 100_000); return `\u20B9${v % 1 === 0 ? v.toFixed(0) : v.toFixed(1)}L` }
  if (rupees >= 1_000) return `\u20B9${Math.round(rupees / 1_000)}K`
  return `\u20B9${rupees.toLocaleString('en-IN')}`
}

export default async function DealsListPage({
  searchParams,
}: {
  searchParams: { q?: string; status?: string; page?: string; sort?: string }
}) {
  const brand = await verifyBrand()

  const q = sanitizeQuery(searchParams.q)
  const status = validStatus(searchParams.status)
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
    .select('id, deal_ref, title, deliverables, price_paise, fee_percent, fee_mode, price_per_extra_revision_paise, revisions_used, revision_limit, status, is_posted, held_at, created_at, creators(id, full_name, profile_photo_url)', { count: 'exact' })

  // Status filter (server-side)
  if (status === 'needs_you') {
    query = query.in('status', ['negotiating', 'delivered', 'approved'])
  } else if (status === 'paid') {
    // "Posted" tab — includes paid, complete, and is_posted deals
    query = query.or('status.eq.paid,status.eq.complete,is_posted.eq.true')
  } else if (status === 'delivered') {
    // "In review" tab — includes delivered and revision
    query = query.in('status', ['delivered', 'revision'])
  } else if (status) {
    query = query.eq('status', status)
  }

  // Search -- sanitized q is safe for ILIKE and .or() filter string
  if (q) {
    query = query.or(`deal_ref.ilike.%${q}%,title.ilike.%${q}%,deliverables.ilike.%${q}%`)
  }

  // Order + paginate
  query = query.order('created_at', { ascending: false }).range(from, to)

  // Also fetch ALL deals (unfiltered) for KPI computation + invoices
  const [{ data: deals, error, count }, { data: invoices }, { data: allDealsForKpi }] = await Promise.all([
    query,
    supabase.from('invoices').select('deal_id, status, due_date'),
    supabase
      .from('deals')
      .select('id, price_paise, fee_percent, fee_mode, price_per_extra_revision_paise, revisions_used, revision_limit, status, is_posted')
      .not('status', 'in', '(cancelled,declined)'),
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

  const totalCount = count ?? 0
  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE))

  // ── KPIs (computed from ALL active deals, not just the current page) ──
  const kpiDeals = allDealsForKpi ?? []
  const HOT_STATUSES = new Set(['negotiating', 'delivered', 'approved'])
  const needsActionCount = kpiDeals.filter((d) => HOT_STATUSES.has(d.status)).length
  const liveCount = kpiDeals.filter((d) => d.is_posted === true).length
  const committedPaise = kpiDeals.reduce((sum, d) => {
    const bt = brandTotal(d)
    return sum + (bt ?? 0)
  }, 0)

  // Held deals belong to a brand not yet cleared to send. Surfaced FIRST and
  // prominently — a brand seeing no creator response with no explanation
  // assumes the product is broken, and may re-send and create duplicates.

  return (
    <main style={container}>

      <HeldNotice
        heldCount={heldCount ?? 0}
        status={brand.brandStatus}
        rejectionReason={brand.rejectionReason}
      />

      {/* ══════ HERO CARD ══════ */}
      <section style={heroCard}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 20, flexWrap: 'wrap' as const }}>
          <div>
            <h1 style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 'clamp(26px, 3vw, 34px)', letterSpacing: '-0.025em', lineHeight: 1.05, margin: 0, color: 'var(--ink)' }}>
              My <span style={{ fontFamily: 'var(--font-serif)', fontStyle: 'italic', fontWeight: 400, fontSize: '1.12em', letterSpacing: 0 }}>deals</span>
            </h1>
            <p style={{ fontFamily: 'var(--font-ui)', fontSize: 14, color: '#5C5E52', margin: '8px 0 0', lineHeight: 1.6 }}>
              Everything you have running with creators, newest first.</p>
          </div>
          <Link href="/browse" style={neonBtnStyle}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 5v14M5 12h14" /></svg>
            New deal
          </Link>
        </div>

        {/* ── KPI row ── */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 28, marginTop: 26, paddingTop: 24, borderTop: '1px solid #EAEAE3' }}>
          <Link href="/deals?status=needs_you" style={{ textDecoration: 'none', color: 'inherit', cursor: 'pointer' }}>
            <div style={kpiLabel}>Needs your action</div>
            <div style={kpiValue}>{needsActionCount}</div>
          </Link>
          <Link href="/deals?status=paid" style={{ textDecoration: 'none', color: 'inherit', paddingLeft: 28, borderLeft: '1px solid #EAEAE3', cursor: 'pointer' }}>
            <div style={kpiLabel}>Live right now</div>
            <div style={kpiValue}>{liveCount}</div>
          </Link>
          <div style={{ paddingLeft: 28, borderLeft: '1px solid #EAEAE3' }}>
            <div style={kpiLabel}>Committed &middot; you pay</div>
            <div style={{ position: 'relative', display: 'inline-block', marginTop: 10 }}>
              <span aria-hidden="true" style={{ position: 'absolute', left: -3, right: -3, bottom: 3, height: 9, background: 'var(--neon)', borderRadius: 3, zIndex: 0 }} />
              <span style={{ ...kpiValue, position: 'relative', zIndex: 1, marginTop: 0, fontWeight: 800 }}>
                {committedPaise > 0 ? formatRupees(committedPaise) : '\u20B90'}
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* ══════ DEALS LIST (or empty state) ══════ */}
      {totalCount === 0 && !q && !status ? (
        <section style={{ ...emptyCard, marginTop: 30 }}>
          <div style={{ filter: 'drop-shadow(0 14px 22px rgba(150,175,60,.28))' }}>
            <Mascot size={64} />
          </div>
          <p style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 19, letterSpacing: '-0.01em', margin: '18px 0 0', color: 'var(--ink)' }}>
            No deals yet
          </p>
          <p style={{ fontFamily: 'var(--font-ui)', fontSize: 13.5, color: 'var(--ink-faint)', margin: '9px 0 0', maxWidth: 340, lineHeight: 1.55 }}>
            Browse creators and start your first deal. Your deals will appear here once you send an offer.
          </p>
          <Link href="/browse" style={{ ...neonBtnStyle, marginTop: 20, fontSize: 13 }}>
            Browse creators
          </Link>
        </section>
      ) : (
        <DealsTable
          deals={all}
          currentStatus={status}
          currentQuery={q}
          currentPage={page}
          totalPages={totalPages}
          totalCount={totalCount}
        />
      )}
    </main>
  )
}

// ── Mascot SVG ──
function Mascot({ size = 56 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 336 336" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M168 12C278 12 324 112 324 188C324 276 252 324 168 324C84 324 12 276 12 188C12 112 58 12 168 12Z" fill="#E8FF66" />
      <ellipse cx="114" cy="126" rx="54" ry="36" fill="#fff" opacity="0.55" />
      <ellipse cx="168" cy="188" rx="24" ry="10" fill="#fff" opacity="0.18" />
    </svg>
  )
}

// ── Styles ──
const container: React.CSSProperties = {
  position: 'relative',
  zIndex: 1,
  padding: 'clamp(20px, 3vw, 40px) clamp(18px, 4vw, 44px) clamp(56px, 6vw, 90px)',
  maxWidth: 1080,
  margin: '0 auto',
}

const heroCard: React.CSSProperties = {
  borderRadius: 20,
  background: 'var(--card)',
  boxShadow: '0 12px 28px -20px rgba(40,52,70,.42), inset 0 1px 0 rgba(255,255,255,.95)',
  padding: 28,
}

const emptyCard: React.CSSProperties = {
  borderRadius: 20,
  background: 'var(--card)',
  boxShadow: '0 12px 28px -20px rgba(40,52,70,.42), inset 0 1px 0 rgba(255,255,255,.95)',
  padding: '64px 38px',
  textAlign: 'center',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
}

const kpiLabel: React.CSSProperties = {
  fontFamily: 'var(--font-ui)',
  fontWeight: 500,
  fontSize: 9.5,
  lineHeight: 1.4,
  letterSpacing: '0.14em',
  textTransform: 'uppercase',
  color: '#9EA096',
}

const kpiValue: React.CSSProperties = {
  fontFamily: 'var(--font-ui)',
  fontWeight: 700,
  fontSize: 38,
  lineHeight: 0.9,
  letterSpacing: '-0.045em',
  color: 'var(--ink)',
  fontVariantNumeric: 'tabular-nums lining-nums',
  marginTop: 10,
}

const neonBtnStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 8,
  height: 46,
  padding: '0 22px',
  borderRadius: 999,
  background: 'var(--neon)',
  color: 'var(--ink)',
  fontFamily: 'var(--font-ui)',
  fontWeight: 600,
  fontSize: 14,
  textDecoration: 'none',
  whiteSpace: 'nowrap',
  border: 'none',
  cursor: 'pointer',
  boxShadow: '0 14px 26px -12px rgba(180,215,50,.7)',
}

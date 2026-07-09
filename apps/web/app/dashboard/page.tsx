import { createClient } from '@/lib/supabase/server'
import { verifyApprovedBrand } from '@/lib/brand-auth'
import { deriveDisplayStatus } from '@/lib/deal-status'
import Link from 'next/link'
import RealtimeDashboardListener from '@/components/RealtimeDashboardListener'

interface DealRow {
  id: string
  title: string
  status: string
  price_paise: number
  created_at: string
  creator_id: string
  creators: unknown
}

interface InvoiceRow {
  deal_id: string
  status: string
  due_date: string | null
  brand_pays_paise: number
}

export default async function DashboardPage() {
  const brand = await verifyApprovedBrand()
  const supabase = createClient()

  const [{ data: deals }, { data: invoices }] = await Promise.all([
    supabase
      .from('deals')
      .select('id, title, status, price_paise, created_at, creator_id, creators(id, full_name, profile_photo_url)')
      .neq('status', 'cancelled')
      .neq('status', 'declined')
      .order('created_at', { ascending: false }),
    supabase
      .from('invoices')
      .select('deal_id, status, due_date, brand_pays_paise'),
  ])

  const allDeals = (deals ?? []) as DealRow[]
  const allInvoices = (invoices ?? []) as InvoiceRow[]

  // Index invoices by deal_id
  const invoiceMap = new Map<string, InvoiceRow>()
  for (const inv of allInvoices) {
    invoiceMap.set(inv.deal_id, inv)
  }

  // Derive display status for each deal using the shared helper
  const dealStatuses = allDeals.map((d) => {
    const inv = invoiceMap.get(d.id)
    const derived = deriveDisplayStatus(d.status, inv?.status ?? null, inv?.due_date ?? null)
    return { deal: d, invoice: inv ?? null, derived }
  })

  // ── NEEDS ATTENTION ──────────────────────────────────────
  const invoicesToAccept = dealStatuses.filter((ds) => ds.derived.label === 'invoice to accept')
  const paymentsDue = dealStatuses.filter((ds) => ds.derived.label === 'payment due')
  const overdue = dealStatuses.filter((ds) => ds.derived.label === 'overdue')

  const paymentsDueTotal = paymentsDue.reduce((sum, ds) => sum + (ds.invoice?.brand_pays_paise ?? 0), 0)
  const overdueTotal = overdue.reduce((sum, ds) => sum + (ds.invoice?.brand_pays_paise ?? 0), 0)

  // ── ACTIVITY SUMMARY ─────────────────────────────────────
  const ACTIVE_STATUSES = new Set(['negotiating', 'agreed', 'delivered', 'revision', 'approved'])
  const COMPLETED_STATUSES = new Set(['complete', 'paid'])

  const activeDeals = allDeals.filter((d) => ACTIVE_STATUSES.has(d.status))
  const completedDeals = allDeals.filter((d) => COMPLETED_STATUSES.has(d.status))
  const totalDeals = allDeals.length

  // Budget spent = sum of brand_pays_paise on PAID invoices only
  const budgetSpent = allInvoices
    .filter((inv) => inv.status === 'paid')
    .reduce((sum, inv) => sum + (inv.brand_pays_paise ?? 0), 0)

  // ── STATUS BAR ────────────────────────────────────────────
  const statusBarSegments = [
    { label: 'Active', count: activeDeals.length, color: '#3b82f6' },
    { label: 'Completed', count: completedDeals.length, color: '#22c55e' },
    { label: 'Payment due', count: paymentsDue.length + overdue.length, color: '#eab308' },
  ].filter((s) => s.count > 0)
  const statusBarTotal = statusBarSegments.reduce((s, seg) => s + seg.count, 0)

  // ── TOP CREATORS ──────────────────────────────────────────
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
    .slice(0, 5)

  // ── EMPTY STATE ───────────────────────────────────────────
  if (totalDeals === 0) {
    return (
      <section style={container}>
        <h1 style={heading}>Dashboard</h1>
        <div style={{ padding: '4rem 2rem', textAlign: 'center', border: '1px solid var(--color-border, #e5e5e5)', borderRadius: 12, background: '#fafafa' }}>
          <p style={{ fontSize: '1.125rem', fontWeight: 700, color: '#111', margin: '0 0 0.5rem' }}>
            Start your first deal
          </p>
          <p style={{ fontSize: '0.875rem', color: '#888', margin: '0 0 1.5rem', maxWidth: 360, marginLeft: 'auto', marginRight: 'auto' }}>
            Browse vetted creators and send your first offer. Your dashboard will light up once deals are in motion.
          </p>
          <Link href="/browse" style={primaryBtn}>
            Browse creators
          </Link>
        </div>
      </section>
    )
  }

  return (
    <section style={container}>
      <RealtimeDashboardListener />
      <h1 style={heading}>Dashboard</h1>

      {/* ── NEEDS ATTENTION ───────────────────────────── */}
      {(invoicesToAccept.length > 0 || paymentsDue.length > 0 || overdue.length > 0) && (
        <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', marginBottom: '2rem' }}>
          {invoicesToAccept.length > 0 && (
            <AttentionCard
              label="Invoices to review"
              count={invoicesToAccept.length}
              bg="#fef9c3"
              border="#fcd34d"
              color="#854d0e"
              href="/deals"
            />
          )}
          {overdue.length > 0 && (
            <AttentionCard
              label="Overdue"
              count={overdue.length}
              amount={overdueTotal}
              bg="#fee2e2"
              border="#fca5a5"
              color="#991b1b"
              href="/deals"
            />
          )}
          {paymentsDue.length > 0 && (
            <AttentionCard
              label="Payments due"
              count={paymentsDue.length}
              amount={paymentsDueTotal}
              bg="#fef9c3"
              border="#fcd34d"
              color="#854d0e"
              href="/deals"
            />
          )}
        </div>
      )}

      {/* ── STAT CARDS ────────────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '0.75rem', marginBottom: '2rem' }}>
        <StatCard label="Active deals" value={String(activeDeals.length)} />
        <StatCard label="Completed" value={String(completedDeals.length)} />
        <StatCard label="Total deals" value={String(totalDeals)} />
        <StatCard label="Budget spent" value={formatRupees(budgetSpent)} />
      </div>

      {/* ── DEALS BY STATUS BAR ───────────────────────── */}
      {statusBarTotal > 0 && (
        <div style={{ marginBottom: '2rem' }}>
          <p style={sectionLabel}>Deals by status</p>
          <div style={{ display: 'flex', height: 28, borderRadius: 6, overflow: 'hidden', border: '1px solid #e5e5e5' }}>
            {statusBarSegments.map((seg) => (
              <div
                key={seg.label}
                style={{ width: `${(seg.count / statusBarTotal) * 100}%`, background: seg.color, display: 'flex', alignItems: 'center', justifyContent: 'center', minWidth: 40 }}
                title={`${seg.label}: ${seg.count}`}
              >
                <span style={{ fontSize: '0.6875rem', fontWeight: 700, color: '#fff' }}>{seg.count}</span>
              </div>
            ))}
          </div>
          <div style={{ display: 'flex', gap: '1rem', marginTop: '0.375rem' }}>
            {statusBarSegments.map((seg) => (
              <span key={seg.label} style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', fontSize: '0.75rem', color: '#555' }}>
                <span style={{ width: 8, height: 8, borderRadius: 2, background: seg.color, display: 'inline-block' }} />
                {seg.label}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* ── TOP CREATORS ──────────────────────────────── */}
      {topCreators.length > 0 && (
        <div>
          <p style={sectionLabel}>Top creators</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {topCreators.map((c) => (
              <div key={c.name} style={creatorRow}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flex: 1 }}>
                  {c.photo ? (
                    <img src={c.photo} alt={c.name} style={avatar} />
                  ) : (
                    <div style={avatarFallback}>
                      {c.name.split(' ').map((w) => w[0]).join('').toUpperCase().slice(0, 2)}
                    </div>
                  )}
                  <div>
                    <p style={{ fontSize: '0.875rem', fontWeight: 600, color: '#111', margin: 0 }}>{c.name}</p>
                    <p style={{ fontSize: '0.75rem', color: '#888', margin: '0.1rem 0 0' }}>
                      {c.dealCount} deal{c.dealCount !== 1 ? 's' : ''} &middot; {formatRupees(c.totalPaise)}
                    </p>
                  </div>
                </div>
                <Link href={`/deals/new?from=${c.latestDealId}`} style={reengageBtn}>
                  Re-engage
                </Link>
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  )
}

// ── Sub-components ──────────────────────────────────────────

function AttentionCard({ label, count, amount, bg, border, color, href }: {
  label: string; count: number; amount?: number; bg: string; border: string; color: string; href: string
}) {
  return (
    <Link href={href} style={{ flex: '1 1 200px', padding: '1rem 1.25rem', background: bg, border: `1px solid ${border}`, borderRadius: 10, textDecoration: 'none', color }}>
      <p style={{ fontSize: '1.5rem', fontWeight: 700, margin: 0 }}>{count}</p>
      <p style={{ fontSize: '0.8125rem', fontWeight: 600, margin: '0.125rem 0 0' }}>{label}</p>
      {amount != null && amount > 0 && (
        <p style={{ fontSize: '0.875rem', fontWeight: 700, fontFamily: 'monospace', margin: '0.25rem 0 0' }}>
          {formatRupees(amount)}
        </p>
      )}
    </Link>
  )
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ padding: '1rem 1.25rem', border: '1px solid #e5e5e5', borderRadius: 10, background: '#fafafa' }}>
      <p style={{ fontSize: '1.5rem', fontWeight: 700, color: '#111', margin: 0, fontFamily: 'monospace' }}>{value}</p>
      <p style={{ fontSize: '0.75rem', fontWeight: 600, color: '#888', margin: '0.25rem 0 0', textTransform: 'uppercase', letterSpacing: '0.03em' }}>{label}</p>
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

// ── Styles ──────────────────────────────────────────────────

const container: React.CSSProperties = {
  padding: '2.5rem var(--container-pad, 1.5rem)',
  maxWidth: 'var(--container-width, 1080px)',
  margin: '0 auto',
}

const heading: React.CSSProperties = {
  fontFamily: 'var(--font-heading)',
  fontSize: '1.75rem',
  fontWeight: 700,
  color: 'var(--color-heading, #111)',
  margin: '0 0 1.5rem',
}

const sectionLabel: React.CSSProperties = {
  fontSize: '0.75rem',
  fontWeight: 700,
  textTransform: 'uppercase',
  letterSpacing: '0.04em',
  color: '#888',
  margin: '0 0 0.625rem',
}

const creatorRow: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  padding: '0.75rem 1rem',
  border: '1px solid #e5e5e5',
  borderRadius: 8,
  background: '#fafafa',
}

const avatar: React.CSSProperties = {
  width: 36,
  height: 36,
  borderRadius: 8,
  objectFit: 'cover',
  border: '1px solid #e5e5e5',
  flexShrink: 0,
}

const avatarFallback: React.CSSProperties = {
  width: 36,
  height: 36,
  borderRadius: 8,
  background: '#f0f0f0',
  border: '1px solid #e5e5e5',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  fontSize: '0.75rem',
  fontWeight: 700,
  color: '#888',
  flexShrink: 0,
}

const primaryBtn: React.CSSProperties = {
  display: 'inline-block',
  padding: '0.625rem 1.5rem',
  background: '#111',
  color: '#fff',
  borderRadius: 8,
  fontWeight: 600,
  fontSize: '0.875rem',
  textDecoration: 'none',
}

const reengageBtn: React.CSSProperties = {
  padding: '0.375rem 0.875rem',
  background: '#111',
  color: '#fff',
  borderRadius: 6,
  fontWeight: 600,
  fontSize: '0.8125rem',
  textDecoration: 'none',
  whiteSpace: 'nowrap',
  flexShrink: 0,
}

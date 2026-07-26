import { createClient } from '@/lib/supabase/server'
import { verifyCreator } from '@/lib/creator-auth'
import Link from 'next/link'
import RealtimeDashboardListener from '@/components/RealtimeDashboardListener'
import AvatarUpload from '@/components/AvatarUpload'
import CopyLinkButton from './CopyLinkButton'
import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Dashboard — Guapd Creator' }

interface InvoiceRow {
  deal_id: string
  status: string
  due_date: string | null
  creator_receives_paise: number
}

export default async function CreatorDashboardPage() {
  const { creatorId, creatorName } = await verifyCreator()
  const supabase = createClient()

  const [{ data: deals }, { data: invoices }, { data: storefront }, { data: creatorRow }] = await Promise.all([
    supabase
      .from('deals')
      .select('id, title, status, price_paise, last_offer_by, created_at, brands(id, name)')
      .neq('status', 'cancelled')
      .neq('status', 'declined')
      .order('created_at', { ascending: false }),
    supabase
      .from('invoices')
      .select('deal_id, status, due_date, creator_receives_paise'),
    supabase
      .from('creator_storefronts')
      .select('slug, is_published')
      .maybeSingle(),
    supabase
      .from('creators')
      .select('profile_photo_url')
      .eq('id', creatorId)
      .maybeSingle(),
  ])

  const allDeals = deals ?? []
  const allInvoices = (invoices ?? []) as InvoiceRow[]

  // Index invoices by deal_id
  const invoiceMap = new Map<string, InvoiceRow>()
  for (const inv of allInvoices) {
    invoiceMap.set(inv.deal_id, inv)
  }

  // ── NEEDS ATTENTION ──────────────────────────────────────
  // Offers awaiting response: negotiating + last_offer_by = 'brand'
  const offersAwaiting = allDeals.filter(
    (d) => d.status === 'negotiating' && d.last_offer_by === 'brand'
  )

  // Deliverables to submit / revisions requested
  const deliverablesToDo = allDeals.filter(
    (d) => d.status === 'agreed' || d.status === 'revision'
  )

  // Invoices to issue: approved deals with no invoice
  const invoicesToIssue = allDeals.filter(
    (d) => d.status === 'approved' && !invoiceMap.has(d.id)
  )

  // Payments incoming: accepted invoices
  const paymentsIncoming = allInvoices.filter((inv) => inv.status === 'accepted')
  const incomingTotal = paymentsIncoming.reduce((sum, inv) => sum + (inv.creator_receives_paise ?? 0), 0)

  // ── EARNINGS SUMMARY ─────────────────────────────────────
  // Total earned = paid invoices only (creator_receives_paise)
  const totalEarned = allInvoices
    .filter((inv) => inv.status === 'paid')
    .reduce((sum, inv) => sum + (inv.creator_receives_paise ?? 0), 0)

  // Pending = accepted-but-unpaid
  const pendingAmount = incomingTotal

  // Active / completed
  const ACTIVE_STATUSES = new Set(['negotiating', 'agreed', 'delivered', 'revision', 'approved'])
  const COMPLETED_STATUSES = new Set(['complete', 'paid'])
  const activeDeals = allDeals.filter((d) => ACTIVE_STATUSES.has(d.status))
  const completedDeals = allDeals.filter((d) => COMPLETED_STATUSES.has(d.status))

  // ── TOP BRANDS ────────────────────────────────────────────
  const brandAgg = new Map<string, { name: string; dealCount: number; earnedPaise: number }>()
  for (const d of allDeals) {
    const raw = d.brands as unknown
    const b = Array.isArray(raw) ? raw[0] : (raw as { id: string; name: string } | null)
    if (!b) continue
    const inv = invoiceMap.get(d.id)
    const earned = inv?.status === 'paid' ? (inv.creator_receives_paise ?? 0) : 0
    const existing = brandAgg.get(b.id)
    if (existing) {
      existing.dealCount++
      existing.earnedPaise += earned
    } else {
      brandAgg.set(b.id, { name: b.name, dealCount: 1, earnedPaise: earned })
    }
  }
  const topBrands = Array.from(brandAgg.values())
    .sort((a, b) => b.dealCount - a.dealCount || b.earnedPaise - a.earnedPaise)
    .slice(0, 5)

  // ── EMPTY STATE ───────────────────────────────────────────
  if (allDeals.length === 0) {
    return (
      <main style={wrapper}>
        <h1 style={heading}>Dashboard</h1>
        <div style={{ padding: '3rem 1rem', textAlign: 'center', border: '1px solid #e5e5e5', borderRadius: 12, background: '#fff' }}>
          <p style={{ fontSize: '1.125rem', fontWeight: 700, color: '#111', margin: '0 0 0.5rem' }}>
            Your deals will appear here
          </p>
          <p style={{ fontSize: '0.875rem', color: '#888', margin: 0, lineHeight: 1.6 }}>
            When a brand sends you an offer, you&apos;ll see it on your dashboard. Make sure your profile and rate card are complete.
          </p>
        </div>
      </main>
    )
  }

  const hasAttention = offersAwaiting.length > 0 || deliverablesToDo.length > 0 || invoicesToIssue.length > 0 || paymentsIncoming.length > 0

  return (
    <main style={wrapper}>
      <RealtimeDashboardListener />
      <h1 style={heading}>Dashboard</h1>

      {/* ── PROFILE PHOTO ──────────────────────────── */}
      <div style={{ marginBottom: '1.25rem', padding: '1rem', border: '1px solid #e5e5e5', borderRadius: 12, background: '#fff' }}>
        <p style={{ ...sectionLabel, marginBottom: '0.75rem' }}>Profile photo</p>
        <AvatarUpload currentUrl={creatorRow?.profile_photo_url ?? null} name={creatorName} />
      </div>

      {/* ── STOREFRONT ──────────────────────────────── */}
      <StorefrontCard storefront={storefront} />

      {/* ── NEEDS ATTENTION ───────────────────────────── */}
      {hasAttention && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.625rem', marginBottom: '1.5rem' }}>
          {offersAwaiting.length > 0 && (
            <AttentionCard
              count={offersAwaiting.length}
              label="Offers to respond"
              bg="#dbeafe" border="#93c5fd" color="#1e40af"
              href="/creator/deals"
            />
          )}
          {deliverablesToDo.length > 0 && (
            <AttentionCard
              count={deliverablesToDo.length}
              label={deliverablesToDo.some((d) => d.status === 'revision') ? 'Deliverables / revisions' : 'Deliverables to submit'}
              bg="#fef9c3" border="#fcd34d" color="#854d0e"
              href="/creator/deals"
            />
          )}
          {invoicesToIssue.length > 0 && (
            <AttentionCard
              count={invoicesToIssue.length}
              label="Invoices to issue"
              bg="#ffedd5" border="#fdba74" color="#9a3412"
              href="/creator/deals"
            />
          )}
          {paymentsIncoming.length > 0 && (
            <AttentionCard
              count={paymentsIncoming.length}
              label="Payments incoming"
              bg="#dcfce7" border="#86efac" color="#166534"
              amount={incomingTotal}
              href="/creator/deals"
            />
          )}
        </div>
      )}

      {/* ── EARNINGS ──────────────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.625rem', marginBottom: '0.625rem' }}>
        <StatCard label="Total earned" value={formatRupees(totalEarned)} highlight />
        <StatCard label="Pending" value={formatRupees(pendingAmount)} />
      </div>

      {/* ── DEAL STATS ────────────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.625rem', marginBottom: '1.5rem' }}>
        <StatCard label="Active deals" value={String(activeDeals.length)} />
        <StatCard label="Completed" value={String(completedDeals.length)} />
      </div>

      {/* ── TOP BRANDS ────────────────────────────────── */}
      {topBrands.length > 0 && (
        <div>
          <p style={sectionLabel}>Brands you&apos;ve worked with</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {topBrands.map((b) => (
              <div key={b.name} style={brandRow}>
                <div>
                  <p style={{ fontSize: '0.875rem', fontWeight: 600, color: '#111', margin: 0 }}>{b.name}</p>
                  <p style={{ fontSize: '0.75rem', color: '#888', margin: '0.1rem 0 0' }}>
                    {b.dealCount} deal{b.dealCount !== 1 ? 's' : ''}
                    {b.earnedPaise > 0 && <> &middot; {formatRupees(b.earnedPaise)} earned</>}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </main>
  )
}

// ── Storefront card ─────────────────────────────────────────

function StorefrontCard({ storefront }: { storefront: { slug: string; is_published: boolean } | null }) {
  const baseUrl = 'https://guapd.com/c/'

  // State 1: No storefront exists
  if (!storefront) {
    return (
      <Link href="/creator/storefront" style={{ ...storefrontCardBase, background: '#f8fafc', borderColor: '#e2e8f0' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={storefrontIconWrap}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#6d28d9" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /><polyline points="9 22 9 12 15 12 15 22" /></svg>
          </div>
          <div>
            <p style={{ fontSize: '0.9375rem', fontWeight: 700, color: '#111', margin: 0 }}>
              Set up your Storefront
            </p>
            <p style={{ fontSize: '0.8125rem', color: '#888', margin: '0.15rem 0 0' }}>
              A public page where brands can discover your work and send you offers
            </p>
          </div>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#888" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginLeft: 'auto', flexShrink: 0 }}><polyline points="9 18 15 12 9 6" /></svg>
        </div>
      </Link>
    )
  }

  // State 2: Exists but not published
  if (!storefront.is_published) {
    return (
      <div style={{ ...storefrontCardBase, background: '#fffbeb', borderColor: '#fcd34d' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <div style={{ ...storefrontIconWrap, background: '#fef3c7' }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#b45309" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /><polyline points="9 22 9 12 15 12 15 22" /></svg>
          </div>
          <div style={{ flex: 1, minWidth: 160 }}>
            <p style={{ fontSize: '0.9375rem', fontWeight: 700, color: '#111', margin: 0 }}>
              Your Storefront isn&apos;t live yet
            </p>
            <p style={{ fontSize: '0.8125rem', color: '#92400e', margin: '0.15rem 0 0' }}>
              Finish setting up and publish to start receiving pitches
            </p>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <Link href="/creator/storefront" style={storefrontBtn}>Edit</Link>
          </div>
        </div>
      </div>
    )
  }

  // State 3: Published
  const fullUrl = `${baseUrl}${storefront.slug}`
  return (
    <div style={{ ...storefrontCardBase, background: '#f0fdf4', borderColor: '#86efac' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <div style={{ ...storefrontIconWrap, background: '#dcfce7' }}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#166534" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /><polyline points="9 22 9 12 15 12 15 22" /></svg>
        </div>
        <div style={{ flex: 1, minWidth: 160 }}>
          <p style={{ fontSize: '0.9375rem', fontWeight: 700, color: '#111', margin: 0 }}>
            Storefront is live
          </p>
          <p style={{ fontSize: '0.8125rem', color: '#166534', margin: '0.15rem 0 0', fontFamily: 'monospace' }}>
            {fullUrl}
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <CopyLinkButton url={fullUrl} />
          <Link href={`/c/${storefront.slug}`} target="_blank" rel="noopener" style={storefrontBtn}>View</Link>
          <Link href="/creator/storefront" style={storefrontBtn}>Edit</Link>
        </div>
      </div>
    </div>
  )
}

const storefrontCardBase: React.CSSProperties = {
  display: 'block',
  padding: '0.875rem 1rem',
  border: '1px solid',
  borderRadius: 12,
  marginBottom: '1.25rem',
  textDecoration: 'none',
  color: 'inherit',
}

const storefrontIconWrap: React.CSSProperties = {
  width: 40,
  height: 40,
  borderRadius: 10,
  background: '#ede9fe',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  flexShrink: 0,
}

const storefrontBtn: React.CSSProperties = {
  padding: '0.375rem 0.875rem',
  fontSize: '0.8125rem',
  fontWeight: 600,
  borderRadius: 8,
  border: '1px solid #e5e5e5',
  background: '#fff',
  color: '#111',
  textDecoration: 'none',
  cursor: 'pointer',
  whiteSpace: 'nowrap',
}

// ── Sub-components ──────────────────────────────────────────

function AttentionCard({ count, label, amount, bg, border, color, href }: {
  count: number; label: string; amount?: number; bg: string; border: string; color: string; href: string
}) {
  return (
    <Link href={href} style={{ padding: '0.75rem', background: bg, border: `1px solid ${border}`, borderRadius: 10, textDecoration: 'none', color }}>
      <p style={{ fontSize: '1.25rem', fontWeight: 700, margin: 0 }}>{count}</p>
      <p style={{ fontSize: '0.75rem', fontWeight: 600, margin: '0.1rem 0 0' }}>{label}</p>
      {amount != null && amount > 0 && (
        <p style={{ fontSize: '0.8125rem', fontWeight: 700, fontFamily: 'monospace', margin: '0.2rem 0 0' }}>
          {formatRupees(amount)}
        </p>
      )}
    </Link>
  )
}

function StatCard({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div style={{ padding: '0.75rem', border: '1px solid #e5e5e5', borderRadius: 10, background: highlight ? '#f0fdf4' : '#fafafa' }}>
      <p style={{ fontSize: '1.25rem', fontWeight: 700, color: '#111', margin: 0, fontFamily: 'monospace' }}>{value}</p>
      <p style={{ fontSize: '0.6875rem', fontWeight: 600, color: '#888', margin: '0.2rem 0 0', textTransform: 'uppercase', letterSpacing: '0.03em' }}>{label}</p>
    </div>
  )
}

// ── Helpers ─────────────────────────────────────────────────

function formatRupees(paise: number): string {
  if (paise === 0) return '\u20B90'
  const rupees = paise / 100
  if (rupees >= 10000000) return `\u20B9${(rupees / 10000000).toFixed(1)}Cr`
  if (rupees >= 100000) return `\u20B9${(rupees / 100000).toFixed(1)}L`
  if (rupees >= 1000) return `\u20B9${(rupees / 1000).toFixed(0)}K`
  return `\u20B9${rupees.toLocaleString('en-IN')}`
}

// ── Styles ──────────────────────────────────────────────────

const wrapper: React.CSSProperties = {
  padding: '2rem clamp(1rem, 3vw, 2.5rem)',
  maxWidth: 900,
  margin: '0 auto',
}

const heading: React.CSSProperties = {
  fontFamily: 'var(--font-heading, inherit)',
  fontSize: '1.375rem',
  fontWeight: 700,
  color: 'var(--color-heading, #111)',
  margin: '0 0 1.25rem',
}

const sectionLabel: React.CSSProperties = {
  fontSize: '0.6875rem',
  fontWeight: 700,
  textTransform: 'uppercase',
  letterSpacing: '0.04em',
  color: '#888',
  margin: '0 0 0.5rem',
}

const brandRow: React.CSSProperties = {
  padding: '0.75rem',
  border: '1px solid #e5e5e5',
  borderRadius: 8,
  background: '#fff',
}

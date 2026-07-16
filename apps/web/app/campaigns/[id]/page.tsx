import { createClient } from '@/lib/supabase/server'
import { verifyApprovedBrand } from '@/lib/brand-auth'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { calculateFee } from '@/lib/fee'
import { deriveDisplayStatus } from '@/lib/deal-status'
import CampaignActions from './CampaignActions'
import AddCreatorsModal from './AddCreatorsModal'
import CampaignRoster from './CampaignRoster'
import type { DraftPlacement } from './draft-actions'

function formatRupees(paise: number): string {
  const rupees = paise / 100
  if (rupees >= 10000000) return `₹${(rupees / 10000000).toFixed(1)}Cr`
  if (rupees >= 100000) return `₹${(rupees / 100000).toFixed(1)}L`
  if (rupees >= 1000) return `₹${(rupees / 1000).toFixed(0)}K`
  return `₹${rupees.toLocaleString('en-IN')}`
}

const STATUS_COLORS: Record<string, { bg: string; color: string }> = {
  active:    { bg: '#dcfce7', color: '#166534' },
  completed: { bg: '#f3f4f6', color: '#374151' },
  archived:  { bg: '#f3f4f6', color: '#6b7280' },
}

const DEAL_STATUS_ORDER = ['negotiating', 'agreed', 'delivered', 'revision', 'approved', 'paid', 'complete', 'declined', 'cancelled']
const POSTABLE = new Set(['approved', 'paid', 'complete'])
const PAID_INVOICE_STATUSES = new Set(['paid'])

export default async function CampaignDetailPage({ params }: { params: { id: string } }) {
  await verifyApprovedBrand()
  const supabase = createClient()

  const [{ data: campaign, error: campErr }, { data: deals }, { data: invoices }, { data: drafts }, { data: allCreators }] = await Promise.all([
    supabase
      .from('campaigns')
      .select('id, name, description, status, budget_paise, created_at, updated_at')
      .eq('id', params.id)
      .maybeSingle(),
    supabase
      .from('deals')
      .select('id, title, deliverables, price_paise, fee_percent, fee_mode, price_per_extra_revision_paise, revisions_used, revision_limit, status, is_posted, created_at, creators(id, full_name, profile_photo_url)')
      .eq('campaign_id', params.id)
      .order('created_at', { ascending: false }),
    supabase
      .from('invoices')
      .select('deal_id, status, due_date, brand_pays_paise'),
    supabase
      .from('campaign_drafts')
      .select('id, campaign_id, creator_id, placements, total_price_paise, fee_percent, fee_mode, total_brand_paise, note, creators(id, full_name, handle, profile_photo_url)')
      .eq('campaign_id', params.id)
      .order('created_at', { ascending: true }),
    // All vetted creators for add-creators modal
    supabase
      .from('creators')
      .select('id, full_name, handle, profile_photo_url, niches')
      .order('full_name'),
  ])

  if (campErr || !campaign) notFound()

  const sc = STATUS_COLORS[campaign.status] ?? STATUS_COLORS.active
  const allDeals = deals ?? []
  const allDrafts = (drafts ?? []).map((d) => {
    const rawCreator = d.creators as unknown
    const creator = (Array.isArray(rawCreator) ? rawCreator[0] : rawCreator) as { id: string; full_name: string; handle: string | null; profile_photo_url: string | null } | null
    return {
      id: d.id,
      campaign_id: d.campaign_id,
      creator_id: d.creator_id,
      placements: (d.placements ?? []) as DraftPlacement[],
      total_price_paise: d.total_price_paise,
      fee_percent: d.fee_percent,
      fee_mode: d.fee_mode as 'on_top' | 'deducted',
      total_brand_paise: d.total_brand_paise,
      creator: creator ?? { id: d.creator_id, full_name: 'Unknown', handle: null, profile_photo_url: null },
    }
  })

  // Fetch products for all drafted creators (for placement editor)
  const draftCreatorIds = allDrafts.map((d) => d.creator_id)
  let productsMap: Record<string, { id: string; platform: string; handle: string; product_type: string; description: string | null; price_paise: number; display_price: boolean; is_active: boolean }[]> = {}
  if (draftCreatorIds.length > 0) {
    const { data: products } = await supabase
      .from('creator_products')
      .select('id, creator_id, platform, handle, product_type, description, price_paise, display_price, is_active')
      .in('creator_id', draftCreatorIds)
      .eq('is_active', true)
    for (const p of products ?? []) {
      if (!productsMap[p.creator_id]) productsMap[p.creator_id] = []
      productsMap[p.creator_id].push(p)
    }
  }

  // Index invoices
  const invoiceMap = new Map<string, { status: string; due_date: string | null; brand_pays_paise: number }>()
  for (const inv of invoices ?? []) {
    invoiceMap.set(inv.deal_id, inv)
  }

  // ── ROLLUP ──────────────────────────────────────────────
  const nonCancelled = allDeals.filter((d) => !['declined', 'cancelled'].includes(d.status))

  // Committed (deals) = sum of non-cancelled deal brand_pays via calculateFee
  let dealsBrandPaise = 0
  for (const d of nonCancelled) {
    if (d.price_paise != null && d.price_paise > 0) {
      const fee = calculateFee(d.price_paise, d.fee_percent ?? 0, (d.fee_mode as 'on_top' | 'deducted') ?? 'on_top')
      dealsBrandPaise += fee.brand_pays_paise
    }
  }

  // Draft spend = sum of all draft total_brand_paise
  const draftsBrandPaise = allDrafts.reduce((s, d) => s + d.total_brand_paise, 0)

  // Est. Spend = drafts + committed deals
  const estSpendPaise = draftsBrandPaise + dealsBrandPaise

  // Paid = sum of brand_pays_paise on invoices with status='paid' (ONLY paid money)
  let paidPaise = 0
  for (const d of allDeals) {
    const inv = invoiceMap.get(d.id)
    if (inv && PAID_INVOICE_STATUSES.has(inv.status)) {
      paidPaise += inv.brand_pays_paise ?? 0
    }
  }

  // To Allocate = budget - est. spend (only when budget set)
  const toAllocatePaise = campaign.budget_paise != null ? campaign.budget_paise - estSpendPaise : null

  // Deals by stage
  const stageCounts: Record<string, number> = {}
  for (const d of allDeals) {
    stageCounts[d.status] = (stageCounts[d.status] ?? 0) + 1
  }

  // Posted
  const postableDeals = allDeals.filter((d) => POSTABLE.has(d.status))
  const postedCount = postableDeals.filter((d) => d.is_posted).length

  // Distinct creators (deals + drafts)
  const creatorIds = new Set<string>()
  for (const d of allDeals) {
    const c = (Array.isArray(d.creators) ? d.creators[0] : d.creators) as { id: string } | null
    if (c) creatorIds.add(c.id)
  }
  for (const d of allDrafts) {
    creatorIds.add(d.creator_id)
  }

  // Existing creator IDs in drafts (for add-creators modal dedup)
  const existingDraftCreatorIds = allDrafts.map((d) => d.creator_id)

  // Budget progress
  const budgetPercent = campaign.budget_paise != null && campaign.budget_paise > 0
    ? Math.round((estSpendPaise / campaign.budget_paise) * 100)
    : null
  const budgetColor = budgetPercent != null
    ? budgetPercent > 100 ? '#dc2626' : budgetPercent >= 80 ? '#d97706' : '#16a34a'
    : '#16a34a'

  return (
    <section style={container}>
      <Link href="/campaigns" style={{ fontSize: '0.8125rem', color: 'var(--color-muted)', textDecoration: 'none', display: 'inline-block', marginBottom: '1.5rem' }}>
        &larr; All campaigns
      </Link>

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '2rem', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.25rem' }}>
            <h1 style={{ fontFamily: 'var(--font-heading)', fontSize: '1.5rem', fontWeight: 700, color: 'var(--color-heading)', margin: 0 }}>
              {campaign.name}
            </h1>
            <span style={{ fontSize: '0.7rem', fontWeight: 600, padding: '0.15rem 0.5rem', borderRadius: 9999, background: sc.bg, color: sc.color, textTransform: 'capitalize' }}>
              {campaign.status}
            </span>
          </div>
          {campaign.description && (
            <p style={{ fontSize: '0.875rem', color: 'var(--color-muted)', margin: '0.25rem 0 0', maxWidth: 600 }}>
              {campaign.description}
            </p>
          )}
        </div>
        <CampaignActions campaignId={campaign.id} currentStatus={campaign.status} currentName={campaign.name} currentDescription={campaign.description} currentBudgetPaise={campaign.budget_paise} />
      </div>

      {/* Budget bar */}
      {campaign.budget_paise != null && (
        <div style={{ marginBottom: '1.5rem', padding: '0.75rem 1rem', border: '1px solid #e5e5e5', borderRadius: 8, background: '#fafafa' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '0.375rem' }}>
            <span style={{ fontSize: '0.75rem', fontWeight: 600, color: '#888', textTransform: 'uppercase', letterSpacing: '0.03em' }}>Budget</span>
            <span style={{ fontSize: '0.875rem', fontWeight: 700, fontFamily: 'monospace', color: 'var(--color-heading)' }}>{formatRupees(campaign.budget_paise)}</span>
          </div>
          <div style={{ height: 6, borderRadius: 3, background: '#e5e5e5', overflow: 'hidden', marginBottom: '0.375rem' }}>
            <div style={{ width: `${Math.min(budgetPercent ?? 0, 100)}%`, height: '100%', background: budgetColor, borderRadius: 3, transition: 'width 0.3s' }} />
          </div>
          <div style={{ display: 'flex', gap: '1.5rem', fontSize: '0.75rem', color: '#888', flexWrap: 'wrap' }}>
            <span>Est. Spend: <strong style={{ fontFamily: 'monospace', color: 'var(--color-heading)' }}>{formatRupees(estSpendPaise)}</strong></span>
            <span>Paid: <strong style={{ fontFamily: 'monospace', color: '#16a34a' }}>{formatRupees(paidPaise)}</strong></span>
            {toAllocatePaise != null && (
              <span>To Allocate: <strong style={{ fontFamily: 'monospace', color: toAllocatePaise < 0 ? '#dc2626' : 'var(--color-heading)' }}>{toAllocatePaise < 0 ? `−${formatRupees(Math.abs(toAllocatePaise))}` : formatRupees(toAllocatePaise)}</strong></span>
            )}
          </div>
        </div>
      )}

      {/* Rollup stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '0.75rem', marginBottom: '2rem' }}>
        <StatCard label="Creators" value={String(creatorIds.size)} />
        <StatCard label="Drafts" value={String(allDrafts.length)} />
        <StatCard label="Deals" value={String(allDeals.length)} />
        {campaign.budget_paise == null && estSpendPaise > 0 && (
          <StatCard label="Est. Spend" value={formatRupees(estSpendPaise)} />
        )}
        {campaign.budget_paise == null && paidPaise > 0 && (
          <StatCard label="Paid" value={formatRupees(paidPaise)} />
        )}
        {postableDeals.length > 0 && (
          <StatCard label="Posted" value={`${postedCount} of ${postableDeals.length}`} />
        )}
      </div>

      {/* Stage breakdown */}
      {Object.keys(stageCounts).length > 0 && (
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '2rem' }}>
          {DEAL_STATUS_ORDER.map((s) => {
            const count = stageCounts[s]
            if (!count) return null
            return (
              <span key={s} style={{ fontSize: '0.6875rem', fontWeight: 600, padding: '0.2rem 0.5rem', borderRadius: 9999, background: '#f3f4f6', color: '#555', textTransform: 'capitalize' }}>
                {s} ({count})
              </span>
            )
          })}
        </div>
      )}

      {/* ── Campaign Roster (drafts) ───────────────────────── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
        <h2 style={sectionTitle}>Campaign Roster</h2>
        <AddCreatorsModal
          campaignId={campaign.id}
          creators={(allCreators ?? []) as { id: string; full_name: string; handle: string | null; profile_photo_url: string | null; niches: string[] | null }[]}
          existingCreatorIds={existingDraftCreatorIds}
        />
      </div>
      <CampaignRoster
        drafts={allDrafts}
        productsMap={productsMap}
        campaignId={campaign.id}
      />

      {/* ── Deals in this campaign ─────────────────────────── */}
      <h2 style={{ ...sectionTitle, marginTop: '2.5rem' }}>Deals in this campaign</h2>
      {allDeals.length === 0 ? (
        <p style={{ fontSize: '0.8125rem', color: 'var(--color-muted)' }}>
          No deals sent yet. Configure placements above, then send offers in Phase 2b.
        </p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          {allDeals.map((d) => {
            const raw = d.creators as unknown
            const creator = (Array.isArray(raw) ? raw[0] : raw) as { id: string; full_name: string; profile_photo_url: string | null } | null
            const inv = invoiceMap.get(d.id)
            const derived = deriveDisplayStatus(d.status, inv?.status ?? null, inv?.due_date ?? null)
            const dsc = derived.color

            let brandTotal: number | null = null
            if (d.price_paise != null && d.price_paise > 0) {
              const fee = calculateFee(d.price_paise, d.fee_percent ?? 0, (d.fee_mode as 'on_top' | 'deducted') ?? 'on_top')
              const extra = Math.max(0, (d.revisions_used ?? 0) - (d.revision_limit ?? 0))
              const overage = extra * (d.price_per_extra_revision_paise ?? 0)
              brandTotal = fee.brand_pays_paise + overage
            }

            return (
              <Link
                key={d.id}
                href={`/deals/${d.id}`}
                style={{
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  padding: '0.75rem 1rem',
                  border: '1px solid var(--color-border, #e5e5e5)',
                  borderRadius: 'var(--radius-sm, 6px)',
                  background: 'var(--glass-bg, #fafafa)',
                  textDecoration: 'none', color: 'inherit',
                  gap: '0.75rem',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem', minWidth: 0, flex: 1 }}>
                  {creator?.profile_photo_url ? (
                    <img src={creator.profile_photo_url} alt={creator.full_name} style={{ width: 28, height: 28, borderRadius: 6, objectFit: 'cover', border: '1px solid #e5e5e5', flexShrink: 0 }} />
                  ) : (
                    <div style={{ width: 28, height: 28, borderRadius: 6, background: '#f0f0f0', border: '1px solid #e5e5e5', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.625rem', fontWeight: 700, color: '#888', flexShrink: 0 }}>
                      {creator?.full_name?.split(' ').map((w) => w[0]).join('').toUpperCase().slice(0, 2) ?? '?'}
                    </div>
                  )}
                  <div style={{ minWidth: 0 }}>
                    <p style={{ fontSize: '0.8125rem', fontWeight: 600, color: 'var(--color-heading)', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {d.title || 'Untitled deal'}
                    </p>
                    <p style={{ fontSize: '0.75rem', color: 'var(--color-muted)', margin: 0 }}>
                      {creator?.full_name ?? 'Unknown'}
                    </p>
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexShrink: 0 }}>
                  {brandTotal != null && (
                    <span style={{ fontSize: '0.8125rem', fontWeight: 700, fontFamily: 'monospace', color: 'var(--color-heading)' }}>
                      {formatRupees(brandTotal)}
                    </span>
                  )}
                  <span style={{ fontSize: '0.625rem', fontWeight: 600, padding: '0.1rem 0.4rem', borderRadius: 9999, background: dsc.bg, color: dsc.color, textTransform: 'capitalize', whiteSpace: 'nowrap' }}>
                    {derived.label}
                  </span>
                  {POSTABLE.has(d.status) && (
                    <span style={{
                      fontSize: '0.5625rem', fontWeight: 600, padding: '0.1rem 0.35rem', borderRadius: 9999,
                      background: d.is_posted ? '#dcfce7' : '#fef9c3',
                      color: d.is_posted ? '#166534' : '#854d0e',
                    }}>
                      {d.is_posted ? 'Posted' : 'Awaiting'}
                    </span>
                  )}
                </div>
              </Link>
            )
          })}
        </div>
      )}

      {/* Metadata */}
      <div style={{ marginTop: '2rem', fontSize: '0.75rem', color: 'var(--color-subtle, #aaa)' }}>
        <p style={{ margin: '0.15rem 0' }}>Created: {new Date(campaign.created_at).toLocaleString('en-IN')}</p>
        <p style={{ margin: '0.15rem 0' }}>Updated: {new Date(campaign.updated_at).toLocaleString('en-IN')}</p>
      </div>
    </section>
  )
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ padding: '0.875rem 1rem', border: '1px solid #e5e5e5', borderRadius: 10, background: '#fafafa' }}>
      <p style={{ fontSize: '1.25rem', fontWeight: 700, color: '#111', margin: 0, fontFamily: 'monospace' }}>{value}</p>
      <p style={{ fontSize: '0.6875rem', fontWeight: 600, color: '#888', margin: '0.2rem 0 0', textTransform: 'uppercase', letterSpacing: '0.03em' }}>{label}</p>
    </div>
  )
}

const container: React.CSSProperties = {
  padding: '2.5rem var(--container-pad)',
  maxWidth: 'var(--container-width)',
  margin: '0 auto',
}

const sectionTitle: React.CSSProperties = {
  fontFamily: 'var(--font-heading)',
  fontSize: '0.9375rem',
  fontWeight: 700,
  color: 'var(--color-heading)',
  margin: '0 0 0.75rem',
  textTransform: 'uppercase',
  letterSpacing: '0.03em',
}

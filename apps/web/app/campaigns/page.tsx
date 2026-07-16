import { createClient } from '@/lib/supabase/server'
import { verifyApprovedBrand } from '@/lib/brand-auth'
import Link from 'next/link'
import NewCampaignButton from './NewCampaignButton'

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

const PAID_STATUSES = new Set(['paid', 'complete'])

export default async function CampaignsPage() {
  await verifyApprovedBrand()
  const supabase = createClient()

  const [{ data: campaigns }, { data: deals }, { data: invoices }] = await Promise.all([
    supabase
      .from('campaigns')
      .select('id, name, description, status, created_at')
      .order('created_at', { ascending: false }),
    supabase
      .from('deals')
      .select('id, campaign_id, status, price_paise, is_posted')
      .not('campaign_id', 'is', null),
    supabase
      .from('invoices')
      .select('deal_id, status, brand_pays_paise'),
  ])

  // Index invoices by deal_id
  const invoiceMap = new Map<string, { status: string; brand_pays_paise: number }>()
  for (const inv of invoices ?? []) {
    invoiceMap.set(inv.deal_id, { status: inv.status, brand_pays_paise: inv.brand_pays_paise })
  }

  // Build rollup per campaign
  const rollupMap = new Map<string, { totalDeals: number; committedPaise: number; paidPaise: number }>()
  for (const d of deals ?? []) {
    if (!d.campaign_id) continue
    const r = rollupMap.get(d.campaign_id) ?? { totalDeals: 0, committedPaise: 0, paidPaise: 0 }
    r.totalDeals++
    if (!['declined', 'cancelled'].includes(d.status)) {
      r.committedPaise += d.price_paise ?? 0
    }
    // Paid = invoice status is 'paid' (matches dashboard discipline)
    const inv = invoiceMap.get(d.id)
    if (inv && inv.status === 'paid') {
      r.paidPaise += inv.brand_pays_paise ?? 0
    }
    rollupMap.set(d.campaign_id, r)
  }

  const all = campaigns ?? []

  return (
    <section style={container}>
      <div style={{ marginBottom: '2rem', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <h1 style={{ fontFamily: 'var(--font-heading)', fontSize: '1.75rem', fontWeight: 700, color: 'var(--color-heading)', margin: '0 0 0.375rem' }}>
            Campaigns
          </h1>
          <p style={{ color: 'var(--color-muted)', fontSize: '0.9375rem', margin: 0 }}>
            {all.length} campaign{all.length !== 1 ? 's' : ''}
          </p>
        </div>
        <NewCampaignButton />
      </div>

      {all.length === 0 ? (
        <div style={{ padding: '3rem', textAlign: 'center' }}>
          <p style={{ fontSize: '1rem', fontWeight: 600, color: 'var(--color-heading)' }}>No campaigns yet</p>
          <p style={{ fontSize: '0.875rem', color: 'var(--color-muted)', margin: '0.25rem 0 0' }}>
            Create a campaign to group related deals together.
          </p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          {all.map((c) => {
            const sc = STATUS_COLORS[c.status] ?? STATUS_COLORS.active
            const r = rollupMap.get(c.id) ?? { totalDeals: 0, committedPaise: 0, paidPaise: 0 }
            return (
              <Link
                key={c.id}
                href={`/campaigns/${c.id}`}
                style={{
                  display: 'block',
                  padding: '1rem 1.25rem',
                  border: '1px solid var(--color-border, #e5e5e5)',
                  borderRadius: 'var(--radius-md, 8px)',
                  background: 'var(--glass-bg, #fafafa)',
                  textDecoration: 'none',
                  color: 'inherit',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.375rem' }}>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <span style={{ fontSize: '0.9375rem', fontWeight: 700, color: 'var(--color-heading)' }}>{c.name}</span>
                    {c.description && (
                      <p style={{ fontSize: '0.75rem', color: 'var(--color-muted)', margin: '0.15rem 0 0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 400 }}>
                        {c.description}
                      </p>
                    )}
                  </div>
                  <span style={{
                    fontSize: '0.625rem', fontWeight: 600, padding: '0.1rem 0.4rem', borderRadius: 9999,
                    background: sc.bg, color: sc.color, textTransform: 'capitalize', whiteSpace: 'nowrap', flexShrink: 0,
                  }}>
                    {c.status}
                  </span>
                </div>
                <div style={{ display: 'flex', gap: '1.5rem', fontSize: '0.75rem', color: 'var(--color-muted)' }}>
                  <span><strong style={{ color: 'var(--color-heading)' }}>{r.totalDeals}</strong> deal{r.totalDeals !== 1 ? 's' : ''}</span>
                  {r.committedPaise > 0 && <span>Committed: <strong style={{ fontFamily: 'monospace', color: 'var(--color-heading)' }}>{formatRupees(r.committedPaise)}</strong></span>}
                  {r.paidPaise > 0 && <span>Paid: <strong style={{ fontFamily: 'monospace', color: '#16a34a' }}>{formatRupees(r.paidPaise)}</strong></span>}
                  <span>{new Date(c.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
                </div>
              </Link>
            )
          })}
        </div>
      )}
    </section>
  )
}

const container: React.CSSProperties = {
  padding: '2.5rem var(--container-pad)',
  maxWidth: 'var(--container-width)',
  margin: '0 auto',
}

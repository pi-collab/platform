import { createClient } from '@/lib/supabase/server'
import { verifyApprovedBrand } from '@/lib/brand-auth'
import Link from 'next/link'
import DealsTable from './DealsTable'

export default async function DealsListPage() {
  await verifyApprovedBrand()

  const supabase = createClient()
  const [{ data: deals, error }, { data: invoices }] = await Promise.all([
    supabase
      .from('deals')
      .select('id, title, deliverables, price_paise, fee_percent, fee_mode, price_per_extra_revision_paise, revisions_used, revision_limit, status, created_at, creators(id, full_name, profile_photo_url)')
      .order('created_at', { ascending: false }),
    supabase
      .from('invoices')
      .select('deal_id, status, due_date'),
  ])

  if (error) {
    return (
      <section style={container}>
        <p style={{ color: '#dc2626' }}>Error loading deals: {error.message}</p>
      </section>
    )
  }

  // Index invoices by deal_id for quick lookup
  const invoiceMap = new Map<string, { status: string; due_date: string | null }>()
  for (const inv of invoices ?? []) {
    invoiceMap.set(inv.deal_id, { status: inv.status, due_date: inv.due_date })
  }

  const all = (deals ?? []).map((d) => {
    // Supabase returns the joined creator as an object (not array) for a non-null FK,
    // but the type comes back as unknown — handle both shapes defensively
    const raw = d.creators as unknown
    const creator = Array.isArray(raw) ? raw[0] ?? null : (raw as { id: string; full_name: string; profile_photo_url: string | null } | null)
    const inv = invoiceMap.get(d.id) ?? null
    return { ...d, creator, invoiceStatus: inv?.status ?? null, invoiceDueDate: inv?.due_date ?? null }
  })

  return (
    <section style={container}>
      <div style={{ marginBottom: '2rem', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <h1 style={{ fontFamily: 'var(--font-heading)', fontSize: '1.75rem', fontWeight: 700, color: 'var(--color-heading)', margin: '0 0 0.375rem' }}>
            Your Deals
          </h1>
          <p style={{ color: 'var(--color-muted)', fontSize: '0.9375rem', margin: 0 }}>
            {all.length} deal{all.length !== 1 ? 's' : ''}
          </p>
        </div>
        <Link
          href="/browse"
          style={{ padding: '0.5rem 1rem', background: '#111', color: '#fff', borderRadius: 8, fontWeight: 600, fontSize: '0.875rem', textDecoration: 'none', whiteSpace: 'nowrap' }}
        >
          + New Deal
        </Link>
      </div>

      {all.length === 0 ? (
        <div style={{ padding: '3rem', textAlign: 'center' }}>
          <p style={{ fontSize: '1rem', fontWeight: 600, color: 'var(--color-heading)' }}>No deals yet</p>
          <p style={{ fontSize: '0.875rem', color: 'var(--color-muted)', margin: '0.25rem 0 1rem' }}>
            Browse creators and start your first deal.
          </p>
          <Link href="/browse" style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--color-heading)', textDecoration: 'none' }}>
            Browse creators &rarr;
          </Link>
        </div>
      ) : (
        <DealsTable deals={all} />
      )}
    </section>
  )
}

const container: React.CSSProperties = {
  padding: '2.5rem var(--container-pad)',
  maxWidth: 'var(--container-width)',
  margin: '0 auto',
}

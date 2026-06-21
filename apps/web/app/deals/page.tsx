import { createClient } from '@/lib/supabase/server'
import { verifyApprovedBrand } from '@/lib/brand-auth'
import Link from 'next/link'
import DealsTable from './DealsTable'

export default async function DealsListPage() {
  await verifyApprovedBrand()

  const supabase = createClient()
  const { data: deals, error } = await supabase
    .from('deals')
    .select('id, title, deliverables, price_paise, status, created_at, creators(id, full_name, profile_photo_url)')
    .order('created_at', { ascending: false })

  if (error) {
    return (
      <section style={container}>
        <p style={{ color: '#dc2626' }}>Error loading deals: {error.message}</p>
      </section>
    )
  }

  const all = (deals ?? []).map((d) => {
    const creatorArr = d.creators as unknown as { id: string; full_name: string; profile_photo_url: string | null }[] | null
    return { ...d, creator: creatorArr?.[0] ?? null }
  })

  return (
    <section style={container}>
      <div style={{ marginBottom: '2rem' }}>
        <h1 style={{ fontFamily: 'var(--font-heading)', fontSize: '1.75rem', fontWeight: 700, color: 'var(--color-heading)', margin: '0 0 0.375rem' }}>
          Your Deals
        </h1>
        <p style={{ color: 'var(--color-muted)', fontSize: '0.9375rem', margin: 0 }}>
          {all.length} deal{all.length !== 1 ? 's' : ''}
        </p>
      </div>

      {all.length === 0 ? (
        <div style={{ padding: '3rem', textAlign: 'center' }}>
          <p style={{ fontSize: '1rem', fontWeight: 600, color: 'var(--color-heading)' }}>No deals yet</p>
          <p style={{ fontSize: '0.875rem', color: 'var(--color-muted)', margin: '0.25rem 0 1rem' }}>
            Browse creators and start your first deal.
          </p>
          <Link href="/browse" style={{ fontSize: '0.875rem', fontWeight: 600, color: '#2563eb', textDecoration: 'none' }}>
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

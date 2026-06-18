import { createAdminClient } from '@/lib/supabase/admin'
import { verifyOpsAccess } from '@/lib/ops-auth'
import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import CreatorTabs from './CreatorTabs'

export default async function CreatorDetailPage({ params }: { params: { id: string } }) {
  const user = await verifyOpsAccess()
  if (!user) redirect('/login')

  const admin = createAdminClient()
  const { data: creator, error } = await admin
    .from('creators')
    .select('id, full_name, phone, niches, handle, bio, profile_photo_url, social_accounts, worked_with, portfolio_links, rate_card, is_vetted, created_at, updated_at')
    .eq('id', params.id)
    .maybeSingle()

  if (error || !creator) notFound()

  const { data: products } = await admin
    .from('creator_products')
    .select('id, platform, handle, product_type, description, price_paise, display_price, is_active, created_at')
    .eq('creator_id', params.id)
    .order('created_at', { ascending: false })

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.5rem' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.25rem' }}>
            <h1 style={{ fontSize: '1.25rem', fontWeight: 700, margin: 0 }}>{creator.full_name}</h1>
            {creator.is_vetted ? (
              <span style={{ fontSize: '0.7rem', fontWeight: 600, padding: '0.15rem 0.5rem', borderRadius: 9999, background: '#dcfce7', color: '#166534', border: '1px solid #bbf7d0' }}>Vetted</span>
            ) : (
              <span style={{ fontSize: '0.7rem', fontWeight: 600, padding: '0.15rem 0.5rem', borderRadius: 9999, background: '#fef3c7', color: '#92400e', border: '1px solid #fcd34d' }}>Pending</span>
            )}
          </div>
          <p style={{ color: '#888', fontSize: '0.75rem', margin: 0 }}>
            Added {new Date(creator.created_at).toLocaleDateString()}
            {creator.handle && <> &middot; {creator.handle}</>}
            {(creator.niches as string[])?.length > 0 && <> &middot; {(creator.niches as string[]).join(', ')}</>}
          </p>
        </div>
        <Link
          href={`/ops/creators/${creator.id}/edit`}
          style={{
            padding: '0.5rem 1rem',
            background: '#111',
            color: '#fff',
            borderRadius: 6,
            fontWeight: 600,
            fontSize: '0.8125rem',
            textDecoration: 'none',
          }}
        >
          Edit
        </Link>
      </div>

      <CreatorTabs creator={creator} products={products ?? []} />
    </div>
  )
}

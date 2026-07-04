import { createAdminClient } from '@/lib/supabase/admin'
import { verifyOpsAccess } from '@/lib/ops-auth'
import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import EditBrandForm from './EditBrandForm'

const STATUS_COLORS: Record<string, { bg: string; color: string }> = {
  negotiating: { bg: '#dbeafe', color: '#1e40af' },
  agreed:      { bg: '#dcfce7', color: '#166534' },
  delivered:   { bg: '#fef9c3', color: '#854d0e' },
  revision:    { bg: '#ffedd5', color: '#9a3412' },
  approved:    { bg: '#dcfce7', color: '#166534' },
  paid:        { bg: '#d1fae5', color: '#065f46' },
  complete:    { bg: '#f3f4f6', color: '#374151' },
  declined:    { bg: '#fee2e2', color: '#991b1b' },
  cancelled:   { bg: '#f3f4f6', color: '#6b7280' },
}

export default async function EditBrandPage({ params }: { params: { id: string } }) {
  const user = await verifyOpsAccess()
  if (!user) redirect('/login')

  const admin = createAdminClient()

  const [{ data: brand, error }, { data: deals }] = await Promise.all([
    admin
      .from('brands')
      .select('id, name, category, company_size, website, contact_name, contact_email, social_accounts, platform_fee_percent, fee_mode')
      .eq('id', params.id)
      .maybeSingle(),
    admin
      .from('deals')
      .select('id, title, status, price_paise, created_at, creators(full_name)')
      .eq('brand_id', params.id)
      .order('created_at', { ascending: false }),
  ])

  if (error || !brand) notFound()

  return (
    <div>
      <h1 style={{ fontSize: '1.25rem', fontWeight: 700, marginBottom: '0.25rem' }}>Edit brand</h1>
      <p style={{ color: '#666', fontSize: '0.8125rem', marginBottom: '1.5rem' }}>
        Editing: <strong>{brand.name}</strong>
      </p>
      <EditBrandForm brand={brand} />

      {/* Deals section */}
      <div style={{ marginTop: '2.5rem' }}>
        <h2 style={{ fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', color: '#555', marginBottom: '0.75rem' }}>
          Deals ({deals?.length ?? 0})
        </h2>
        {(!deals || deals.length === 0) ? (
          <p style={{ fontSize: '0.8125rem', color: '#888' }}>No deals for this brand.</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {deals.map((d) => {
              const creator = (d.creators as any)?.full_name ?? '—'
              const sc = STATUS_COLORS[d.status] ?? { bg: '#f3f4f6', color: '#6b7280' }
              return (
                <Link
                  key={d.id}
                  href={`/ops/deals/${d.id}`}
                  style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.75rem', border: '1px solid #e5e5e5', borderRadius: 6, background: '#fafafa', textDecoration: 'none', color: '#111' }}
                >
                  <div>
                    <span style={{ fontSize: '0.8125rem', fontWeight: 700 }}>{d.title || 'Untitled'}</span>
                    <p style={{ fontSize: '0.75rem', color: '#888', margin: '0.1rem 0 0' }}>
                      {creator} &middot; {new Date(d.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                    </p>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                    {d.price_paise != null && d.price_paise > 0 && (
                      <span style={{ fontSize: '0.8125rem', fontWeight: 600, fontFamily: 'monospace' }}>
                        {'\u20B9'}{(d.price_paise / 100).toLocaleString('en-IN')}
                      </span>
                    )}
                    <span style={{ fontSize: '0.6875rem', fontWeight: 600, padding: '0.15rem 0.5rem', borderRadius: 9999, background: sc.bg, color: sc.color, textTransform: 'capitalize', whiteSpace: 'nowrap' }}>
                      {d.status}
                    </span>
                  </div>
                </Link>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

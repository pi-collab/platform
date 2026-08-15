import { createAdminClient } from '@/lib/supabase/admin'
import { verifyOpsAccess } from '@/lib/ops-auth'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import BrandStatusActions from './BrandStatusActions'

export default async function OpsBrandsPage() {
  const user = await verifyOpsAccess()
  if (!user) redirect('/login')

  const admin = createAdminClient()
  const { data: brands, error } = await admin
    .from('brands')
    .select('id, name, category, company_size, website, contact_name, contact_email, brand_status, created_at')
    .order('created_at', { ascending: false })

  if (error) return <p style={{ color: 'red' }}>Error loading brands: {error.message}</p>

  // Review queue: brands whose first send is held. ONE task per brand however
  // many deals a bulk send queued — the gate is on the brand, not the deal, and
  // approving releases all of them together.
  const pending = (brands ?? []).filter((b) => b.brand_status === 'pending_review')

  const { data: heldRows } = await admin
    .from('deals')
    .select('brand_id')
    .not('held_at', 'is', null)

  const heldByBrand = new Map<string, number>()
  for (const r of heldRows ?? []) {
    heldByBrand.set(r.brand_id, (heldByBrand.get(r.brand_id) ?? 0) + 1)
  }

  return (
    <div>
      <h1 style={{ fontSize: '1.25rem', fontWeight: 700, marginBottom: '1rem' }}>Brands</h1>

      {pending.length > 0 && (
        <section style={{ marginBottom: '2rem', border: '1px solid #E3C77A', background: '#FFFEF3', borderRadius: 12, padding: '1rem 1.25rem' }}>
          <h2 style={{ fontSize: '1rem', fontWeight: 700, margin: '0 0 4px' }}>
            Awaiting approval ({pending.length})
          </h2>
          <p style={{ fontSize: '0.8125rem', color: '#7A6D61', margin: '0 0 12px', lineHeight: 1.5 }}>
            These brands tried to send their first deal. Nothing has reached a creator.
            Approving releases every held deal for that brand automatically.
          </p>
          <table style={tableStyle}>
            <thead>
              <tr>
                <th style={thStyle}>Brand</th>
                <th style={thStyle}>Contact</th>
                <th style={thStyle}>Held deals</th>
                <th style={thStyle}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {pending.map((b) => (
                <tr key={b.id}>
                  <td style={tdStyle}>
                    <Link href={`/ops/brands/${b.id}/edit`}>{b.name}</Link>
                  </td>
                  <td style={tdStyle} data-ph-mask>{b.contact_email || '—'}</td>
                  <td style={tdStyle}>
                    <strong>{heldByBrand.get(b.id) ?? 0}</strong> held
                  </td>
                  <td style={tdStyle}>
                    <BrandStatusActions brandId={b.id} currentStatus={b.brand_status} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      {!brands || brands.length === 0 ? (
        <p style={{ color: '#888', fontSize: '0.875rem' }}>No brands registered yet.</p>
      ) : (
        <table style={tableStyle}>
          <thead>
            <tr>
              <th style={thStyle}>Name</th>
              <th style={thStyle}>Category</th>
              <th style={thStyle}>Status</th>
              <th style={thStyle}>Website</th>
              <th style={thStyle}>Contact</th>
              <th style={thStyle}>Created</th>
              <th style={thStyle}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {brands.map((b) => (
              <tr key={b.id}>
                <td style={tdStyle}><strong>{b.name}</strong></td>
                <td style={tdStyle}>{b.category || '—'}</td>
                <td style={tdStyle}>
                  <span style={statusBadge(b.brand_status)}>{b.brand_status}</span>
                </td>
                <td style={tdStyle}>
                  {b.website ? (
                    <a href={b.website} target="_blank" rel="noopener noreferrer" style={{ color: '#2563eb', fontSize: '0.8125rem' }}>
                      {b.website}
                    </a>
                  ) : '—'}
                </td>
                <td style={tdStyle}>
                  {b.contact_name || '—'}
                  {b.contact_email && <div style={{ fontSize: '0.75rem', color: '#888' }}>{b.contact_email}</div>}
                </td>
                <td style={tdStyle}>{new Date(b.created_at).toLocaleDateString()}</td>
                <td style={tdStyle}>
                  <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                    <BrandStatusActions brandId={b.id} currentStatus={b.brand_status} />
                    <Link
                      href={`/ops/brands/${b.id}/edit`}
                      style={{ color: '#2563eb', fontSize: '0.8125rem', textDecoration: 'none', fontWeight: 600 }}
                    >
                      Edit
                    </Link>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}

function statusBadge(status: string): React.CSSProperties {
  const colors: Record<string, { bg: string; color: string }> = {
    approved: { bg: '#dcfce7', color: '#166534' },
    pending: { bg: '#fef9c3', color: '#854d0e' },
    rejected: { bg: '#fee2e2', color: '#991b1b' },
  }
  const c = colors[status] ?? { bg: '#f3f4f6', color: '#6b7280' }
  return {
    fontSize: '0.6875rem',
    fontWeight: 600,
    padding: '0.15rem 0.5rem',
    borderRadius: 9999,
    background: c.bg,
    color: c.color,
    textTransform: 'capitalize',
  }
}

const tableStyle: React.CSSProperties = {
  width: '100%',
  borderCollapse: 'collapse',
  fontSize: '0.8125rem',
}
const thStyle: React.CSSProperties = {
  textAlign: 'left',
  padding: '0.5rem 0.75rem',
  borderBottom: '2px solid #e5e5e5',
  fontWeight: 600,
  fontSize: '0.75rem',
  textTransform: 'uppercase',
  letterSpacing: '0.04em',
  color: '#888',
}
const tdStyle: React.CSSProperties = {
  padding: '0.5rem 0.75rem',
  borderBottom: '1px solid #f0f0f0',
}

import { createAdminClient } from '@/lib/supabase/admin'
import { verifyOpsAccess } from '@/lib/ops-auth'
import { redirect } from 'next/navigation'
import Link from 'next/link'

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

export default async function OpsDealsPage() {
  const user = await verifyOpsAccess()
  if (!user) redirect('/login/brand')

  const admin = createAdminClient()

  const { data: deals, error } = await admin
    .from('deals')
    .select('id, deal_ref, title, status, price_paise, created_at, brands(name), creators(full_name)')
    .order('created_at', { ascending: false })

  if (error) {
    return <p style={{ color: '#dc2626' }}>Error: {error.message}</p>
  }

  return (
    <div>
      <h1 style={{ fontSize: '1.25rem', fontWeight: 700, marginBottom: '0.25rem' }}>All Deals</h1>
      <p style={{ fontSize: '0.8125rem', color: '#666', marginBottom: '1.5rem' }}>
        {deals?.length ?? 0} deal{(deals?.length ?? 0) !== 1 ? 's' : ''} across all brands and creators.
      </p>

      {(!deals || deals.length === 0) ? (
        <p style={{ color: '#888', fontSize: '0.875rem' }}>No deals yet.</p>
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8125rem' }}>
          <thead>
            <tr style={{ borderBottom: '2px solid #e5e5e5', textAlign: 'left' }}>
              <th style={th}>Deal</th>
              <th style={th}>Brand</th>
              <th style={th}>Creator</th>
              <th style={th}>Status</th>
              <th style={th}>Price</th>
              <th style={th}>Created</th>
            </tr>
          </thead>
          <tbody>
            {deals.map((d) => {
              const brand = (d.brands as any)?.name ?? '—'
              const creator = (d.creators as any)?.full_name ?? '—'
              const price = d.price_paise ? `\u20B9${(d.price_paise / 100).toLocaleString('en-IN')}` : '—'
              const sc = STATUS_COLORS[d.status] ?? { bg: '#f3f4f6', color: '#6b7280' }

              return (
                <tr key={d.id} style={{ borderBottom: '1px solid #f0f0f0' }}>
                  <td style={td}>
                    <Link href={`/ops/deals/${d.id}`} style={{ color: '#111', textDecoration: 'none', fontWeight: 600 }}>
                      {d.title || 'Untitled'}
                    </Link>
                    <br />
                    <span style={{ fontSize: '0.6875rem', color: '#888', fontFamily: 'monospace' }}>
                      {d.deal_ref || d.id.slice(0, 8)}
                    </span>
                  </td>
                  <td style={td}>{brand}</td>
                  <td style={td}>{creator}</td>
                  <td style={td}>
                    <span style={{ fontSize: '0.6875rem', fontWeight: 600, padding: '0.15rem 0.5rem', borderRadius: 9999, background: sc.bg, color: sc.color, textTransform: 'capitalize', whiteSpace: 'nowrap' }}>
                      {d.status}
                    </span>
                  </td>
                  <td style={{ ...td, fontFamily: 'monospace' }}>{price}</td>
                  <td style={td}>
                    {new Date(d.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      )}
    </div>
  )
}

const th: React.CSSProperties = { padding: '0.5rem 0.75rem', fontWeight: 600, fontSize: '0.6875rem', textTransform: 'uppercase', letterSpacing: '0.04em', color: '#888' }
const td: React.CSSProperties = { padding: '0.625rem 0.75rem', verticalAlign: 'top' }

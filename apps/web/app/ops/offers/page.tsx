import { createAdminClient } from '@/lib/supabase/admin'
import { verifyOpsAccess } from '@/lib/ops-auth'
import { redirect } from 'next/navigation'
import GenerateLinkButton from './GenerateLinkButton'

export default async function OpsOffersPage() {
  const user = await verifyOpsAccess()
  if (!user) redirect('/login')

  const admin = createAdminClient()

  const { data: deals, error } = await admin
    .from('deals')
    .select('id, title, status, price_paise, created_at, brands(name), creators(full_name)')
    .eq('status', 'negotiating')
    .order('created_at', { ascending: false })

  if (error) {
    return <p style={{ color: '#dc2626' }}>Error: {error.message}</p>
  }

  return (
    <div>
      <h1 style={{ fontSize: '1.25rem', fontWeight: 700, marginBottom: '0.25rem' }}>Generate Offer Links</h1>
      <p style={{ fontSize: '0.8125rem', color: '#666', marginBottom: '1.5rem' }}>
        Deals in &quot;negotiating&quot; status. Generate a signed link to send to the creator.
      </p>

      {(!deals || deals.length === 0) ? (
        <p style={{ color: '#888', fontSize: '0.875rem' }}>No deals in negotiating status.</p>
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8125rem' }}>
          <thead>
            <tr style={{ borderBottom: '2px solid #e5e5e5', textAlign: 'left' }}>
              <th style={th}>Deal</th>
              <th style={th}>Brand</th>
              <th style={th}>Creator</th>
              <th style={th}>Price</th>
              <th style={th}>Created</th>
              <th style={th}></th>
            </tr>
          </thead>
          <tbody>
            {deals.map((d) => {
              const brand = (d.brands as any)?.name ?? '—'
              const creator = (d.creators as any)?.full_name ?? '—'
              const price = d.price_paise ? `₹${(d.price_paise / 100).toLocaleString('en-IN')}` : '—'
              return (
                <tr key={d.id} style={{ borderBottom: '1px solid #f0f0f0' }}>
                  <td style={td}>
                    <span style={{ fontWeight: 600 }}>{d.title || 'Untitled'}</span>
                    <br />
                    <span style={{ fontSize: '0.6875rem', color: '#888' }}>{d.id.slice(0, 8)}...</span>
                  </td>
                  <td style={td}>{brand}</td>
                  <td style={td}>{creator}</td>
                  <td style={td}>{price}</td>
                  <td style={td}>{new Date(d.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}</td>
                  <td style={td}>
                    <GenerateLinkButton dealId={d.id} />
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

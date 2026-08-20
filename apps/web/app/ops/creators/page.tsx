import { createAdminClient } from '@/lib/supabase/admin'
import { followerRangeOf } from '@/lib/follower-range'
import { verifyOpsAccess } from '@/lib/ops-auth'
import { redirect } from 'next/navigation'
import Link from 'next/link'

export default async function OpsCreatorsPage() {
  const user = await verifyOpsAccess()
  if (!user) redirect('/login/brand')

  const admin = createAdminClient()
  const { data: creators, error } = await admin
    .from('creators')
    .select('id, full_name, phone, niches, handle, social_accounts, is_vetted, is_rejected, rate_card, created_at')
    .order('created_at', { ascending: false })

  if (error) return <p style={{ color: 'red' }}>Error loading creators: {error.message}</p>

  const all = creators ?? []
  const vetted = all.filter((c) => c.is_vetted).length
  const rejected = all.filter((c) => c.is_rejected).length
  const pending = all.length - vetted - rejected

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
        <div>
          <h1 style={{ fontSize: '1.25rem', fontWeight: 700, margin: 0 }}>Creators</h1>
          <p style={{ color: '#666', fontSize: '0.8125rem', margin: '0.25rem 0 0' }}>
            {all.length} total &middot; {vetted} vetted &middot; {pending} pending &middot; {rejected} rejected
          </p>
        </div>
        <Link
          href="/ops/creators/new"
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
          + Add Creator
        </Link>
      </div>

      {all.length === 0 ? (
        <p style={{ color: '#888', fontSize: '0.875rem' }}>No creators yet.</p>
      ) : (
        <table style={tableStyle}>
          <thead>
            <tr>
              <th style={thStyle}>Name</th>
              <th style={thStyle}>Handle</th>
              <th style={thStyle}>Niches</th>
              <th style={thStyle}>Audience</th>
              <th style={thStyle}>Phone</th>
              <th style={thStyle}>Status</th>
              <th style={thStyle}>Created</th>
            </tr>
          </thead>
          <tbody>
            {all.map((c) => {
              return (
                <tr key={c.id}>
                  <td style={tdStyle}>
                    <Link href={`/ops/creators/${c.id}`} style={{ color: '#2563eb', fontWeight: 700, textDecoration: 'none', fontSize: '0.8125rem' }}>
                      {c.full_name}
                    </Link>
                  </td>
                  <td style={tdStyle}>{c.handle || '—'}</td>
                  <td style={tdStyle}>{(c.niches as string[] | null)?.join(', ') || '—'}</td>
                  <td style={tdStyle}>{followerRangeOf(c.social_accounts) || '—'}</td>
                  <td style={tdStyle} data-ph-mask>{c.phone || '—'}</td>
                  <td style={tdStyle}>
                    {c.is_vetted ? (
                      <span style={vettedBadge}>Vetted</span>
                    ) : c.is_rejected ? (
                      <span style={rejectedBadge}>Rejected</span>
                    ) : (
                      <span style={pendingBadge}>Pending</span>
                    )}
                  </td>
                  <td style={tdStyle}>{new Date(c.created_at).toLocaleDateString()}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      )}
    </div>
  )
}

const tableStyle: React.CSSProperties = { width: '100%', borderCollapse: 'collapse', fontSize: '0.8125rem' }
const thStyle: React.CSSProperties = { textAlign: 'left', padding: '0.5rem 0.75rem', borderBottom: '2px solid #e5e5e5', fontWeight: 600, fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.04em', color: '#888' }
const tdStyle: React.CSSProperties = { padding: '0.5rem 0.75rem', borderBottom: '1px solid #f0f0f0' }
const vettedBadge: React.CSSProperties = { fontSize: '0.7rem', fontWeight: 600, padding: '0.15rem 0.5rem', borderRadius: 9999, background: '#dcfce7', color: '#166534', border: '1px solid #bbf7d0' }
const pendingBadge: React.CSSProperties = { fontSize: '0.7rem', fontWeight: 600, padding: '0.15rem 0.5rem', borderRadius: 9999, background: '#fef3c7', color: '#92400e', border: '1px solid #fcd34d' }
const rejectedBadge: React.CSSProperties = { fontSize: '0.7rem', fontWeight: 600, padding: '0.15rem 0.5rem', borderRadius: 9999, background: '#fee2e2', color: '#991b1b', border: '1px solid #fca5a5' }

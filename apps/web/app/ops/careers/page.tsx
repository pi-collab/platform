import Link from 'next/link'
import { redirect } from 'next/navigation'
import { verifyOpsAccess } from '@/lib/ops-auth'
import { listRoles } from '@/lib/careers'
import PublishToggle from './PublishToggle'

export const dynamic = 'force-dynamic'

export default async function OpsCareersPage() {
  const user = await verifyOpsAccess()
  if (!user) redirect('/login/brand')

  // publishedOnly: false — ops is the only place drafts are visible.
  const roles = await listRoles({ publishedOnly: false })
  const live = roles.filter((r) => r.isPublished).length

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
        <div>
          <h1 style={{ fontSize: '1.25rem', fontWeight: 700, margin: 0 }}>Careers</h1>
          <p style={{ color: '#888', fontSize: '0.75rem', margin: '0.25rem 0 0' }}>
            {roles.length} role{roles.length === 1 ? '' : 's'} &middot; {live} published &middot; {roles.length - live} draft
          </p>
        </div>
        <Link href="/ops/careers/new" style={{ padding: '0.5rem 1rem', background: '#111', color: '#fff', borderRadius: 6, fontWeight: 600, fontSize: '0.8125rem', textDecoration: 'none' }}>
          New role
        </Link>
      </div>

      {roles.length === 0 ? (
        <p style={{ color: '#888', fontSize: '0.875rem' }}>No roles yet. Create one and it appears on /careers once published.</p>
      ) : (
        <div style={{ overflowX: 'auto', width: '100%' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8125rem' }}>
            <thead>
              <tr>
                <th style={th}>Title</th>
                <th style={th}>Team</th>
                <th style={th}>URL</th>
                <th style={th}>Order</th>
                <th style={th}>Status</th>
                <th style={th}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {roles.map((r) => (
                <tr key={r.id}>
                  <td style={td}><strong>{r.title}</strong></td>
                  <td style={td}>{r.team || '-'}</td>
                  <td style={td}>
                    {r.isPublished
                      ? <a href={`/careers/${r.slug}`} target="_blank" rel="noopener noreferrer" style={{ color: '#2563eb', textDecoration: 'none' }}>/careers/{r.slug}</a>
                      : <span style={{ color: '#888' }}>/careers/{r.slug}</span>}
                  </td>
                  <td style={td}>{r.sortOrder}</td>
                  <td style={td}>
                    <span style={r.isPublished ? liveBadge : draftBadge}>{r.isPublished ? 'Published' : 'Draft'}</span>
                  </td>
                  <td style={td}>
                    <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                      <Link href={`/ops/careers/${r.id}`} style={{ color: '#2563eb', textDecoration: 'none', fontWeight: 600 }}>Edit</Link>
                      <PublishToggle id={r.id} published={r.isPublished} />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

const th: React.CSSProperties = { textAlign: 'left', padding: '0.5rem 0.75rem', borderBottom: '2px solid #e5e5e5', fontWeight: 600, fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.04em', color: '#888' }
const td: React.CSSProperties = { padding: '0.5rem 0.75rem', borderBottom: '1px solid #f0f0f0' }
const liveBadge: React.CSSProperties = { fontSize: '0.7rem', fontWeight: 600, padding: '0.15rem 0.5rem', borderRadius: 9999, background: '#dcfce7', color: '#166534', border: '1px solid #bbf7d0' }
const draftBadge: React.CSSProperties = { fontSize: '0.7rem', fontWeight: 600, padding: '0.15rem 0.5rem', borderRadius: 9999, background: '#f4f4f5', color: '#52525b', border: '1px solid #e4e4e7' }

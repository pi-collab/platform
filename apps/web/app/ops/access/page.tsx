import { verifyOpsAccess } from '@/lib/ops-auth'
import { redirect } from 'next/navigation'

export default async function OpsAccessPage() {
  const user = await verifyOpsAccess()
  if (!user) redirect('/login')

  const nameMap: Record<string, string> = {
    'utkarshverma0007@gmail.com': 'Utkarsh',
    'palak13071992@gmail.com': 'Palak',
    'reyeechand@gmail.com': 'Chan',
    'contact@guapd.com': 'Guapd',
  }

  const orderPriority = [
    'utkarshverma0007@gmail.com',
    'palak13071992@gmail.com',
    'reyeechand@gmail.com',
    'contact@guapd.com',
  ]

  const raw = process.env.OPS_ALLOWED_EMAILS ?? ''
  const emailsRaw = raw
    .split(',')
    .map((e) => e.trim())
    .filter(Boolean)

  const emails = [...emailsRaw].sort((a, b) => {
    const ai = orderPriority.indexOf(a.toLowerCase())
    const bi = orderPriority.indexOf(b.toLowerCase())
    if (ai !== -1 && bi !== -1) return ai - bi
    if (ai !== -1) return -1
    if (bi !== -1) return 1
    return 0
  })

  return (
    <div>
      <h1 style={{ fontSize: '1.25rem', fontWeight: 700, marginBottom: '0.25rem' }}>Ops Access</h1>
      <p style={{ color: '#666', fontSize: '0.8125rem', marginBottom: '1.5rem' }}>
        {emails.length} user{emails.length !== 1 ? 's' : ''} with ops console access.
      </p>

      <table style={tableStyle}>
        <thead>
          <tr>
            <th style={thStyle}>#</th>
            <th style={thStyle}>Name</th>
            <th style={thStyle}>Email</th>
            <th style={thStyle}>Status</th>
          </tr>
        </thead>
        <tbody>
          {emails.map((email, i) => (
            <tr key={email}>
              <td style={tdStyle}>{i + 1}</td>
              <td style={tdStyle}><strong>{nameMap[email.toLowerCase()] ?? '—'}</strong></td>
              <td style={tdStyle}>{email}</td>
              <td style={tdStyle}>
                <span style={{
                  fontSize: '0.75rem',
                  fontWeight: 600,
                  padding: '0.2rem 0.5rem',
                  borderRadius: 9999,
                  background: '#f0fdf4',
                  color: '#166534',
                  border: '1px solid #bbf7d0',
                }}>
                  Active
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <p style={{ marginTop: '1.5rem', fontSize: '0.75rem', color: '#999' }}>
        To add or remove access, update the <code>OPS_ALLOWED_EMAILS</code> environment variable and redeploy.
      </p>
    </div>
  )
}

const tableStyle: React.CSSProperties = {
  width: '100%',
  maxWidth: 560,
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

import { verifyOpsAccess } from '@/lib/ops-auth'
import { redirect } from 'next/navigation'

export default async function OpsAccessPage() {
  const user = await verifyOpsAccess()
  if (!user) redirect('/login/brand')

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

  function parse(raw: string | undefined) {
    return (raw ?? '').split(',').map((e) => e.trim()).filter(Boolean)
  }
  function ordered(list: string[]) {
    return [...list].sort((a, b) => {
      const ai = orderPriority.indexOf(a.toLowerCase())
      const bi = orderPriority.indexOf(b.toLowerCase())
      if (ai !== -1 && bi !== -1) return ai - bi
      if (ai !== -1) return -1
      if (bi !== -1) return 1
      return 0
    })
  }

  const emails = ordered(parse(process.env.OPS_ALLOWED_EMAILS))
  const outreach = ordered(parse(process.env.OPS_OUTREACH_EMAILS))

  /* Someone in both lists is an admin — resolveOpsActor() checks admin first.
     Worth showing, because reading the two tables separately would suggest
     they hold the narrow role when they do not. */
  const adminSet = new Set(emails.map((e) => e.toLowerCase()))
  const alsoAdmin = outreach.filter((e) => adminSet.has(e.toLowerCase()))

  return (
    <div>
      <h1 style={{ fontSize: '1.25rem', fontWeight: 700, marginBottom: '0.25rem' }}>Ops Access</h1>
      <p style={{ color: '#666', fontSize: '0.8125rem', marginBottom: '1.5rem' }}>
        {emails.length} full admin{emails.length !== 1 ? 's' : ''}
        {outreach.length > 0 && <> &middot; {outreach.length} outreach</>}.
      </p>

      <h2 style={sectionHead}>Full ops admin</h2>
      <p style={sectionNote}>
        Every ops action, including fee overrides, deal data and deleting a creator.
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
              <td style={tdStyle}><strong>{nameMap[email.toLowerCase()] ?? '-'}</strong></td>
              <td style={tdStyle}>{email}</td>
              <td style={tdStyle}><span style={badge('#f0fdf4', '#166534', '#bbf7d0')}>Admin</span></td>
            </tr>
          ))}
        </tbody>
      </table>

      <h2 style={{ ...sectionHead, marginTop: '2rem' }}>Outreach (scoped)</h2>
      <p style={sectionNote}>
        <strong>Read-only on the platform.</strong> Can look up brands and creators and
        read insights; cannot vet, approve, add, edit or delete anything there, and cannot
        see fees or deal values. Their only write access is the pipeline board, and every
        pipeline write is recorded in <code>ops_events</code>.
      </p>
      {outreach.length === 0 ? (
        <p style={{ fontSize: '0.8125rem', color: '#888' }}>
          Nobody yet. Set <code>OPS_OUTREACH_EMAILS</code> to grant this role.
        </p>
      ) : (
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
            {outreach.map((email, i) => {
              const isAlsoAdmin = adminSet.has(email.toLowerCase())
              return (
                <tr key={email}>
                  <td style={tdStyle}>{i + 1}</td>
                  <td style={tdStyle}><strong>{nameMap[email.toLowerCase()] ?? '-'}</strong></td>
                  <td style={tdStyle}>{email}</td>
                  <td style={tdStyle}>
                    {isAlsoAdmin
                      ? <span style={badge('#f0fdf4', '#166534', '#bbf7d0')}>Admin (overrides)</span>
                      : <span style={badge('#f3e8ff', '#6b21a8', '#e9d5ff')}>Outreach</span>}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      )}

      {alsoAdmin.length > 0 && (
        <p style={{ marginTop: '0.75rem', fontSize: '0.75rem', color: '#92400e' }}>
          {alsoAdmin.length === 1 ? 'One address is' : `${alsoAdmin.length} addresses are`} in both
          lists and {alsoAdmin.length === 1 ? 'holds' : 'hold'} full admin. Admin is checked first,
          so the outreach listing does not narrow them.
        </p>
      )}

      <p style={{ marginTop: '1.5rem', fontSize: '0.75rem', color: '#999' }}>
        To change access, update <code>OPS_ALLOWED_EMAILS</code> or <code>OPS_OUTREACH_EMAILS</code> and redeploy.
      </p>
    </div>
  )
}

function badge(bg: string, color: string, border: string): React.CSSProperties {
  return {
    fontSize: '0.75rem', fontWeight: 600, padding: '0.2rem 0.5rem',
    borderRadius: 9999, background: bg, color, border: `1px solid ${border}`,
  }
}

const sectionHead: React.CSSProperties = {
  fontSize: '0.875rem', fontWeight: 700, margin: '0 0 0.2rem', color: '#111',
}
const sectionNote: React.CSSProperties = {
  fontSize: '0.75rem', color: '#6b7280', margin: '0 0 0.6rem', maxWidth: 560, lineHeight: 1.5,
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

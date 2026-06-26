import Link from 'next/link'

export default function OpsIndex() {
  return (
    <div>
      <h1 style={{ fontSize: '1.5rem', fontWeight: 700, marginBottom: '1rem' }}>Ops Console</h1>
      <p style={{ color: '#555', marginBottom: '1.5rem' }}>Internal founder tooling. Manage creators and view brands.</p>
      <div style={{ display: 'flex', gap: '1rem' }}>
        <Link href="/ops/creators" style={cardStyle}>
          <strong>Creators</strong>
          <span style={{ fontSize: '0.8125rem', color: '#666' }}>View, vet, and manage creators</span>
        </Link>
        <Link href="/ops/brands" style={cardStyle}>
          <strong>Brands</strong>
          <span style={{ fontSize: '0.8125rem', color: '#666' }}>View registered brands</span>
        </Link>
        <Link href="/ops/deals" style={cardStyle}>
          <strong>Deals</strong>
          <span style={{ fontSize: '0.8125rem', color: '#666' }}>Monitor all deals across the platform</span>
        </Link>
        <Link href="/ops/offers" style={cardStyle}>
          <strong>Offer Links</strong>
          <span style={{ fontSize: '0.8125rem', color: '#666' }}>Generate signed offer links</span>
        </Link>
        <Link href="/ops/access" style={cardStyle}>
          <strong>Access</strong>
          <span style={{ fontSize: '0.8125rem', color: '#666' }}>Manage ops console users</span>
        </Link>
      </div>
    </div>
  )
}

const cardStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '0.25rem',
  padding: '1rem 1.25rem',
  border: '1px solid #e5e5e5',
  borderRadius: 8,
  textDecoration: 'none',
  color: '#111',
  flex: 1,
}

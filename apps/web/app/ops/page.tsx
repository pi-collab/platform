import Link from 'next/link'
import { redirect } from 'next/navigation'
import { resolveOpsActor } from '@/lib/ops-capabilities'

/**
 * The index. This is the ONE page under /ops with no gate of its own — it
 * relied entirely on the layout, which was safe while ops access was binary.
 * Now that the shell renders for two roles it needs to know which, so the
 * cards do not advertise pages the caller will be turned away from.
 */
export default async function OpsIndex() {
  const actor = await resolveOpsActor()
  if (!actor) redirect('/login/brand')
  const isAdmin = actor.role === 'admin'

  return (
    <div>
      <h1 style={{ fontSize: '1.5rem', fontWeight: 700, marginBottom: '1rem' }}>Ops Console</h1>
      <p style={{ color: '#555', marginBottom: '1.5rem' }}>
        {isAdmin
          ? 'Internal founder tooling. Manage creators and view brands.'
          : 'Outreach tools. Pipeline, creator and brand onboarding.'}
      </p>
      <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
        <Link href="/ops/playbook" style={cardStyle}>
          <strong>Playbook</strong>
          <span style={sub}>What we build, why, and how to pitch it</span>
        </Link>
        <Link href="/ops/pipeline" style={cardStyle}>
          <strong>Pipeline</strong>
          <span style={sub}>Track brand and creator outreach</span>
        </Link>
        <Link href="/ops/creators" style={cardStyle}>
          <strong>Creators</strong>
          <span style={sub}>{isAdmin ? 'View, vet, and manage creators' : 'View and vet creators'}</span>
        </Link>
        <Link href="/ops/brands" style={cardStyle}>
          <strong>Brands</strong>
          <span style={sub}>View registered brands</span>
        </Link>
        <Link href="/ops/insights" style={cardStyle}>
          <strong>Insights</strong>
          <span style={sub}>Onboarding and growth responses</span>
        </Link>
        {isAdmin && (
          <>
            <Link href="/ops/deals" style={cardStyle}>
              <strong>Deals</strong>
              <span style={sub}>Monitor all deals across the platform</span>
            </Link>
            <Link href="/ops/offers" style={cardStyle}>
              <strong>Offer Links</strong>
              <span style={sub}>Generate signed offer links</span>
            </Link>
            <Link href="/ops/access" style={cardStyle}>
              <strong>Access</strong>
              <span style={sub}>Manage ops console users</span>
            </Link>
          </>
        )}
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
  minWidth: 190,
  flex: 1,
}

const sub: React.CSSProperties = { fontSize: '0.8125rem', color: '#666' }

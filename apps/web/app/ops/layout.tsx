import { redirect } from 'next/navigation'
import Link from 'next/link'
import { verifyOpsAccess } from '@/lib/ops-auth'

export const metadata = { title: 'Ops Console', robots: { index: false, follow: false } }

export default async function OpsLayout({ children }: { children: React.ReactNode }) {
  const user = await verifyOpsAccess()
  if (!user) redirect('/login')

  return (
    <div style={{ fontFamily: 'system-ui, sans-serif', maxWidth: 960, margin: '0 auto', padding: '1rem' }}>
      <header style={{ display: 'flex', alignItems: 'center', gap: '1.5rem', borderBottom: '1px solid #e5e5e5', paddingBottom: '0.75rem', marginBottom: '1.5rem' }}>
        <Link href="/ops" style={{ fontWeight: 700, fontSize: '1.125rem', color: '#111', textDecoration: 'none' }}>
          Ops Console
        </Link>
        <nav style={{ display: 'flex', gap: '1rem', fontSize: '0.875rem' }}>
          <Link href="/ops/creators" style={{ color: '#555', textDecoration: 'none' }}>Creators</Link>
          <Link href="/ops/creators/new" style={{ color: '#555', textDecoration: 'none' }}>+ Add Creator</Link>
          <Link href="/ops/brands" style={{ color: '#555', textDecoration: 'none' }}>Brands</Link>
        </nav>
        <span style={{ marginLeft: 'auto', fontSize: '0.75rem', color: '#888' }}>{user.email}</span>
      </header>
      {children}
    </div>
  )
}

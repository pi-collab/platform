import Link from 'next/link'
import SignInButton from '@/components/SignInButton'
import SignOutButton from '@/components/SignOutButton'
import { verifyOpsAccess } from '@/lib/ops-auth'
import { createClient } from '@/lib/supabase/server'

export const metadata = { title: 'Ops Console', robots: { index: false, follow: false } }

export default async function OpsLayout({ children }: { children: React.ReactNode }) {
  // Single source of truth for ops access — same check as server actions
  const opsUser = await verifyOpsAccess()

  if (!opsUser) {
    // Need auth state to show sign-in vs sign-out UI
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()

    return (
      <div style={{ fontFamily: 'system-ui, sans-serif', display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', background: '#fafafa' }}>
        <div style={{ textAlign: 'center', padding: '3rem 2rem', background: '#fff', border: '1px solid #e5e5e5', borderRadius: 16, maxWidth: 380 }}>
          <h1 style={{ fontSize: '1.25rem', fontWeight: 700, color: '#111', margin: '0 0 0.5rem' }}>Ops Console</h1>
          {user ? (
            <>
              <p style={{ fontSize: '0.875rem', color: '#888', margin: '0 0 1rem' }}>
                Signed in as {user.email}. This account doesn&apos;t have ops access. Sign out first, then sign in with an authorized Google account.
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', alignItems: 'center' }}>
                <SignOutButton redirectTo="/ops" />
              </div>
            </>
          ) : (
            <>
              <p style={{ fontSize: '0.875rem', color: '#888', margin: '0 0 1.5rem' }}>
                Sign in with an authorized Google account.
              </p>
              <SignInButton />
            </>
          )}
        </div>
      </div>
    )
  }

  return (
    <div style={{ fontFamily: 'system-ui, sans-serif', maxWidth: 1280, margin: '0 auto', padding: '1rem' }}>
      <header style={{ display: 'flex', alignItems: 'center', gap: '1.5rem', borderBottom: '1px solid #e5e5e5', paddingBottom: '0.75rem', marginBottom: '1.5rem' }}>
        <Link href="/ops" style={{ fontWeight: 700, fontSize: '1.125rem', color: '#111', textDecoration: 'none' }}>
          Ops Console
        </Link>
        <nav style={{ display: 'flex', gap: '1rem', fontSize: '0.875rem' }}>
          <Link href="/ops/creators" style={{ color: '#555', textDecoration: 'none' }}>Creators</Link>
          <Link href="/ops/appeals" style={{ color: '#555', textDecoration: 'none' }}>Appeals</Link>
          <Link href="/ops/brands" style={{ color: '#555', textDecoration: 'none' }}>Brands</Link>
          <Link href="/ops/deals" style={{ color: '#555', textDecoration: 'none' }}>Deals</Link>
          <Link href="/ops/careers" style={{ color: '#555', textDecoration: 'none' }}>Careers</Link>
          <Link href="/ops/insights" style={{ color: '#555', textDecoration: 'none' }}>Insights</Link>
          <Link href="/ops/offers" style={{ color: '#555', textDecoration: 'none' }}>Offer Links</Link>
        </nav>
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <span style={{ fontSize: '0.75rem', color: '#888' }}>{opsUser.email}</span>
          <SignOutButton redirectTo="/login/brand" />
        </div>
      </header>
      {children}
    </div>
  )
}

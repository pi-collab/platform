import Link from 'next/link'
import SignInButton from '@/components/SignInButton'
import SignOutButton from '@/components/SignOutButton'
import { resolveOpsActor } from '@/lib/ops-capabilities'
import { createClient } from '@/lib/supabase/server'

export const metadata = { title: 'Ops Console', robots: { index: false, follow: false } }

export default async function OpsLayout({ children }: { children: React.ReactNode }) {
  /* The layout only decides whether to render the shell at all — it is not the
     authorisation boundary. Every page and action inside still runs its own
     check, so an outreach user reaching an admin-only page by typing the URL
     is refused there. Widening the shell to two roles therefore grants
     nothing on its own. */
  const actor = await resolveOpsActor()
  const opsUser = actor?.user ?? null
  const isAdmin = actor?.role === 'admin'

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
      <header style={{
        display: 'flex', alignItems: 'center', gap: '1.5rem', flexWrap: 'wrap',
        borderBottom: '1px solid #e5e5e5', paddingBottom: '0.75rem', marginBottom: '1.5rem',
        position: 'sticky', top: 0, zIndex: 20,
        background: '#fff', paddingTop: '1rem', marginTop: '-1rem',
      }}>
        <Link href="/ops" style={{ fontWeight: 700, fontSize: '1.125rem', color: '#111', textDecoration: 'none' }}>
          Ops Console
        </Link>
        {/* Admin-only links are omitted rather than shown-and-refused. The page
            gates are what actually enforce this; hiding them just stops the
            outreach team walking into dead ends all day. */}
        <nav style={{ display: 'flex', gap: '1rem', fontSize: '0.875rem' }}>
          <Link href="/ops/creators" style={{ color: '#555', textDecoration: 'none' }}>Creators</Link>
          {isAdmin && <Link href="/ops/appeals" style={{ color: '#555', textDecoration: 'none' }}>Appeals</Link>}
          <Link href="/ops/brands" style={{ color: '#555', textDecoration: 'none' }}>Brands</Link>
          {isAdmin && <Link href="/ops/deals" style={{ color: '#555', textDecoration: 'none' }}>Deals</Link>}
          {isAdmin && <Link href="/ops/careers" style={{ color: '#555', textDecoration: 'none' }}>Careers</Link>}
          <Link href="/ops/insights" style={{ color: '#555', textDecoration: 'none' }}>Insights</Link>
          {isAdmin && <Link href="/ops/offers" style={{ color: '#555', textDecoration: 'none' }}>Offer Links</Link>}
          <Link href="/ops/pipeline" style={{ color: '#555', textDecoration: 'none' }}>Pipeline</Link>
          <Link href="/ops/playbook" style={{ color: '#555', textDecoration: 'none' }}>Playbook</Link>
        </nav>
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          {!isAdmin && (
            <span style={{ fontSize: '0.6875rem', fontWeight: 700, color: '#7c3aed', background: '#f3e8ff', border: '1px solid #e9d5ff', borderRadius: 999, padding: '2px 8px', textTransform: 'uppercase', letterSpacing: '.04em' }}>
              Outreach
            </span>
          )}
          <span style={{ fontSize: '0.75rem', color: '#888' }}>{opsUser.email}</span>
          <SignOutButton redirectTo="/login/brand" />
        </div>
      </header>
      {children}
    </div>
  )
}

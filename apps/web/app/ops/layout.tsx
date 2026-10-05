import Link from 'next/link'
import SignInButton from '@/components/SignInButton'
import SignOutButton from '@/components/SignOutButton'
import OpsNavMenu from '@/components/ops/OpsNavMenu'
import { resolveOpsActor } from '@/lib/ops-capabilities'
import { createClient } from '@/lib/supabase/server'
import { currentPath } from '@/lib/current-path'

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

  /* The Experience screens are in the brand portal's design and bring their
     own frame (app/ops/experiences/layout.tsx). They are still inside this
     layout, so the sign-in screen above still applies; only the classic ops
     header is skipped. The path only chooses a header: every Experience page
     runs its own gate (experienceOpsGate). */
  if ((currentPath() ?? '').startsWith('/ops/experiences')) return <>{children}</>

  return (
    <div className="ops-shell" style={{ fontFamily: 'system-ui, sans-serif', maxWidth: 1200, margin: '0 auto', padding: '1rem' }}>
      {/* A pasted link or long handle is one unbreakable string; without this
          it widens its table until the approve buttons scroll off screen. */}
      <style>{`.ops-shell td, .ops-shell a, .ops-shell p, .ops-shell li, .ops-shell dd { overflow-wrap: anywhere; }`}</style>
      <header style={{
        display: 'flex', alignItems: 'center', gap: '1.5rem', flexWrap: 'wrap',
        borderBottom: '1px solid #e5e5e5', paddingBottom: '0.75rem', marginBottom: '1.5rem',
        position: 'sticky', top: 0, zIndex: 20,
        background: '#fff', paddingTop: '1rem', marginTop: '-1rem',
      }}>
        <Link href="/ops" style={{ fontWeight: 700, fontSize: '1.125rem', color: '#111', textDecoration: 'none' }}>
          Ops Console
        </Link>
        {/* Grouped into one dropdown per category to keep the header short.
            Admin-only links are omitted rather than shown-and-refused. The page
            gates are what actually enforce this; hiding them just stops the
            outreach team walking into dead ends all day. */}
        <OpsNavMenu groups={[
          { title: 'Creators', items: [
            { href: '/ops/creators', label: 'Creators', hint: 'Roster, vetting and profiles' },
            ...(isAdmin ? [{ href: '/ops/appeals', label: 'Appeals', hint: 'Rejected creators asking again' }] : []),
          ] },
          { title: 'Brands & deals', items: [
            { href: '/ops/brands', label: 'Brands', hint: 'Approvals and brand accounts' },
            ...(isAdmin ? [
              { href: '/ops/deals', label: 'Deals', hint: 'Every deal, fees and timelines' },
              { href: '/ops/experiences', label: 'Experiences', hint: 'Done-for-you shoots Guapd runs' },
              { href: '/ops/offers', label: 'Offer Links', hint: 'Links for open offers' },
            ] : []),
          ] },
          { title: 'Growth', items: [
            { href: '/ops/pipeline', label: 'Pipeline', hint: 'Leads and follow-ups' },
            // Admin only: mailing strangers from guapd.com spends the sending
            // domain's reputation that every transactional email depends on.
            ...(isAdmin ? [{ href: '/ops/outreach', label: 'Outreach', hint: 'Cold email sent from guapd.com' }] : []),
            { href: '/ops/insights', label: 'Insights', hint: 'Creator and Growth onboarding answers' },
          ] },
          { title: 'Team', items: [
            { href: '/ops/playbook', label: 'Playbook', hint: 'What the team pitches from' },
            ...(isAdmin ? [
              { href: '/ops/careers', label: 'Careers', hint: 'Open roles, published and draft' },
              { href: '/ops/settings', label: 'Settings', hint: 'Platform values and per-brand access' },
            ] : []),
          ] },
        ]} />
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

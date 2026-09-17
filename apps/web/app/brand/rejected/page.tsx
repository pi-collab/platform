import { redirect } from 'next/navigation'
import SignOutButton from '@/components/SignOutButton'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export const metadata = {
  title: 'Account not approved · Guapd',
  robots: { index: false, follow: false },
}

/**
 * Where a rejected brand lands, on every brand page (verifyBrand sends it here).
 *
 * Deliberately does NOT call verifyBrand, which would send it straight back:
 * it resolves the brand itself, and shows this screen only to a member of a
 * brand that is actually rejected. Anyone else is sent where they belong, so
 * an approved brand with an old link never sees a rejection meant for someone
 * else, and a brand approved after being rejected is let back in.
 *
 * Nothing on this page leads into the product. Sign out is the only action.
 */
export default async function BrandRejectedPage() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login/brand')

  const { data: profile } = await supabase
    .from('users').select('id').eq('auth_id', user.id).maybeSingle()
  if (!profile) redirect('/onboarding')

  // Service role, scoped by hand to this user's own membership: the reason is
  // read from the brand row, and a rejected brand's read access is not
  // something this screen should depend on.
  const admin = createAdminClient()
  const { data: membership } = await admin
    .from('brand_members')
    .select('brands(name, brand_status, rejection_reason)')
    .eq('user_id', profile.id)
    .maybeSingle()

  const brand = (membership as { brands?: { name: string | null; brand_status: string; rejection_reason: string | null } } | null)?.brands
  if (!brand) redirect('/onboarding')
  if (brand.brand_status !== 'rejected') redirect('/dashboard')

  const reason = brand.rejection_reason?.trim()

  return (
    <main className="onboard-shell">
      <div className="onboard-shell__dark" />
      <div className="onboard-shell__rule" />

      <div className="onboard-nav-wrap">
        <nav className="onboard-nav">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/guapd-logo-dark.svg" alt="guapd" className="onboard-nav__logo" />
          <SignOutButton redirectTo="/login/brand" className="onboard-nav__cta" label="Sign out" />
        </nav>
      </div>

      <div className="onboard-head">
        <h1 className="onboard-head__title">Not approved.</h1>
        <p className="onboard-head__sub">
          We reviewed {brand.name ? <strong>{brand.name}</strong> : 'your brand'} and weren&rsquo;t able to approve it.
        </p>
      </div>

      <div className="onboard-body">
        <div className="onboard-card" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {reason ? (
            <div>
              <p style={{ margin: '0 0 6px', fontSize: 12, fontWeight: 600, letterSpacing: '.06em', textTransform: 'uppercase', color: 'var(--ink-soft)' }}>
                The reason
              </p>
              <p style={{ margin: 0, fontSize: 16, lineHeight: 1.55, color: 'var(--ink)' }}>{reason}</p>
            </div>
          ) : null}
          <p style={{ margin: 0, fontSize: 15, lineHeight: 1.6, color: 'var(--ink-soft)' }}>
            This account can&rsquo;t be used to work with creators on Guapd. If you think this is a
            mistake, write to{' '}
            <a href="mailto:contact@guapd.com" style={{ color: 'var(--ink)', fontWeight: 600 }}>contact@guapd.com</a>
            {' '}and we&rsquo;ll take another look.
          </p>
          <div>
            <SignOutButton redirectTo="/login/brand" className="onboard-nav__cta" label="Sign out" />
          </div>
        </div>
      </div>
    </main>
  )
}

import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import BrandSignupForm from './BrandSignupForm'

export const metadata = {
  title: 'Create your account — Guapd',
  robots: { index: false, follow: false },
}

/**
 * Brand signup — step 1 of the paged flow (account), step 2 is /onboarding
 * (brand profile).
 *
 * Design: "Brand Signup - Paged Flow step 1". Split shell — dark editorial
 * panel left, form right, floating pill nav across the top.
 *
 * Previously brands had no signup route at all; /login toggled an inline
 * signup view, under a heading that still read "Brand login".
 */
export default async function BrandSignupPage({
  searchParams,
}: {
  searchParams: { error?: string }
}) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()

  // Already signed in — send them onward rather than offering signup again.
  if (user) {
    const { data: profile } = await supabase
      .from('users').select('id').eq('auth_id', user.id).maybeSingle()

    if (profile) {
      const { data: membership } = await supabase
        .from('brand_members').select('brand_id').eq('user_id', profile.id).maybeSingle()
      if (membership) redirect('/deals')
    }
    redirect('/onboarding')
  }

  return (
    <main className="signup-shell">
      {/* Dark field bleeding to the viewport edge behind the left column. */}
      <div className="signup-shell__dark" />

      <div className="signup-nav-wrap">
        <nav className="signup-nav">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/guapd-logo-dark.svg" alt="guapd" className="signup-nav__logo" />
          <div className="signup-nav__right">
            <span className="signup-nav__label">Already have an account?</span>
            <Link href="/login" className="signup-nav__cta">Log in</Link>
          </div>
        </nav>
      </div>

      <div className="signup-grid">
        <section className="signup-pitch">
          <div className="signup-pitch__inner">
            <div className="signup-pitch__rule" />
            <h1 className="signup-pitch__title">
              Your whole deal<br />flow, one platform.
            </h1>
            <p className="signup-pitch__sub">
              Source, negotiate and manage campaigns — all from one place built for brands.
            </p>
          </div>
        </section>

        <section className="signup-panel">
          <div className="signup-panel__inner">
            {/* Heading lives INSIDE the form: it has to change once the
                confirmation state is showing, and a server component can't
                react to that. Same split that had /login titled "Brand login"
                over a signup form. */}
            <BrandSignupForm oauthError={searchParams.error} />
          </div>
        </section>
      </div>
    </main>
  )
}

import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import SignOutButton from '@/components/SignOutButton'
import BrandLoginForm from './BrandLoginForm'
import FormError from '@/components/FormError'

export const metadata = {
  title: 'Log in — Guapd',
  robots: { index: false, follow: false },
}

/**
 * Brand login — design "Brand Login - Paged Flow".
 *
 * Same split shell as /signup/brand (step 1 of the same design), so it reuses
 * the .signup-* styles rather than duplicating them under a second name.
 */
export default async function LoginPage({
  searchParams,
}: {
  searchParams: { error?: string; view?: string }
}) {
  // Signup used to be a view toggled inside this page. It has its own route
  // now, so anything still pointing here goes there instead of finding a view
  // that no longer exists.
  if (searchParams.view === 'signup') redirect('/signup/brand')

  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()

  // Already logged in — check what state they're in
  if (user) {
    // Founder → ops
    const allowedRaw = process.env.OPS_ALLOWED_EMAILS
    if (allowedRaw && user.email) {
      const allowed = new Set(allowedRaw.split(',').map(e => e.trim().toLowerCase()))
      if (allowed.has(user.email.toLowerCase())) redirect('/ops')
    }

    // Has a brand → deals
    const { data: profile } = await supabase
      .from('users')
      .select('id')
      .eq('auth_id', user.id)
      .maybeSingle()

    if (profile) {
      const { data: membership } = await supabase
        .from('brand_members')
        .select('brand_id')
        .eq('user_id', profile.id)
        .maybeSingle()

      if (membership) redirect('/deals')
    }

    // Signed in but no brand yet — the design's "You're in." screen, pointing
    // at the step they actually still owe rather than a dashboard they have no
    // brand for.
    return (
      <Shell>
        <div className="signup-panel__inner">
          <div className="login-tick">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                 strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M20 6 9 17l-5-5" />
            </svg>
          </div>
          <h2 className="signup-panel__title">You&rsquo;re in.</h2>
          <p className="signup-panel__sub">
            Signed in as {user.email}. One step left — tell us about your brand and your
            dashboard is ready.
          </p>
          <div className="signup-form">
            <Link href="/onboarding" className="signup-form__cta signup-form__cta--link">
              Set up my brand
            </Link>
            <div className="signup-form__forgot">
              <SignOutButton className="signup-form__forgot-link lnk" label="Sign out" />
            </div>
          </div>
        </div>
      </Shell>
    )
  }

  return (
    <Shell showCreateAccount>
      <div className="signup-panel__inner">
        {searchParams.error && (
          <FormError>
            {searchParams.error === 'exchange_failed'
              ? 'That sign-in link could not be completed. Try logging in below.'
              : `Sign-in failed (${searchParams.error}). Please try again.`}
          </FormError>
        )}

        {/* 'reset' is the only linkable view. The post-submit states are not
            reachable by URL, or they would claim an email nobody sent. */}
        <BrandLoginForm initialView={searchParams.view === 'reset' ? 'reset' : 'login'} />
      </div>
    </Shell>
  )
}

/** The split shell, shared with /signup/brand. */
function Shell({
  children,
  showCreateAccount = false,
}: {
  children: React.ReactNode
  showCreateAccount?: boolean
}) {
  return (
    <main className="signup-shell">
      <div className="signup-shell__dark" />

      <div className="signup-nav-wrap">
        <nav className="signup-nav">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/guapd-logo-dark.svg" alt="guapd" className="signup-nav__logo" />
          {showCreateAccount && (
            <div className="signup-nav__right">
              <span className="signup-nav__label">New here?</span>
              <Link href="/signup/brand" className="signup-nav__cta">Create account</Link>
            </div>
          )}
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

        <section className="signup-panel">{children}</section>
      </div>
    </main>
  )
}

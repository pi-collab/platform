import { redirect } from 'next/navigation'
import { safeNext } from '@/lib/safe-next'
import Link from 'next/link'
import AuthShell, { AuthNavRight } from '@/components/AuthShell'
import Toast from '@/components/Toast'
import { createClient } from '@/lib/supabase/server'
import SignOutButton from '@/components/SignOutButton'
import BrandLoginForm from './BrandLoginForm'
import FormError from '@/components/FormError'

export const metadata = {
  title: 'Log in · Guapd',
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
  searchParams: { error?: string; view?: string; reset?: string; next?: string }
}) {
  // Where to land after signing in. A brand arriving from a creator's shopfront
  // was writing a pitch; dropping them on the dashboard loses the pitch AND
  // gives no clue why. /login/creator has always honoured this; the brand side
  // never did.
  const next = safeNext(searchParams.next, '/dashboard')
  const nextQuery = next === '/dashboard' ? '' : `?next=${encodeURIComponent(next)}`
  // Signup used to be a view toggled inside this page. It has its own route
  // now, so anything still pointing here goes there instead of finding a view
  // that no longer exists.
  if (searchParams.view === 'signup') redirect(`/signup/brand${nextQuery}`)

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

    // Has a brand → dashboard
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

      if (membership) redirect(next)
    }

    // Signed in but no brand yet — the design's "You're in." screen, pointing
    // at the step they actually still owe rather than a dashboard they have no
    // brand for.
    return (
      <AuthShell>
        <div className="signup-panel__inner">
          <div className="login-tick">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                 strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M20 6 9 17l-5-5" />
            </svg>
          </div>
          <h2 className="signup-panel__title">You&rsquo;re in.</h2>
          <p className="signup-panel__sub">
            Signed in as {user.email}. One step left. Tell us about your brand and your
            dashboard is ready.
          </p>
          <div className="signup-form">
            <Link href="/onboarding" className="signup-form__cta signup-form__cta--link">
              Set up my brand
            </Link>
            <div className="signup-form__alt">
              <SignOutButton className="signup-form__alt-link lnk" label="Sign out" />
            </div>
          </div>
        </div>
      </AuthShell>
    )
  }

  return (
    <AuthShell navRight={<AuthNavRight label="New to Guapd?" ctaLabel="Get access" href="/signup/brand" />}>
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
        <BrandLoginForm initialView={searchParams.view === 'reset' ? 'reset' : 'login'} next={next} />

        {/* The reset happened on the previous page and revoked the session, so
            the confirmation has to travel here. Strips ?reset= once shown, or a
            refresh keeps re-announcing a password change from minutes ago. */}
        {searchParams.reset === 'success' && (
          <Toast message="Password updated. Sign in with your new password." param="reset" />
        )}
      </div>
    </AuthShell>
  )
}

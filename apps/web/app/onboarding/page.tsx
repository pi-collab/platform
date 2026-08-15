import { redirect }     from 'next/navigation'
import SignOutButton    from '@/components/SignOutButton'
import { createClient } from '@/lib/supabase/server'
import OnboardingForm   from './OnboardingForm'

export const metadata = { title: 'Your brand — Guapd', robots: { index: false, follow: false } }

/**
 * Brand signup — step 2 of the paged flow (brand profile). Step 1 is
 * /signup/brand (account).
 *
 * Design: "Brand Signup Profile - Paged Flow step 2". Dark band across the top
 * with a neon hairline, floating pill nav, serif headline over it, and a white
 * card carrying the form.
 */
export default async function OnboardingPage() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // If already onboarded, skip back to dashboard
  const { data: profile } = await supabase
    .from('users').select('id').eq('auth_id', user.id).maybeSingle()

  if (profile) {
    const { data: membership } = await supabase
      .from('brand_members').select('id').eq('user_id', profile.id).maybeSingle()
    if (membership) redirect('/dashboard')
  }

  return (
    <main className="onboard-shell">
      <div className="onboard-shell__dark" />
      <div className="onboard-shell__rule" />

      <div className="onboard-nav-wrap">
        <nav className="onboard-nav">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/guapd-logo-dark.svg" alt="guapd" className="onboard-nav__logo" />
          {/* The design has "Log in" here, which it cannot be: this page is only
              reachable with a session. Reading it as "the nav carries an escape"
              rather than literally, the useful escape at this point is leaving a
              wrong account — someone who signed up under the wrong address is
              otherwise stuck on a form they don't want to fill in. */}
          <SignOutButton className="onboard-nav__cta" label="Log out" />
        </nav>
      </div>

      <div className="onboard-head">
        <h1 className="onboard-head__title">Your brand.</h1>
        <p className="onboard-head__sub">
          Help us know you better, so we can connect you with the right creators.
        </p>
      </div>

      <div className="onboard-body">
        <div className="onboard-card">
          <OnboardingForm />
        </div>
      </div>
    </main>
  )
}

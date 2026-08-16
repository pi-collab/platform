import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import SignOutButton from '@/components/SignOutButton'
import CreatorProfileForm from './CreatorProfileForm'

export const metadata = {
  title: 'Your details · Guapd',
  robots: { index: false, follow: false },
}

/**
 * Creator signup step 2 — design "Creator Signup Profile - Paged Flow".
 *
 * Same shell as the brand's step 2: dark band, neon hairline, floating nav,
 * serif headline, white card. Both are "tell us about yourself" after an
 * account exists, so they share the layout rather than each inventing one.
 */
export default async function CreatorOnboardingPage() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/signup/creator')

  return (
    <main className="onboard-shell">
      <div className="onboard-shell__dark" />
      <div className="onboard-shell__rule" />

      <div className="onboard-nav-wrap">
        <nav className="onboard-nav">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/guapd-logo-dark.svg" alt="guapd" className="onboard-nav__logo" />
          {/* The design shows "Log in", which this page cannot offer: reaching
              it requires a verified session. The useful escape here is leaving
              a wrong account, same as the brand step. */}
          <SignOutButton className="onboard-nav__cta" label="Sign out" redirectTo="/login/creator" />
        </nav>
      </div>

      <div className="onboard-head">
        <h1 className="onboard-head__title">Your details.</h1>
        {/* The mobile export's line, used on both. It says what the fields are
            FOR — a brand reads these — where the desktop export's "help us
            know you better" says only that we are asking. */}
        <p className="onboard-head__sub">
          This is what brands see when they find you.
        </p>
      </div>

      <div className="onboard-body">
        <div className="onboard-card onboard-card--bare">
          <CreatorProfileForm />
        </div>
      </div>
    </main>
  )
}

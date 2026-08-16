import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import NotifyPreferences from './NotifyPreferences'

export const metadata = {
  title: 'Profile under review · Guapd',
  robots: { index: false, follow: false },
}

const STEPS = [
  { title: 'You get notified', body: 'We’ll reach out the moment you’re approved.' },
  { title: 'Offers start coming in', body: 'Brands can find and message you right away.' },
  { title: 'You get guapd 💸', body: 'Time to get paid. Ka-ching!' },
]

/**
 * Creator signup — under review. Design "Creator Signup NOTIFICATION".
 *
 * Does real work rather than just confirming: it collects the notification
 * channel the creator did NOT sign up with. Phone signups leave us no email
 * and Google signups leave us no phone, so for about half of them the
 * approval mail they are now waiting on is unsendable — and this is the last
 * screen before that wait begins.
 */
export default async function CreatorSignupCompletePage({
  searchParams,
}: {
  searchParams: { claimed?: string }
}) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/signup/creator')

  const admin = createAdminClient()
  const { data: profile } = await admin
    .from('users').select('id, email').eq('auth_id', user.id).maybeSingle()

  const { data: creator } = profile
    ? await admin
        .from('creators')
        .select('id, phone, contact_email, is_vetted')
        .eq('user_id', profile.id)
        .maybeSingle()
    : { data: null }

  // Already vetted — a claimed stub. Nothing to wait for.
  if (creator?.is_vetted) redirect('/creator/dashboard')

  const knownEmail = creator?.contact_email ?? profile?.email ?? null
  // Stored as +91XXXXXXXXXX; the field takes the ten subscriber digits.
  const signupPhone = creator?.phone?.replace(/^\+91/, '') ?? null

  return (
    <main className="onboard-shell onboard-shell--tall">
      <div className="onboard-shell__dark" />
      <div className="onboard-shell__rule" />

      <div className="onboard-nav-wrap">
        <nav className="onboard-nav onboard-nav--bare">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/guapd-logo-dark.svg" alt="guapd" className="onboard-nav__logo" />
        </nav>
      </div>

      <div className="review-head">
        <div className="review-badge">
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor"
               strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="9" /><path d="M12 7v5l3.5 2" />
          </svg>
        </div>
        <h1 className="review-title">
          Your profile is under <span className="review-title__em">review.</span>
        </h1>
        <p className="review-sub">
          Check back in <strong>24&ndash;48 hours</strong>.
        </p>
      </div>

      <div className="onboard-body">
        <div className="onboard-card onboard-card--flush">
          <NotifyPreferences knownEmail={knownEmail} signupPhone={signupPhone} />

          <div className="review-next">
            <span className="review-next__head">What happens next</span>
            {STEPS.map((s, i) => (
              <div key={s.title} className="review-step">
                <div className="review-step__num">{i + 1}</div>
                <div>
                  <div className="review-step__title">{s.title}</div>
                  <div className="review-step__body">{s.body}</div>
                </div>
              </div>
            ))}
          </div>

          {searchParams.claimed === '1' && (
            <div className="review-next">
              <Link href="/creator/dashboard" className="onboard-cta cta">Go to my dashboard</Link>
            </div>
          )}
        </div>
      </div>
    </main>
  )
}

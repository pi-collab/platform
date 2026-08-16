import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { shouldShowCreatorApproved } from '@/lib/creator-approval'
import Confetti from '@/components/Confetti'
import GoToDashboard from './GoToDashboard'

export const metadata = {
  title: 'You’re approved · Guapd',
  robots: { index: false, follow: false },
}

const STEPS = [
  { title: 'Your profile goes live', body: 'Brands can now find and message you.' },
  { title: 'Offers start coming in', body: 'Review and respond right from your dashboard.' },
  { title: 'You get guapd 💸', body: 'Time to get paid. Ka-ching!' },
]

/**
 * Creator approved. Design "Creator Signup Approved - Paged Flow".
 *
 * Shown once, on the first visit after vetting clears. Anyone arriving here
 * who has already seen it, or who never went through vetting, is sent to the
 * dashboard rather than shown a stale celebration.
 */
export default async function CreatorApprovedPage() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login/creator')

  const admin = createAdminClient()
  const { data: profile } = await admin
    .from('users').select('id').eq('auth_id', user.id).maybeSingle()
  const { data: creator } = profile
    ? await admin.from('creators').select('id').eq('user_id', profile.id).maybeSingle()
    : { data: null }

  if (!creator || !(await shouldShowCreatorApproved(creator.id))) {
    redirect('/creator/dashboard')
  }

  return (
    <main className="onboard-shell onboard-shell--tall">
      <div className="onboard-shell__dark" />
      <div className="onboard-shell__rule" />

      <Confetti />

      {/* No header at all. The page moved out of the creator layout so the app
          nav is gone, and it does not put a logo back: this is a single
          moment with one action on it, and the only way out is the button
          below — nothing here should offer a way around it. */}
      <div className="review-head review-head--nonav">
        <div className="approved-badge">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#181C24"
               strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
            <path d="M20 6 9 17l-5-5" />
          </svg>
        </div>
        <h1 className="approved-title">You&rsquo;re approved.</h1>
        <p className="review-sub">Congratulations, you&rsquo;re ready to get guapd.</p>
      </div>

      <div className="onboard-body">
        <div className="onboard-card onboard-card--flush">
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
            <GoToDashboard />
          </div>
        </div>
      </div>
    </main>
  )
}

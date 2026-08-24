import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { verifyCreator } from '@/lib/creator-auth'
import { QUESTIONS, shouldAskOnboarding } from '@/lib/creator-onboarding'
import WelcomeQuestions from './WelcomeQuestions'

export const metadata: Metadata = { title: 'Welcome · Guapd Creator' }

/**
 * The one-time questions, between the approval screen and the dashboard.
 *
 * Deliberately NOT under the creator app shell: there is no tab bar and no
 * sidebar here, because this is the last step of joining rather than a screen
 * inside the product. It reuses the signup shell so it looks like what came
 * before it, not what comes after.
 */
export default async function CreatorWelcomePage() {
  const ctx = await verifyCreator()

  // Already answered, or approved before this existed — either way there is
  // nothing to ask, and a form that reappears after being completed is worse
  // than one that never showed.
  if (!(await shouldAskOnboarding(ctx.creatorId))) redirect('/creator/dashboard')

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

      <div className="onboard-body">
        {/* Options and labels come from one definition, shared with the ops
            aggregate that reads these answers back. */}
        <WelcomeQuestions questions={QUESTIONS.map(q => ({ ...q, options: [...q.options] }))} />
      </div>
    </main>
  )
}

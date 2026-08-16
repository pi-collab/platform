import { cookies } from 'next/headers'
import { createClient } from '@/lib/supabase/server'
import { RECOVERY_COOKIE } from '@/lib/recovery-cookie'
import AuthShell from '@/components/AuthShell'
import ResetPasswordForm from './ResetPasswordForm'

export const metadata = {
  title: 'Set a new password · Guapd',
  robots: { index: false, follow: false },
}

/**
 * Password-reset COMPLETION page.
 *
 * Reached only from a recovery email link, via /auth/confirm. Two conditions
 * must BOTH hold to show the form:
 *
 *   1. A session exists — updateUser cannot change a password without one,
 *      so this is the real security boundary.
 *   2. The recovery marker cookie is present — proves the session came from a
 *      recovery link rather than an ordinary login, so someone sitting at an
 *      already-signed-in browser cannot change the password without knowing
 *      the current one.
 *
 * Shares the login shell. No nav action opposite the logo: the user arrived
 * from an email mid-task, and "Create account" there would invite them to
 * abandon a recovery they are one field away from finishing.
 */
export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: { error?: string }
}) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const hasRecoveryMarker = cookies().get(RECOVERY_COOKIE)?.value === '1'

  const linkUsable = Boolean(user) && hasRecoveryMarker && !searchParams.error

  if (!linkUsable) {
    // One message for every failure mode — expired, already used, tampered,
    // no session, or an ordinary session with no recovery marker. Telling an
    // anonymous visitor WHICH it was would leak account state.
    return (
      <AuthShell>
        <div className="signup-panel__inner">
          <h2 className="signup-panel__title">This link is no longer valid.</h2>
          <p className="signup-panel__sub">
            Password reset links can only be used once and expire after a short time.
            Request a new one and it will arrive in your inbox.
          </p>
          <div className="signup-form">
            <a href="/login/brand" className="signup-form__cta signup-form__cta--link">
              Back to log in
            </a>
          </div>
        </div>
      </AuthShell>
    )
  }

  return (
    <AuthShell>
      <div className="signup-panel__inner">
        <ResetPasswordForm email={user!.email ?? 'your account'} />
      </div>
    </AuthShell>
  )
}

import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import AuthShell, { CREATOR_LOGIN_PITCH } from '@/components/AuthShell'
import FormError from '@/components/FormError'
import CreatorLoginForm from './CreatorLoginForm'
import { safeNext } from '@/lib/safe-next'

export const metadata = {
  title: 'Creator log in · Guapd',
  robots: { index: false, follow: false },
}

export default async function CreatorLoginPage({
  searchParams,
}: {
  searchParams: { error?: string; next?: string }
}) {
  // Where to land after sign-in. Validated here, once, so every path below
  // (already-signed-in redirect, phone OTP, Google) gets a trusted value.
  const next = safeNext(searchParams.next, '/creator/dashboard')

  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()

  // Already authenticated — check if they're a creator and redirect
  if (user) {
    const { data: profile } = await supabase
      .from('users')
      .select('id')
      .eq('auth_id', user.id)
      .maybeSingle()

    if (profile) {
      const { data: creator } = await supabase
        .from('creators')
        .select('id')
        .eq('user_id', profile.id)
        .maybeSingle()

      if (creator) redirect(next)
    }
  }

  return (
    <AuthShell
      pitch={CREATOR_LOGIN_PITCH}
      navRight={
        <div className="signup-nav__right">
          <span className="signup-nav__label">New here?</span>
          <Link href="/signup/creator" className="signup-nav__cta">Create account</Link>
        </div>
      }
    >
      <div className="signup-panel__inner">
        {searchParams.error === 'no_account' && (
          <FormError>
            No creator account found for that sign-in.{' '}
            <a href="/signup/creator" className="formerr__link">Sign up as a creator &rarr;</a>
          </FormError>
        )}
        {searchParams.error === 'account_exists' && (
          <FormError>This phone is already registered. Sign in below.</FormError>
        )}
        {searchParams.error &&
          searchParams.error !== 'no_account' &&
          searchParams.error !== 'account_exists' && (
            <FormError>Sign-in failed ({searchParams.error}). Please try again.</FormError>
          )}

        <CreatorLoginForm next={next} />
      </div>
    </AuthShell>
  )
}

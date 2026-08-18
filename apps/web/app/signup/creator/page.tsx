import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import AuthShell, { AuthNavRight, CREATOR_PITCH } from '@/components/AuthShell'
import CreatorSignupForm from './CreatorSignupForm'

export const metadata = {
  title: 'Create your creator account · Guapd',
  robots: { index: false, follow: false },
}

/**
 * Creator signup — design "Creator Signup - Paged Flow".
 *
 * Same split shell as the brand flow with the creator pitch. Phone and OTP are
 * the primary path and Google sits below the divider, which is the reverse of
 * the brand screen: creators are reached by phone, and a WhatsApp-verified
 * number is the identity the rest of the product notifies.
 */
export default async function CreatorSignupPage() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()

  // Already signed in with a creator profile: signing up again would either
  // fail or create a duplicate, so send them where the account already works.
  if (user) {
    const { data: profile } = await supabase
      .from('users').select('id').eq('auth_id', user.id).maybeSingle()
    if (profile) {
      const { data: creator } = await supabase
        .from('creators').select('id').eq('user_id', profile.id).maybeSingle()
      if (creator) redirect('/creator/dashboard')
    }
  }

  // No "already have an account?" nav here. With OTP this form IS the login:
  // a number that already has one is signed straight in after the code, so
  // offering a separate door would send them to type the same number and wait
  // for a second code.
  return (
    <AuthShell
      pitch={CREATOR_PITCH}
      navRight={<AuthNavRight label="Already have an account?" ctaLabel="Log in" href="/login/creator" />}
    >
      <div className="signup-panel__inner">
        <CreatorSignupForm />
      </div>
    </AuthShell>
  )
}

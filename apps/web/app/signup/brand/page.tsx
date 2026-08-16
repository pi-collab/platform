import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import AuthShell from '@/components/AuthShell'
import BrandSignupForm from './BrandSignupForm'

export const metadata = {
  title: 'Create your account · Guapd',
  robots: { index: false, follow: false },
}

/**
 * Brand signup — step 1 of the paged flow (account), step 2 is /onboarding
 * (brand profile).
 *
 * Design: "Brand Signup - Paged Flow step 1". Split shell — dark editorial
 * panel left, form right, floating pill nav across the top.
 *
 * Previously brands had no signup route at all; /login toggled an inline
 * signup view, under a heading that still read "Brand login".
 */
export default async function BrandSignupPage({
  searchParams,
}: {
  searchParams: { error?: string }
}) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()

  // Already signed in — send them onward rather than offering signup again.
  if (user) {
    const { data: profile } = await supabase
      .from('users').select('id').eq('auth_id', user.id).maybeSingle()

    if (profile) {
      const { data: membership } = await supabase
        .from('brand_members').select('brand_id').eq('user_id', profile.id).maybeSingle()
      if (membership) redirect('/dashboard')
    }
    redirect('/onboarding')
  }

  return (
    <AuthShell
      navRight={
        <div className="signup-nav__right">
          <span className="signup-nav__label">Already have an account?</span>
          <Link href="/login/brand" className="signup-nav__cta">Log in</Link>
        </div>
      }
    >
      <div className="signup-panel__inner">
        {/* Heading lives INSIDE the form: it has to change once the
            confirmation state is showing, and a server component can't react
            to that. Same split that had /login titled "Brand login" over a
            signup form. */}
        <BrandSignupForm oauthError={searchParams.error} />
      </div>
    </AuthShell>
  )
}

import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import CreatorSignInButton from '@/components/CreatorSignInButton'

export const metadata = {
  title: 'Creator login — Guapd',
  robots: { index: false, follow: false },
}

export default async function CreatorLoginPage({
  searchParams,
}: {
  searchParams: { error?: string }
}) {
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

      if (creator) redirect('/creator/deals')
    }
  }

  return (
    <main style={styles.main}>
      <div style={styles.card}>
        <h1 style={styles.heading}>Creator login</h1>
        <p style={styles.sub}>Sign in to manage your deals.</p>

        {searchParams.error === 'no_account' && (
          // TEMPORARY: v1 creators only exist via offer-accept (no self-signup).
          // When creator self-signup + vetting is built, replace this dead-end
          // with a "No account? Sign up as a creator →" link to the signup flow.
          <p style={styles.error}>
            No creator account found. You&apos;ll get access when a brand sends you an offer.
          </p>
        )}

        {searchParams.error && searchParams.error !== 'no_account' && (
          <p style={styles.error}>
            Sign-in failed ({searchParams.error}). Please try again.
          </p>
        )}

        <CreatorSignInButton />
      </div>
    </main>
  )
}

const styles: Record<string, React.CSSProperties> = {
  main: {
    display:        'flex',
    alignItems:     'center',
    justifyContent: 'center',
    minHeight:      '100vh',
    background:     '#fafafa',
  },
  card: {
    display:       'flex',
    flexDirection: 'column',
    alignItems:    'center',
    gap:           '1.25rem',
    padding:       '3rem 2.5rem',
    background:    '#fff',
    border:        '1px solid #e5e5e5',
    borderRadius:  16,
    minWidth:      320,
  },
  heading: {
    fontSize:     '1.5rem',
    fontWeight:   700,
    color:        '#111',
    margin:       0,
  },
  sub: {
    fontSize:   '0.9375rem',
    color:      '#888',
    margin:     0,
    textAlign:  'center',
  },
  error: {
    fontSize:     '0.875rem',
    color:        '#854d0e',
    background:   '#fef9c3',
    padding:      '0.625rem 1rem',
    borderRadius: 8,
    margin:       0,
    textAlign:    'center',
    lineHeight:   1.5,
  },
}

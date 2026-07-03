import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import SignInButton from '@/components/SignInButton'
import SignOutButton from '@/components/SignOutButton'

export const metadata = {
  title: 'Brand login',
  robots: { index: false, follow: false },
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: { error?: string }
}) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()

  // Already logged in — check what state they're in
  if (user) {
    // Founder → ops
    const allowedRaw = process.env.OPS_ALLOWED_EMAILS
    if (allowedRaw && user.email) {
      const allowed = new Set(allowedRaw.split(',').map(e => e.trim().toLowerCase()))
      if (allowed.has(user.email.toLowerCase())) redirect('/ops')
    }

    // Has a brand → deals
    const { data: profile } = await supabase
      .from('users')
      .select('id')
      .eq('auth_id', user.id)
      .maybeSingle()

    if (profile) {
      const { data: membership } = await supabase
        .from('brand_members')
        .select('brand_id')
        .eq('user_id', profile.id)
        .maybeSingle()

      if (membership) redirect('/deals')
    }

    // Logged in but no brand — show page with "continue setup" prompt
    return (
      <main style={styles.main}>
        <div style={styles.card}>
          <h1 style={styles.heading}>Welcome back</h1>
          <p style={styles.sub}>
            You&apos;re signed in as {user.email}. Complete your brand profile to get started.
          </p>
          <a href="/onboarding" style={styles.btn}>
            Set up my brand
          </a>
          <SignOutButton />
        </div>
      </main>
    )
  }

  return (
    <main style={styles.main}>
      <div style={styles.card}>
        <h1 style={styles.heading}>Brand login</h1>
        <p style={styles.sub}>Sign in to manage your creator deals.</p>

        {searchParams.error && (
          <p style={styles.error}>
            Sign-in failed ({searchParams.error}). Please try again.
          </p>
        )}

        <SignInButton />
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
    background:     '#FDFAF6',
  },
  card: {
    display:       'flex',
    flexDirection: 'column',
    alignItems:    'center',
    gap:           '1.25rem',
    padding:       '3rem 2.5rem',
    background:    '#fff',
    border:        '1px solid #DDD3BE',
    borderRadius:  16,
    minWidth:      320,
  },
  heading: {
    fontFamily:   'Georgia, serif',
    fontSize:     '1.5rem',
    fontWeight:   700,
    color:        '#16100B',
    margin:       0,
  },
  sub: {
    fontSize:   '0.9375rem',
    color:      '#7A6D61',
    margin:     0,
    textAlign:  'center',
  },
  error: {
    fontSize:     '0.875rem',
    color:        '#B91C1C',
    background:   '#FEF2F2',
    padding:      '0.625rem 1rem',
    borderRadius: 8,
    margin:       0,
  },
  btn: {
    display:        'inline-block',
    padding:        '0.625rem 1.5rem',
    background:     '#16100B',
    color:          '#fff',
    border:         'none',
    borderRadius:   8,
    fontSize:       '0.9375rem',
    fontWeight:     700,
    textDecoration: 'none',
    textAlign:      'center' as const,
  },
}

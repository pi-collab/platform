import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import CreatorSignInButton from '@/components/CreatorSignInButton'
import PhoneLogin from './PhoneLogin'
import { safeNext } from '@/lib/safe-next'

export const metadata = {
  title: 'Creator login — Guapd',
  robots: { index: false, follow: false },
}

export default async function CreatorLoginPage({
  searchParams,
}: {
  searchParams: { error?: string; next?: string }
}) {
  // Where to land after sign-in. Validated here, once, so every path below
  // (already-signed-in redirect, phone OTP, Google) gets a trusted value.
  const next = safeNext(searchParams.next, '/creator/deals')

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
    <main style={styles.main}>
      <div style={styles.card}>
        <h1 style={styles.heading}>Creator login</h1>
        <p style={styles.sub}>Sign in to manage your deals.</p>

        {searchParams.error === 'no_account' && (
          <p style={styles.error}>
            No creator account found.{' '}
            <a href="/signup/creator" style={{ color: '#854d0e', fontWeight: 600 }}>
              Sign up as a creator &rarr;
            </a>
          </p>
        )}

        {searchParams.error === 'account_exists' && (
          <p style={styles.error}>
            This phone is already registered. Sign in below.
          </p>
        )}

        {searchParams.error && searchParams.error !== 'no_account' && searchParams.error !== 'account_exists' && (
          <p style={styles.error}>
            Sign-in failed ({searchParams.error}). Please try again.
          </p>
        )}

        <PhoneLogin next={next} />

        <div style={styles.divider}>
          <span style={styles.dividerLine} />
          <span style={styles.dividerText}>or</span>
          <span style={styles.dividerLine} />
        </div>

        <CreatorSignInButton next={next} />

        <p style={styles.footer}>
          Don&apos;t have an account?{' '}
          <a href="/signup/creator" style={styles.footerLink}>Sign up as a creator</a>
        </p>
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
    maxWidth:      380,
    width:         '100%',
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
  divider: {
    display:    'flex',
    alignItems: 'center',
    gap:        '0.75rem',
    width:      '100%',
  },
  dividerLine: {
    flex:       1,
    height:     1,
    background: '#e5e5e5',
  },
  dividerText: {
    fontSize:   '0.75rem',
    color:      '#bbb',
    fontWeight: 500,
    textTransform: 'uppercase',
  },
  footer: {
    fontSize:   '0.8125rem',
    color:      '#888',
    margin:     0,
  },
  footerLink: {
    color:      '#111',
    fontWeight: 600,
  },
}

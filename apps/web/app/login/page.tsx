import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import SignInButton from '@/components/SignInButton'

export const metadata = {
  title: 'Brand login',
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: { error?: string }
}) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()

  // Already logged in — send straight to dashboard
  if (user) redirect('/dashboard')

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
}

import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import SignOutButton from '@/components/SignOutButton'

export const metadata = {
  title: 'Dashboard',
}

export default async function DashboardPage() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  // Fetch the corresponding row from our users table
  const { data: profile } = await supabase
    .from('users')
    .select('id, full_name, email, role, created_at')
    .eq('auth_id', user.id)
    .maybeSingle()

  return (
    <main style={styles.main}>
      <div style={styles.card}>
        <div style={styles.header}>
          <h1 style={styles.heading}>Dashboard</h1>
          <SignOutButton />
        </div>

        <p style={styles.label}>Signed in as</p>
        <p style={styles.email}>{user.email}</p>

        <hr style={styles.divider} />

        <p style={styles.label}>Profile row (users table)</p>
        <pre style={styles.pre}>
          {JSON.stringify(profile ?? 'row not found', null, 2)}
        </pre>
      </div>
    </main>
  )
}

const styles: Record<string, React.CSSProperties> = {
  main: {
    display:        'flex',
    alignItems:     'flex-start',
    justifyContent: 'center',
    minHeight:      '100vh',
    background:     '#FDFAF6',
    padding:        '4rem 1.5rem',
  },
  card: {
    width:         '100%',
    maxWidth:      560,
    background:    '#fff',
    border:        '1px solid #DDD3BE',
    borderRadius:  16,
    padding:       '2rem',
  },
  header: {
    display:        'flex',
    justifyContent: 'space-between',
    alignItems:     'center',
    marginBottom:   '1.5rem',
  },
  heading: {
    fontFamily: 'Georgia, serif',
    fontSize:   '1.5rem',
    fontWeight: 700,
    color:      '#16100B',
    margin:     0,
  },
  label: {
    fontSize:      '0.75rem',
    fontWeight:    700,
    letterSpacing: '0.06em',
    textTransform: 'uppercase',
    color:         '#9B8E82',
    margin:        '0 0 0.375rem',
  },
  email: {
    fontSize: '0.9375rem',
    color:    '#16100B',
    margin:   '0 0 1.25rem',
  },
  divider: {
    border:       'none',
    borderTop:    '1px solid #DDD3BE',
    margin:       '1.25rem 0',
  },
  pre: {
    background:   '#F6F0E5',
    border:       '1px solid #DDD3BE',
    borderRadius: 8,
    padding:      '1rem',
    fontSize:     '0.8125rem',
    lineHeight:   1.6,
    overflow:     'auto',
    margin:       0,
    color:        '#3D342C',
  },
}

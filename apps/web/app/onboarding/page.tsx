import { redirect }     from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import OnboardingForm   from './OnboardingForm'

export const metadata = { title: 'Set up your brand', robots: { index: false, follow: false } }

export default async function OnboardingPage() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // If already onboarded, skip back to dashboard
  const { data: profile } = await supabase
    .from('users').select('id').eq('auth_id', user.id).maybeSingle()

  if (profile) {
    const { data: membership } = await supabase
      .from('brand_members').select('id').eq('user_id', profile.id).maybeSingle()
    if (membership) redirect('/dashboard')
  }

  return (
    <main style={styles.main}>
      <div style={styles.card}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.375rem' }}>
          <h1 style={styles.heading}>Set up your brand</h1>
          <p style={styles.sub}>This takes 60 seconds. You can update details later.</p>
        </div>
        <OnboardingForm />
      </div>
    </main>
  )
}

const styles: Record<string, React.CSSProperties> = {
  main:    { display: 'flex', alignItems: 'flex-start', justifyContent: 'center', minHeight: '100vh', background: '#FDFAF6', padding: '4rem 1.5rem' },
  card:    { width: '100%', maxWidth: 520, background: '#fff', border: '1px solid #DDD3BE', borderRadius: 16, padding: '2rem', display: 'flex', flexDirection: 'column', gap: '1.75rem' },
  heading: { fontFamily: 'Georgia, serif', fontSize: '1.5rem', fontWeight: 700, color: '#16100B', margin: 0 },
  sub:     { fontSize: '0.9375rem', color: '#7A6D61', margin: 0 },
}

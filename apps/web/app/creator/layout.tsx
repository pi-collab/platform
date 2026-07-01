import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import SignOutButton from '@/components/SignOutButton'

export default async function CreatorLayout({ children }: { children: React.ReactNode }) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect('/login/creator')

  const { data: profile } = await supabase
    .from('users')
    .select('id')
    .eq('auth_id', user.id)
    .maybeSingle()

  let creatorName: string | null = null
  if (profile) {
    const { data: creator } = await supabase
      .from('creators')
      .select('full_name')
      .eq('user_id', profile.id)
      .maybeSingle()
    creatorName = creator?.full_name ?? null
  }

  if (!creatorName) redirect('/')

  return (
    <div>
      <header style={headerStyle}>
        <div style={headerInner}>
          <Link href="/creator/deals" style={logoLink}>
            Guapd <span style={creatorBadge}>Creator</span>
          </Link>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <span style={userLabel}>{creatorName}</span>
            <SignOutButton redirectTo="/login/creator" />
          </div>
        </div>
      </header>
      {children}
    </div>
  )
}

const headerStyle: React.CSSProperties = {
  borderBottom: '1px solid #e5e5e5',
  background: '#fafafa',
}

const headerInner: React.CSSProperties = {
  maxWidth: 480,
  margin: '0 auto',
  padding: '0.75rem 1rem',
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
}

const logoLink: React.CSSProperties = {
  fontSize: '1rem',
  fontWeight: 700,
  color: '#111',
  textDecoration: 'none',
  display: 'flex',
  alignItems: 'center',
  gap: '0.5rem',
}

const creatorBadge: React.CSSProperties = {
  fontSize: '0.625rem',
  fontWeight: 700,
  textTransform: 'uppercase',
  letterSpacing: '0.06em',
  padding: '0.15rem 0.5rem',
  borderRadius: 9999,
  background: '#ede9fe',
  color: '#6d28d9',
}

const userLabel: React.CSSProperties = {
  fontSize: '0.8125rem',
  fontWeight: 500,
  color: '#555',
}

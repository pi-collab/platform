import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import CreatorSidebar from '@/components/CreatorSidebar'
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
  let isVetted = false
  let isRejected = false
  if (profile) {
    const { data: creator } = await supabase
      .from('creators')
      .select('full_name, is_vetted, is_rejected')
      .eq('user_id', profile.id)
      .maybeSingle()
    creatorName = creator?.full_name ?? null
    isVetted = creator?.is_vetted ?? false
    isRejected = creator?.is_rejected ?? false
  }

  if (!creatorName) redirect('/')

  // Unread notification count
  let unreadCount = 0
  if (profile && isVetted) {
    const { count } = await supabase
      .from('notifications')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', profile.id)
      .is('read_at', null)
    unreadCount = count ?? 0
  }

  // Vetting gate: unvetted creators see a pending or rejected interstitial
  if (!isVetted) {
    return (
      <div>
        <header style={gateHeader}>
          <span style={gateLogo}>
            Guapd <span style={gateBadge}>Creator</span>
          </span>
          <SignOutButton redirectTo="/login/creator" />
        </header>
        <main style={{ padding: '3rem 1rem', textAlign: 'center', maxWidth: 480, margin: '0 auto' }}>
          {isRejected ? (
            <>
              <h1 style={{ fontSize: '1.25rem', fontWeight: 700, color: '#111', marginBottom: '0.75rem' }}>
                Your application wasn&apos;t approved this time
              </h1>
              <p style={{ fontSize: '0.9375rem', color: '#888', lineHeight: 1.6, margin: 0 }}>
                We weren&apos;t able to approve your profile right now, but don&apos;t worry — we&apos;re always looking for talented creators like you. Reach out to us and we&apos;d love to reconsider.
              </p>
            </>
          ) : (
            <>
              <h1 style={{ fontSize: '1.25rem', fontWeight: 700, color: '#111', marginBottom: '0.75rem' }}>
                Your account is under review
              </h1>
              <p style={{ fontSize: '0.9375rem', color: '#888', lineHeight: 1.6, margin: 0 }}>
                We&apos;ll notify you when you&apos;re approved. This usually takes 24-48 hours.
              </p>
            </>
          )}
        </main>
      </div>
    )
  }

  return (
    <>
      <CreatorSidebar creatorName={creatorName} unreadCount={unreadCount} />
      <main className="creator-main">{children}</main>
    </>
  )
}

const gateHeader: React.CSSProperties = {
  borderBottom: '1px solid #e5e5e5',
  background: '#fafafa',
  padding: '0.75rem 1rem',
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  maxWidth: 480,
  margin: '0 auto',
}

const gateLogo: React.CSSProperties = {
  fontSize: '1rem',
  fontWeight: 700,
  color: '#111',
  display: 'flex',
  alignItems: 'center',
  gap: '0.5rem',
}

const gateBadge: React.CSSProperties = {
  fontSize: '0.625rem',
  fontWeight: 700,
  textTransform: 'uppercase',
  letterSpacing: '0.06em',
  padding: '0.15rem 0.5rem',
  borderRadius: 9999,
  background: '#ede9fe',
  color: '#6d28d9',
}

import { redirect }     from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import SignOutButton    from '@/components/SignOutButton'

export const metadata = {
  title: 'Dashboard',
  robots: { index: false, follow: false },
}

export default async function DashboardPage() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // Fetch our internal user row
  const { data: profile } = await supabase
    .from('users')
    .select('id, full_name, email, role, created_at')
    .eq('auth_id', user.id)
    .maybeSingle()

  // Check brand membership — redirect to onboarding if not yet set up
  const { data: membership } = profile
    ? await supabase
        .from('brand_members')
        .select('is_admin, brands(id, name, category, company_size, website, contact_name, social_accounts)')
        .eq('user_id', profile.id)
        .maybeSingle()
    : { data: null }

  // Founders without a brand → send to /ops, not onboarding
  if (!membership) {
    const allowedRaw = process.env.OPS_ALLOWED_EMAILS
    if (allowedRaw && user.email) {
      const allowed = new Set(allowedRaw.split(',').map(e => e.trim().toLowerCase()))
      if (allowed.has(user.email.toLowerCase())) {
        redirect('/ops')
      }
    }
    redirect('/onboarding')
  }

  const brand = (membership as any)?.brands ?? null

  return (
    <main style={styles.main}>
      <div style={styles.card}>
        <div style={styles.header}>
          <h1 style={styles.heading}>Dashboard</h1>
          <SignOutButton />
        </div>

        <p style={styles.label}>Signed in as</p>
        <p style={styles.value}>{user.email}</p>

        <hr style={styles.divider} />

        <p style={styles.label}>Brand</p>
        <div style={styles.brandCard}>
          <p style={styles.brandName}>{brand?.name}</p>
          <div style={styles.brandMeta}>
            {brand?.category    && <span style={styles.tag}>{brand.category}</span>}
            {brand?.company_size && <span style={styles.tag}>{brand.company_size} people</span>}
            {(membership as any)?.is_admin && <span style={{ ...styles.tag, background: '#F0FDF4', color: '#166534', border: '1px solid #BBF7D0' }}>Admin</span>}
          </div>
          {brand?.website && (
            <p style={styles.brandDetail}>
              <span style={styles.metaLabel}>Website</span> {brand.website}
            </p>
          )}
          {brand?.contact_name && (
            <p style={styles.brandDetail}>
              <span style={styles.metaLabel}>Contact</span> {brand.contact_name}
            </p>
          )}
          {(brand?.social_accounts?.instagram || brand?.social_accounts?.linkedin) && (
            <p style={styles.brandDetail}>
              <span style={styles.metaLabel}>Social</span>
              {brand.social_accounts.instagram && ` IG: ${brand.social_accounts.instagram}`}
              {brand.social_accounts.linkedin   && `  LI: ${brand.social_accounts.linkedin}`}
            </p>
          )}
        </div>

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
    textTransform: 'uppercase' as const,
    color:         '#9B8E82',
    margin:        '0 0 0.375rem',
  },
  metaLabel: {
    fontWeight:    700,
    color:         '#9B8E82',
    marginRight:   '0.375rem',
  },
  value: {
    fontSize: '0.9375rem',
    color:    '#16100B',
    margin:   '0 0 1.25rem',
  },
  divider: {
    border:    'none',
    borderTop: '1px solid #DDD3BE',
    margin:    '1.25rem 0',
  },
  brandCard: {
    background:   '#F6F0E5',
    border:       '1px solid #DDD3BE',
    borderRadius: 8,
    padding:      '1rem',
    display:      'flex',
    flexDirection: 'column' as const,
    gap:          '0.5rem',
    marginBottom: '0.25rem',
  },
  brandName: {
    fontFamily: 'Georgia, serif',
    fontSize:   '1.125rem',
    fontWeight: 700,
    color:      '#16100B',
    margin:     0,
  },
  brandMeta: {
    display: 'flex',
    gap:     '0.5rem',
    flexWrap: 'wrap' as const,
  },
  tag: {
    fontSize:     '0.75rem',
    fontWeight:   600,
    padding:      '0.25rem 0.625rem',
    borderRadius: 9999,
    background:   '#fff',
    border:       '1px solid #DDD3BE',
    color:        '#3D342C',
  },
  brandDetail: {
    fontSize: '0.8125rem',
    color:    '#3D342C',
    margin:   0,
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

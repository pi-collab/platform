import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import SignOutButton from '@/components/SignOutButton'
import BrandNavLinks from '@/components/BrandNavLinks'

export default async function BrandNav() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()

  let brandName: string | null = null
  if (user) {
    const { data: profile } = await supabase
      .from('users')
      .select('id')
      .eq('auth_id', user.id)
      .maybeSingle()

    if (profile) {
      const { data: membership } = await supabase
        .from('brand_members')
        .select('brands(name)')
        .eq('user_id', profile.id)
        .maybeSingle()

      brandName = (membership as any)?.brands?.name ?? null
    }
  }

  return (
    <header style={headerStyle}>
      <div style={headerInner}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '2rem' }}>
          <Link href="/deals" style={logoStyle}>
            Guapd
          </Link>
          <BrandNavLinks />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          {brandName && <span style={nameStyle}>{brandName}</span>}
          <SignOutButton />
        </div>
      </div>
    </header>
  )
}

const headerStyle: React.CSSProperties = {
  borderBottom: '1px solid #e5e5e5',
  background: '#fff',
  position: 'sticky',
  top: 0,
  zIndex: 50,
}

const headerInner: React.CSSProperties = {
  maxWidth: 1080,
  margin: '0 auto',
  padding: '0 1.5rem',
  height: 56,
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
}

const logoStyle: React.CSSProperties = {
  fontSize: '1.125rem',
  fontWeight: 700,
  color: '#111',
  textDecoration: 'none',
}

const nameStyle: React.CSSProperties = {
  fontSize: '0.8125rem',
  fontWeight: 500,
  color: '#555',
}

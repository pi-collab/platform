import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import SignOutButton from '@/components/SignOutButton'

export const metadata = {
  title: 'Pending approval',
  robots: { index: false, follow: false },
}

export default async function BrandPendingPage() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login/brand')

  return (
    <main style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', background: '#fafafa', padding: '1rem' }}>
      <div style={{ textAlign: 'center', maxWidth: 420, display: 'flex', flexDirection: 'column', gap: '1rem', alignItems: 'center' }}>
        <h1 style={{ fontSize: '1.25rem', fontWeight: 700, color: '#111', margin: 0 }}>
          Your brand is under review
        </h1>
        <p style={{ fontSize: '0.9375rem', color: '#888', lineHeight: 1.6, margin: 0 }}>
          We&apos;re reviewing your brand profile. This usually takes 24-48 hours. You&apos;ll be able to access the platform once approved.
        </p>
        <SignOutButton />
      </div>
    </main>
  )
}

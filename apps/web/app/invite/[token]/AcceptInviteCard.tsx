'use client'

import { createClient } from '@/lib/supabase/client'

interface Props {
  brandName: string
  inviteEmail: string
  token: string
  needsAuth?: boolean
}

export default function AcceptInviteCard({ brandName, inviteEmail, token, needsAuth }: Props) {
  const handleSignIn = async () => {
    const supabase = createClient()
    const redirectTo = `${window.location.origin}/auth/callback?next=/invite/${token}`
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo },
    })
  }

  if (!needsAuth) return null

  return (
    <main style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'center', minHeight: '100vh', background: '#FDFAF6', padding: '4rem 1.5rem' }}>
      <div style={{ width: '100%', maxWidth: 480, background: '#fff', border: '1px solid #DDD3BE', borderRadius: 16, padding: '2rem', textAlign: 'center', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
        <h1 style={{ fontFamily: 'Georgia, serif', fontSize: '1.25rem', fontWeight: 700, color: '#16100B', margin: 0 }}>
          Join {brandName}
        </h1>
        <p style={{ fontSize: '0.9375rem', color: '#7A6D61', margin: 0, lineHeight: 1.5 }}>
          You've been invited to join <strong>{brandName}</strong> on Guapd.
          <br />Sign in with <strong>{inviteEmail}</strong> to accept.
        </p>
        <button
          onClick={handleSignIn}
          style={{
            padding: '0.75rem 1.5rem',
            background: '#16100B',
            color: '#fff',
            border: 'none',
            borderRadius: 8,
            fontSize: '0.9375rem',
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          Sign in with Google
        </button>
      </div>
    </main>
  )
}

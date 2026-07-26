'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'

export default function SignInButton() {
  const [loading, setLoading] = useState(false)

  const handleSignIn = async () => {
    if (loading) return
    setLoading(true)
    const supabase = createClient()
    // Clear any existing session first so OAuth creates a fresh one
    await supabase.auth.signOut()
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
      },
    })
    // If signInWithOAuth doesn't redirect (e.g. popup blocked), re-enable
    setTimeout(() => setLoading(false), 5000)
  }

  return (
    <button onClick={handleSignIn} disabled={loading} style={{ ...styles.btn, opacity: loading ? 0.6 : 1 }}>
      {loading ? 'Redirecting to Google...' : 'Continue with Google'}
    </button>
  )
}

const styles = {
  btn: {
    padding:      '0.75rem 2rem',
    background:   '#16100B',
    color:        '#fff',
    border:       'none',
    borderRadius: 9999,
    fontSize:     '0.9375rem',
    fontWeight:   600,
    cursor:       'pointer',
    fontFamily:   'inherit',
  } as React.CSSProperties,
}

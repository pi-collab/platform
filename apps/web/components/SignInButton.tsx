'use client'

import { createClient } from '@/lib/supabase/client'

export default function SignInButton() {
  const handleSignIn = async () => {
    const supabase = createClient()
    // Clear any existing session first so OAuth creates a fresh one
    await supabase.auth.signOut()
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
      },
    })
  }

  return (
    <button onClick={handleSignIn} style={styles.btn}>
      Continue with Google
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

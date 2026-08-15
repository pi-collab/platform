'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'

/**
 * `next` is where the creator lands after Google sign-in. The login page
 * validates it (see `lib/safe-next.ts`) before passing it down; the callback
 * route validates again on the way back. Defaults to the deals list for
 * callers with no specific destination (e.g. /signup/creator).
 */
export default function CreatorSignInButton({ next = '/creator/dashboard' }: { next?: string }) {
  const [loading, setLoading] = useState(false)

  const handleSignIn = async () => {
    if (loading) return
    setLoading(true)
    const supabase = createClient()
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/auth/creator/callback?next=${encodeURIComponent(next)}`,
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
    background:   '#111',
    color:        '#fff',
    border:       'none',
    borderRadius: 9999,
    fontSize:     '0.9375rem',
    fontWeight:   600,
    cursor:       'pointer',
    fontFamily:   'inherit',
  } as React.CSSProperties,
}

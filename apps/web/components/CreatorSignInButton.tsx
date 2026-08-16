'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'

/**
 * `next` is where the creator lands after Google sign-in. The login page
 * validates it (see `lib/safe-next.ts`) before passing it down; the callback
 * route validates again on the way back. Defaults to the deals list for
 * callers with no specific destination (e.g. /signup/creator).
 */
export default function CreatorSignInButton({
  next = '/creator/dashboard',
  className,
}: {
  next?: string
  /** When given, replaces the inline styling entirely so the button can adopt
   *  a page's own design (the paged-flow signup renders it as a ghost row). */
  className?: string
}) {
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
    <button
      onClick={handleSignIn}
      disabled={loading}
      className={className}
      style={className ? undefined : { ...styles.btn, opacity: loading ? 0.6 : 1 }}
    >
      {className && (
        <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
          <path fill="#4285F4" d="M45 24c0-1.6-.1-2.7-.4-4H24v7.5h12c-.2 2-1.5 5-4.4 7l6.8 5.3C42.7 42.2 45 36.7 45 24z" />
          <path fill="#34A853" d="M24 46c5.9 0 10.8-2 14.4-5.2l-6.8-5.3c-1.9 1.3-4.4 2.2-7.6 2.2-5.8 0-10.7-3.9-12.5-9.2l-7 5.4C7.9 40.8 15.3 46 24 46z" />
          <path fill="#FBBC05" d="M11.5 28.5c-.5-1.4-.7-2.9-.7-4.5s.3-3.1.7-4.5l-7-5.4C3.6 17.1 3 20.5 3 24s.6 6.9 1.5 9.9l7-5.4z" />
          <path fill="#EA4335" d="M24 10.8c3.2 0 5.4 1.4 6.6 2.5l5.9-5.8C32.8 4.1 28 2 24 2 15.3 2 7.9 7.2 4.5 14.1l7 5.4C13.3 14.7 18.2 10.8 24 10.8z" />
        </svg>
      )}
      {loading ? 'Redirecting to Google…' : 'Continue with Google'}
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

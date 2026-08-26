'use client'

import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { resetAnalytics } from '@/lib/analytics'

export default function SignOutButton({
  redirectTo,
  className,
  label = 'Sign out',
  children,
}: {
  /**
   * Where to land after signing out. REQUIRED, deliberately.
   *
   * This defaulted to '/login/brand', and the creator profile did not override
   * it — so a creator who signed out was handed the brand sign-in page. A
   * default that is right for one audience and wrong for another fails
   * silently, and only in the flow nobody re-tests. Every caller now says
   * where its own people belong.
   */
  redirectTo: string
  /** When given, replaces the default inline styling entirely so the button can
   *  adopt a page's own design (e.g. the onboarding nav pill). */
  className?: string
  label?: string
  /**
   * Replaces the label entirely, for menu rows that need an icon beside the
   * text. Optional, so the existing callers are untouched. The point is that a
   * caller wanting different CONTENT never has to reimplement the sign-out
   * BEHAVIOUR, which is where the land-on-brand-login bug came from.
   */
  children?: React.ReactNode
}) {
  const router = useRouter()

  const handleSignOut = async () => {
    const supabase = createClient()
    await supabase.auth.signOut()
    // Clear the identified person BEFORE leaving. Without this, the next
    // person to use this browser inherits the previous user's identity and
    // their events land on the wrong account.
    resetAnalytics()
    window.location.href = redirectTo
  }

  return (
    <button
      onClick={handleSignOut}
      className={className}
      style={className ? undefined : styles.btn}
    >
      {children ?? label}
    </button>
  )
}

const styles = {
  btn: {
    padding:      '0.5rem 1.25rem',
    background:   'transparent',
    color:        '#5C5048',
    border:       '1px solid #DDD3BE',
    borderRadius: 9999,
    fontSize:     '0.875rem',
    cursor:       'pointer',
    fontFamily:   'inherit',
  } as React.CSSProperties,
}

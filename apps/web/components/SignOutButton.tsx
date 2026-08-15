'use client'

import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { resetAnalytics } from '@/lib/analytics'

export default function SignOutButton({
  redirectTo = '/login',
  className,
  label = 'Sign out',
}: {
  redirectTo?: string
  /** When given, replaces the default inline styling entirely so the button can
   *  adopt a page's own design (e.g. the onboarding nav pill). */
  className?: string
  label?: string
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
      {label}
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

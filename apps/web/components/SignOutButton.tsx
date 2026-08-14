'use client'

import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { resetAnalytics } from '@/lib/analytics'

export default function SignOutButton({ redirectTo = '/login' }: { redirectTo?: string }) {
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
    <button onClick={handleSignOut} style={styles.btn}>
      Sign out
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

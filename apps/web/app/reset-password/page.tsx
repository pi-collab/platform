import { cookies } from 'next/headers'
import { createClient } from '@/lib/supabase/server'
import { RECOVERY_COOKIE } from '@/lib/recovery-cookie'
import ResetPasswordForm from './ResetPasswordForm'
import AuthSupportLink from '@/components/AuthSupportLink'

export const metadata = {
  title: 'Set a new password — Guapd',
  robots: { index: false, follow: false },
}

/**
 * Password-reset COMPLETION page.
 *
 * Reached only from a recovery email link, via /auth/confirm. Two conditions
 * must BOTH hold to show the form:
 *
 *   1. A session exists — updateUser cannot change a password without one,
 *      so this is the real security boundary.
 *   2. The recovery marker cookie is present — proves the session came from a
 *      recovery link rather than an ordinary login, so someone sitting at an
 *      already-signed-in browser cannot change the password without knowing
 *      the current one.
 */
export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: { error?: string }
}) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const hasRecoveryMarker = cookies().get(RECOVERY_COOKIE)?.value === '1'

  const linkUsable = Boolean(user) && hasRecoveryMarker && !searchParams.error

  if (!linkUsable) {
    // One message for every failure mode — expired, already used, tampered,
    // no session, or an ordinary session with no recovery marker. Telling an
    // anonymous visitor WHICH it was would leak account state.
    return (
      <main style={wrapper}>
        <div style={card}>
          <h1 style={heading}>This link is no longer valid</h1>
          <p style={text}>
            Password reset links can only be used once and expire after a short time.
            Request a new one and it will arrive in your inbox.
          </p>
          <a href="/login" style={primaryLink}>Back to login</a>
        </div>
      </main>
    )
  }

  return (
    <main style={wrapper}>
      <div style={card}>
        <h1 style={heading}>Set a new password</h1>
        <p style={text}>
          Choose a new password for <strong>{user!.email}</strong>. You will be
          signed out everywhere else and can sign in again with the new password.
        </p>
        <ResetPasswordForm />
        <AuthSupportLink className="auth-support auth-support--center" />
      </div>
    </main>
  )
}

/* ── Styles ─────────────────────────────────────────────────────── */

const wrapper: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  minHeight: '100vh',
  background: '#fafafa',
  padding: '2rem 1rem',
}

const card: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '1rem',
  padding: '2.5rem',
  background: '#fff',
  border: '1px solid #e5e5e5',
  borderRadius: 16,
  maxWidth: 380,
  width: '100%',
}

const heading: React.CSSProperties = {
  fontSize: '1.375rem',
  fontWeight: 700,
  color: '#111',
  margin: 0,
}

const text: React.CSSProperties = {
  fontSize: '0.9375rem',
  color: '#666',
  margin: 0,
  lineHeight: 1.6,
}

const primaryLink: React.CSSProperties = {
  display: 'inline-block',
  padding: '0.625rem 1.25rem',
  background: '#111',
  color: '#fff',
  borderRadius: 8,
  fontWeight: 600,
  fontSize: '0.9375rem',
  textDecoration: 'none',
  textAlign: 'center',
}

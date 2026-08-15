'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { signInWithEmail, resetPassword } from '@/app/login/actions'
import ResendConfirmation from '@/components/ResendConfirmation'
import FormError from '@/components/FormError'
import { createClient } from '@/lib/supabase/client'

type View = 'login' | 'reset' | 'reset-sent'

/**
 * Brand login — design "Brand Login - Paged Flow".
 *
 * Shares the split shell and field styling with /signup/brand, which is the
 * same design's step 1. Heading and copy live in here rather than the page so
 * they can change with the view; a server component can't react to that, which
 * is what previously left this page titled "Brand login" above a signup form.
 *
 * Password reset is not in the export, but "Forgot password?" is, so it needs
 * somewhere to land. It reuses this panel rather than a separate page.
 */
export default function BrandLoginForm({ initialView = 'login' }: { initialView?: View }) {
  const router = useRouter()
  const [view, setView] = useState<View>(initialView)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPw, setShowPw] = useState(false)
  const [error, setError] = useState('')
  // An unconfirmed account is not a failed login, it's one that can't proceed
  // yet, so it gets a resend control rather than only red text.
  const [unconfirmed, setUnconfirmed] = useState(false)
  // Which way out to offer alongside the error: reset the password they got
  // wrong, or create the account they don't have.
  const [recover, setRecover] = useState<'reset' | 'signup' | null>(null)
  const [loading, setLoading] = useState(false)
  const [googleLoading, setGoogleLoading] = useState(false)

  function clearErrors() {
    setError('')
    setUnconfirmed(false)
    setRecover(null)
  }

  function switchTo(next: View) {
    clearErrors()
    setView(next)
  }

  async function handleGoogle() {
    if (googleLoading) return
    setGoogleLoading(true)
    const supabase = createClient()
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    })
    setTimeout(() => setGoogleLoading(false), 5000)
  }

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    if (loading) return
    clearErrors()
    setLoading(true)

    const res = await signInWithEmail(email, password)

    if (res.status === 'unconfirmed') {
      setLoading(false)
      setUnconfirmed(true)
      setError(res.message)
      return
    }
    if (res.status === 'wrong_password' || res.status === 'no_account') {
      setLoading(false)
      setError(res.message)
      setRecover(res.status === 'wrong_password' ? 'reset' : 'signup')
      return
    }

    // Stays loading — the page navigates away and unmounts this form.
    router.push('/dashboard')
    router.refresh()
  }

  async function handleReset(e: React.FormEvent) {
    e.preventDefault()
    if (loading) return
    clearErrors()
    setLoading(true)

    const res = await resetPassword(email)
    setLoading(false)

    if (res.status === 'error') {
      setError(res.message)
      return
    }
    setView('reset-sent')
  }

  // ── Reset requested ────────────────────────────────────────────────────────
  if (view === 'reset-sent') {
    return (
      <>
        <h2 className="signup-panel__title">Check your email.</h2>
        <div className="signup-form">
          {/* Deliberately not "we sent you a link": the action always reports
              success so an unregistered address can't be distinguished from a
              registered one. Saying "if" keeps the copy honest about that. */}
          <p className="signup-form__success">
            If an account exists for {email || 'that address'}, a password reset link is on its way.
          </p>
          <button type="button" onClick={() => switchTo('login')} className="signup-form__cta cta">
            Back to log in
          </button>
        </div>
      </>
    )
  }

  // ── Reset request ──────────────────────────────────────────────────────────
  if (view === 'reset') {
    return (
      <>
        <h2 className="signup-panel__title">Reset your password.</h2>
        <p className="signup-panel__sub">We&rsquo;ll email you a link to set a new one.</p>

        <form onSubmit={handleReset} className="signup-form">
          <div className="fld-box">
            <input
              type="email"
              placeholder="Email"
              aria-label="Email"
              value={email}
              onChange={(e) => { setEmail(e.target.value); clearErrors() }}
              autoComplete="email"
              required
              className="fld-box__input"
            />
          </div>

          {error && <FormError>{error}</FormError>}

          <button type="submit" disabled={loading} className="signup-form__cta cta">
            {loading ? 'Sending…' : 'Send reset link'}
          </button>

          <div className="signup-form__forgot">
            <button type="button" onClick={() => switchTo('login')} className="signup-form__forgot-link lnk">
              Back to log in
            </button>
          </div>
        </form>
      </>
    )
  }

  // ── Sign in ────────────────────────────────────────────────────────────────
  return (
    <>
      <h2 className="signup-panel__title">Let&rsquo;s get you in.</h2>
      <p className="signup-panel__sub">Sign in to your brand account.</p>

      <form onSubmit={handleLogin} className="signup-form">
        <button
          type="button"
          onClick={handleGoogle}
          disabled={googleLoading}
          className="signup-form__google ghost"
        >
          <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
            <path fill="#4285F4" d="M45 24c0-1.6-.1-2.7-.4-4H24v7.5h12c-.2 2-1.5 5-4.4 7l6.8 5.3C42.7 42.2 45 36.7 45 24z" />
            <path fill="#34A853" d="M24 46c5.9 0 10.8-2 14.4-5.2l-6.8-5.3c-1.9 1.3-4.4 2.2-7.6 2.2-5.8 0-10.7-3.9-12.5-9.2l-7 5.4C7.9 40.8 15.3 46 24 46z" />
            <path fill="#FBBC05" d="M11.5 28.5c-.5-1.4-.7-2.9-.7-4.5s.3-3.1.7-4.5l-7-5.4C3.6 17.1 3 20.5 3 24s.6 6.9 1.5 9.9l7-5.4z" />
            <path fill="#EA4335" d="M24 10.8c3.2 0 5.4 1.4 6.6 2.5l5.9-5.8C32.8 4.1 28 2 24 2 15.3 2 7.9 7.2 4.5 14.1l7 5.4C13.3 14.7 18.2 10.8 24 10.8z" />
          </svg>
          {googleLoading ? 'Redirecting to Google…' : 'Continue with Google'}
        </button>

        <div className="signup-form__divider">
          <span className="signup-form__rule" />
          <span className="signup-form__or">or</span>
          <span className="signup-form__rule" />
        </div>

        <div className="fld-box">
          <input
            type="email"
            placeholder="Email"
            aria-label="Email"
            value={email}
            onChange={(e) => { setEmail(e.target.value); clearErrors() }}
            autoComplete="email"
            required
            className="fld-box__input"
          />
        </div>

        <div className="fld-box fld-box--gap">
          <input
            type={showPw ? 'text' : 'password'}
            placeholder="Password"
            aria-label="Password"
            value={password}
            onChange={(e) => { setPassword(e.target.value); clearErrors() }}
            autoComplete="current-password"
            required
            className="fld-box__input"
          />
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => setShowPw((v) => !v)}
            className="fld-box__toggle lnk"
            aria-label={showPw ? 'Hide password' : 'Show password'}
          >
            {showPw ? (
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
                <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z" />
                <circle cx="12" cy="12" r="3" />
              </svg>
            ) : (
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
                <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z" />
                <circle cx="12" cy="12" r="3" />
                <line x1="3" y1="21" x2="21" y2="3" />
              </svg>
            )}
          </button>
        </div>

        {error && <FormError>{error}</FormError>}
        {unconfirmed && <ResendConfirmation email={email} />}

        {recover === 'reset' && (
          <div className="signup-form__recover">
            <button type="button" onClick={() => switchTo('reset')} className="signup-form__recover-link lnk">
              Reset password
            </button>
          </div>
        )}
        {recover === 'signup' && (
          <div className="signup-form__recover">
            <Link href="/signup/brand" className="signup-form__recover-link">Create an account</Link>
          </div>
        )}

        <button type="submit" disabled={loading} className="signup-form__cta cta">
          {loading ? 'Signing in…' : 'Sign in'}
        </button>

        <div className="signup-form__forgot">
          <button type="button" onClick={() => switchTo('reset')} className="signup-form__forgot-link lnk">
            Forgot password?
          </button>
        </div>
      </form>
    </>
  )
}

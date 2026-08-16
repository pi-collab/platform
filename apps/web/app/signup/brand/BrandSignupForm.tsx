'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import ResendConfirmation from '@/components/ResendConfirmation'
import { signUpWithEmail } from '@/app/login/actions'
import { createClient } from '@/lib/supabase/client'
import { validateNewPassword, MIN_PASSWORD_LENGTH } from '@/lib/password'
import { validateWorkEmail } from '@/lib/work-email'
import FormError from '@/components/FormError'
import { trackEvent } from '@/lib/analytics'

/**
 * Brand signup form — design "Brand Signup - Paged Flow step 1".
 *
 * Google sits ABOVE the divider (it's the intended primary path), email and
 * password below. The design has no confirm-password field; the show/hide
 * toggle replaces it, which is why the eye control is functional rather than
 * decorative.
 */
export default function BrandSignupForm({ oauthError }: { oauthError?: string }) {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPw, setShowPw] = useState(false)
  const [pwFocused, setPwFocused] = useState(false)
  const [error, setError] = useState('')
  const [errorField, setErrorField] = useState<'email' | 'password' | null>(null)
  // Set when the address already has an account. Adds routes OUT of the error
  // (log in / reset) rather than leaving them re-reading the same red text.
  const [existingAccount, setExistingAccount] = useState(false)
  // The OAuth rejection arrives as a searchParam, so it can't clear itself when
  // the user edits the form — this dismisses it locally.
  const [oauthDismissed, setOauthDismissed] = useState(false)

  const showOauthError = Boolean(oauthError) && !oauthDismissed

  /** Editing anything clears the error AND its field highlight together. */
  function clearErrors() {
    setError('')
    setErrorField(null)
    setExistingAccount(false)
    setOauthDismissed(true)
  }
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(false)
  const [googleLoading, setGoogleLoading] = useState(false)

  async function handleGoogle() {
    if (googleLoading) return
    setGoogleLoading(true)
    trackEvent('brand_signed_up', { method: 'google' })
    const supabase = createClient()
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    })
    setTimeout(() => setGoogleLoading(false), 5000)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (loading) return
    setError('')
    setErrorField(null)
    setExistingAccount(false)

    // Work-email rule, checked here for instant feedback. The server action
    // re-checks it — this is UX, not the gate. No bypass list on the client:
    // OPS_ALLOWED_EMAILS must never reach the browser bundle.
    const emailCheck = validateWorkEmail(email)
    if (!emailCheck.ok) {
      setError(emailCheck.message)
      setErrorField('email')
      return
    }

    // No confirmation field in this design — validate the password alone.
    const check = validateNewPassword(password)
    if (!check.ok) {
      setError(check.message)
      setErrorField('password')
      return
    }

    setLoading(true)
    const res = await signUpWithEmail(email, password)

    // Credentials that already work: a returning user, not a signup. Stay in
    // the loading state — the page navigates away and unmounts this form.
    if (res.status === 'signed_in') {
      router.push('/onboarding')
      router.refresh()
      return
    }

    if (res.status === 'exists') {
      setLoading(false)
      setError(res.message)
      setErrorField('email')
      setExistingAccount(true)
      return
    }

    if (res.status === 'error') {
      setLoading(false)
      setError(res.message)
      setErrorField('email')
      return
    }

    trackEvent('brand_signed_up', { method: 'email' })
    setLoading(false)
    setMessage(res.message)
  }

  // Post-submit confirmation state — signup requires a confirmed email before
  // the account can be used, so the user cannot continue in this tab.
  // Post-submit: the account exists but is unusable until the emailed link is
  // clicked, so the screen becomes about that one action and nothing else.
  if (message) {
    return (
      <>
        <h2 className="signup-panel__title">Verify your email</h2>
        <div className="signup-form">
          <p className="signup-form__success">{message}</p>
          {/* The app cannot know whether they've clicked the link yet, so the
              CTA is phrased as the user's own claim rather than asserting a
              verification we haven't observed. */}
          <Link href="/login/brand" className="signup-form__cta signup-form__cta--link">
            I&rsquo;ve verified, log me in
          </Link>
          <ResendConfirmation email={email} />
        </div>
      </>
    )
  }

  return (
    <>
      <h2 className="signup-panel__title">Create your account.</h2>
      <p className="signup-panel__sub">Set up your brand account to get started.</p>
      <form onSubmit={handleSubmit} className="signup-form">
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

        <div className={`fld-box${errorField === 'email' || (showOauthError && oauthError === 'work_email_required') ? ' fld-box--error' : ''}`}>
          <input
            type="email"
            placeholder="you@brand.com"
            aria-label="Work email"
            value={email}
            onChange={(e) => { setEmail(e.target.value); clearErrors() }}
            aria-invalid={errorField === 'email'}
            autoComplete="email"
            required
            className="fld-box__input"
          />
        </div>

        <div className={`fld-box fld-box--gap${errorField === 'password' ? ' fld-box--error' : ''}`}>
          <input
            type={showPw ? 'text' : 'password'}
            placeholder="Create a password"
            aria-label="Create a password"
            value={password}
            onChange={(e) => { setPassword(e.target.value); clearErrors() }}
            aria-invalid={errorField === 'password'}
            onFocus={() => setPwFocused(true)}
            onBlur={() => setPwFocused(false)}
            autoComplete="new-password"
            minLength={MIN_PASSWORD_LENGTH}
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

        <p
          className={`signup-form__hint${pwFocused ? ' signup-form__hint--visible' : ''}`}
          aria-hidden={!pwFocused}
        >
          At least {MIN_PASSWORD_LENGTH} characters.
        </p>

        {(error || showOauthError) && (
          <FormError>
            {error ||
              (oauthError === 'work_email_required'
                ? 'That Google account uses a personal email. Please use your work email, like you@brand.com.'
                : `Sign-in failed (${oauthError}). Please try again.`)}
          </FormError>
        )}

        {existingAccount && (
          <div className="signup-form__recover">
            <Link href="/login/brand" className="signup-form__recover-link">Log in</Link>
            <span className="signup-form__recover-sep">or</span>
            <Link href="/login/brand?view=reset" className="signup-form__recover-link">Reset password</Link>
          </div>
        )}

        <button type="submit" disabled={loading} className="signup-form__cta cta">
          {loading ? 'Creating account…' : 'Create account'}
        </button>

        <p className="signup-form__legal">
          By continuing, you agree to guapd&rsquo;s{' '}
          <Link href="/terms" className="signup-form__legal-link">Terms</Link> and{' '}
          <Link href="/privacy" className="signup-form__legal-link">Privacy Policy</Link>.
        </p>
      </form>
    </>
  )
}

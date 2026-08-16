'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import CreatorSignInButton from '@/components/CreatorSignInButton'
import OtpInput from '@/components/OtpInput'
import FormError from '@/components/FormError'
import { sendOTP, verifyAndMatch } from './actions'
import { isValidIndianMobile } from '@/lib/phone'

/** Seconds before "Resend code" re-arms, matching the design's countdown. */
const RESEND_SECONDS = 30

/** 98765 43210 — how Indian mobile numbers are read aloud and written down. */
function formatPhone(digits: string) {
  const d = digits.slice(0, 10)
  return d.length > 5 ? `${d.slice(0, 5)} ${d.slice(5)}` : d
}

/**
 * What the field is allowed to hold: at most ten subscriber digits.
 *
 * Clamped as it is typed rather than validated afterwards, so an eleventh
 * keystroke is ignored instead of silently invalidating a number that still
 * LOOKS like ten digits on screen — the display was already truncating, so the
 * field and the check disagreed and the button went dead for no visible reason.
 *
 * A pasted +91 or leading 0 is stripped rather than counted. Taking the first
 * ten digits of "919876543210" would give 9198765432 — a different number that
 * happens to pass every rule, so the code would go somewhere real and wrong.
 */
function takePhoneInput(raw: string): string {
  let d = raw.replace(/\D/g, '')
  if (d.length > 10 && d.startsWith('91')) d = d.slice(2)
  else if (d.length > 10 && d.startsWith('0')) d = d.slice(1)
  return d.slice(0, 10)
}

/**
 * Creator signup — design "Creator Signup - Paged Flow".
 *
 * Two screens in one component, because the second is a state of the first
 * rather than a destination: the phone number typed on screen one is what
 * screen two verifies, and losing it to a navigation would mean asking twice.
 */
export default function CreatorSignupForm() {
  const router = useRouter()
  const [screen, setScreen] = useState<'phone' | 'verify'>('phone')
  const [phone, setPhone] = useState('')
  const [code, setCode] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [resendIn, setResendIn] = useState(0)

  useEffect(() => {
    if (resendIn <= 0) return
    const t = setTimeout(() => setResendIn((n) => n - 1), 1000)
    return () => clearTimeout(t)
  }, [resendIn])

  // `phone` holds digits only — takePhoneInput guarantees it.
  const digits = phone
  // Same rule as the server, so the button cannot arm on a number sendOTP will
  // reject. The server still re-checks — this is UX, not the boundary.
  const phoneValid = isValidIndianMobile(digits)

  // The rule has exactly one content failure: a first digit outside 6-9. Every
  // other rejection is just "not finished yet". So it can be reported on the
  // first keystroke rather than after ten, and a disabled button never sits
  // there unexplained.
  const badPrefix = digits.length > 0 && !/^[6-9]/.test(digits)
  const phoneError = badPrefix
    ? 'Indian mobile numbers start with 6, 7, 8 or 9.'
    : ''

  async function send(isResend = false) {
    if (loading) return
    setError('')
    setLoading(true)
    const res = await sendOTP(digits)
    setLoading(false)

    if (res.status === 'error') {
      setError(res.message)
      return
    }
    setResendIn(RESEND_SECONDS)
    if (!isResend) {
      setCode('')
      setScreen('verify')
    }
  }

  async function verify(submitted: string) {
    if (loading) return
    setError('')
    setLoading(true)

    const res = await verifyAndMatch(digits, submitted)

    if (res.status !== 'ok') {
      setLoading(false)
      setError(res.message)
      return
    }
    // Stays loading — the page navigates away and unmounts this.
    // An existing account resolves to /login/creator, so signing up with a
    // number that already has one lands where it can be used.
    router.push(res.redirect)
  }

  // ── Verify ─────────────────────────────────────────────────────────────────
  if (screen === 'verify') {
    return (
      <>
        <h2 className="signup-panel__title signup-panel__title--sm">One more step.</h2>
        <p className="signup-panel__sub otp-sentto">
          Code sent to <strong>+91 {formatPhone(digits)}</strong>
          <button
            type="button"
            onClick={() => { setScreen('phone'); setError(''); setCode('') }}
            className="otp-edit lnk"
            aria-label="Change number"
          >
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                 strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
            </svg>
          </button>
        </p>

        <form
          onSubmit={(e) => { e.preventDefault(); verify(code) }}
          className="signup-form"
        >
          <OtpInput
            value={code}
            onChange={(v) => { setCode(v); setError('') }}
            onComplete={verify}
            error={Boolean(error)}
            disabled={loading}
            autoFocus
          />

          {error ? (
            <FormError>{error}</FormError>
          ) : (
            <p className="otp-hint">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                   strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 12a9 9 0 1 0 9-9 9.7 9.7 0 0 0-6.7 2.8L3 8" /><path d="M3 4v4h4" />
              </svg>
              {resendIn > 0
                ? `Resend code in 0:${String(resendIn).padStart(2, '0')}`
                : 'You can request a new code now.'}
            </p>
          )}

          <button type="submit" disabled={loading || code.length < 6} className="signup-form__cta cta">
            {loading ? 'Verifying…' : error ? 'Try again' : 'Verify & continue'}
          </button>

          <div className="signup-form__forgot">
            <button
              type="button"
              onClick={() => send(true)}
              disabled={loading || resendIn > 0}
              className="signup-form__forgot-link lnk"
            >
              {resendIn > 0 ? `Resend code in 0:${String(resendIn).padStart(2, '0')}` : 'Resend code'}
            </button>
          </div>
        </form>
      </>
    )
  }

  // ── Phone entry ────────────────────────────────────────────────────────────
  return (
    <>
      <h2 className="signup-panel__title">Create your account.</h2>
      <p className="signup-panel__sub">We&rsquo;ll send a one-time code to verify your number.</p>

      <form onSubmit={(e) => { e.preventDefault(); send() }} className="signup-form">
        <div className={`fld-box${phoneError ? ' fld-box--error' : ''}`}>
          <span className="phone-prefix">+91</span>
          <span className="phone-divider" />
          <input
            type="tel"
            inputMode="numeric"
            placeholder="98765 43210"
            aria-label="Mobile number"
            value={formatPhone(phone)}
            onChange={(e) => { setPhone(takePhoneInput(e.target.value)); setError('') }}
            autoComplete="tel-national"
            required
            autoFocus
            aria-invalid={Boolean(phoneError)}
            className="fld-box__input"
          />
        </div>

        {(error || phoneError) && <FormError>{error || phoneError}</FormError>}

        <button
          type="submit"
          disabled={loading || !phoneValid}
          className="signup-form__cta cta"
        >
          {loading ? 'Sending…' : 'Send code'}
        </button>

        <div className="signup-form__divider">
          <span className="signup-form__rule" />
          <span className="signup-form__or">or</span>
          <span className="signup-form__rule" />
        </div>

        <CreatorSignInButton className="signup-form__google ghost" />

        {/* Notice rather than a checkbox, matching /signup/brand. Placed after
            both actions because it qualifies both: the code and Google each
            create the account, and acceptance is recorded at that point
            (signup/creator/actions.ts). The explicit tick lives on the profile
            form, where the account is actually completed. */}
        <p className="signup-form__legal">
          By continuing, you agree to guapd&rsquo;s{' '}
          <Link href="/terms" className="signup-form__legal-link">Terms</Link> and{' '}
          <Link href="/privacy" className="signup-form__legal-link">Privacy Policy</Link>.
        </p>

        <p className="signup-form__cross">
          Looking to book creators?{' '}
          <Link href="/signup/brand" className="signup-form__cross-link">Sign up as a brand</Link>
        </p>
      </form>
    </>
  )
}

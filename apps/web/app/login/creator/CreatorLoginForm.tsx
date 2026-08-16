'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import OtpInput from '@/components/OtpInput'
import FormError from '@/components/FormError'
import { isValidIndianMobile } from '@/lib/phone'
import { sendLoginOTP, verifyAndSignIn } from './actions'

const RESEND_SECONDS = 30

function formatPhone(digits: string) {
  const d = digits.slice(0, 10)
  return d.length > 5 ? `${d.slice(0, 5)} ${d.slice(5)}` : d
}

/** At most ten subscriber digits; a pasted +91 or leading 0 is stripped. */
function takePhoneInput(raw: string): string {
  let d = raw.replace(/\D/g, '')
  if (d.length > 10 && d.startsWith('91')) d = d.slice(2)
  else if (d.length > 10 && d.startsWith('0')) d = d.slice(1)
  return d.slice(0, 10)
}

/**
 * Creator login — design "Creator Login - Paged Flow".
 *
 * Three states: enter a number, enter the code, or be told there is no account
 * for it. The third is a screen rather than an inline error because it is a
 * dead end for this form — the only way forward is signup, and that deserves
 * more than a line of red text under a field they cannot use.
 */
export default function CreatorLoginForm({ next }: { next?: string }) {
  const router = useRouter()
  const [screen, setScreen] = useState<'phone' | 'verify' | 'notfound'>('phone')
  const [phone, setPhone] = useState('')
  const [code, setCode] = useState('')
  const [error, setError] = useState('')
  const [notFoundKind, setNotFoundKind] = useState<'none' | 'unclaimed'>('none')
  const [loading, setLoading] = useState(false)
  const [resendIn, setResendIn] = useState(0)

  useEffect(() => {
    if (resendIn <= 0) return
    const t = setTimeout(() => setResendIn((n) => n - 1), 1000)
    return () => clearTimeout(t)
  }, [resendIn])

  const digits = phone
  const phoneValid = isValidIndianMobile(digits)
  const badPrefix = digits.length > 0 && !/^[6-9]/.test(digits)
  const phoneError = badPrefix ? 'Indian mobile numbers start with 6, 7, 8 or 9.' : ''

  async function send(isResend = false) {
    if (loading) return
    setError('')
    setLoading(true)
    const res = await sendLoginOTP(digits)
    setLoading(false)

    if (res.status === 'error') { setError(res.message); return }
    if (res.status === 'not_found' || res.status === 'unclaimed') {
      setNotFoundKind(res.status === 'unclaimed' ? 'unclaimed' : 'none')
      setScreen('notfound')
      return
    }

    setResendIn(RESEND_SECONDS)
    if (!isResend) { setCode(''); setScreen('verify') }
  }

  async function verify(submitted: string) {
    if (loading) return
    setError('')
    setLoading(true)

    const res = await verifyAndSignIn(digits, submitted, next)
    if (res.status === 'error') {
      setLoading(false)
      setError(res.message)
      return
    }
    // Stays loading — the page navigates away and unmounts this.
    router.push(res.redirect)
    router.refresh()
  }

  function backToPhone() {
    setScreen('phone')
    setError('')
    setCode('')
  }

  // ── No account for this number ─────────────────────────────────────────────
  if (screen === 'notfound') {
    return (
      <>
        <h2 className="signup-panel__title">
          {notFoundKind === 'unclaimed' ? 'Almost there.' : 'No account yet.'}
        </h2>
        <p className="signup-panel__sub">
          {notFoundKind === 'unclaimed'
            ? <>We have a profile for <strong>+91 {formatPhone(digits)}</strong> but it hasn&rsquo;t been
               set up yet. Sign up with this number to claim it.</>
            : <>We couldn&rsquo;t find an account for <strong>+91 {formatPhone(digits)}</strong>.</>}
        </p>

        <div className="signup-form">
          <Link href="/signup/creator" className="signup-form__cta signup-form__cta--link">
            {notFoundKind === 'unclaimed' ? 'Claim your profile' : 'Create an account'}
          </Link>
          <div className="signup-form__forgot">
            <button type="button" onClick={backToPhone} className="signup-form__forgot-link lnk">
              Try a different number
            </button>
          </div>
        </div>
      </>
    )
  }

  // ── Verify ─────────────────────────────────────────────────────────────────
  if (screen === 'verify') {
    return (
      <>
        <h2 className="signup-panel__title signup-panel__title--sm">One more step.</h2>
        <p className="signup-panel__sub otp-sentto">
          Code sent to <strong>+91 {formatPhone(digits)}</strong>
          <button type="button" onClick={backToPhone} className="otp-edit lnk" aria-label="Change number">
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                 strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
            </svg>
          </button>
        </p>

        <form onSubmit={(e) => { e.preventDefault(); verify(code) }} className="signup-form">
          <OtpInput
            value={code}
            onChange={(v) => { setCode(v); setError('') }}
            onComplete={verify}
            error={Boolean(error)}
            disabled={loading}
            autoFocus
          />

          {error && <FormError>{error}</FormError>}

          <button type="submit" disabled={loading || code.length < 6} className="signup-form__cta cta">
            {loading ? 'Signing you in…' : error ? 'Try again' : 'Verify & continue'}
          </button>

          <div className="otp-resend-row">
            <button
              type="button"
              onClick={() => send(true)}
              disabled={loading || resendIn > 0}
              className="otp-resend lnk"
            >
              {resendIn > 0 && (
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                     strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M3 12a9 9 0 1 0 9-9 9.7 9.7 0 0 0-6.7 2.8L3 8" /><path d="M3 4v4h4" />
                </svg>
              )}
              {resendIn > 0 ? `Resend code in 0:${String(resendIn).padStart(2, '0')}` : 'Resend code'}
            </button>
          </div>

          <p className="signup-form__cross">
            <button type="button" onClick={backToPhone} className="signup-form__cross-link lnk">
              Back to sign in
            </button>
          </p>
        </form>
      </>
    )
  }

  // ── Phone entry ────────────────────────────────────────────────────────────
  return (
    <>
      <h2 className="signup-panel__title">Let&rsquo;s get you in.</h2>

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

        <button type="submit" disabled={loading || !phoneValid} className="signup-form__cta cta">
          {loading ? 'Sending…' : 'Send code'}
        </button>

        <div className="signup-form__forgot">
          {/* A mailto rather than the design's toast: there is no account
              recovery flow to open, and a link that does nothing is worse than
              one that reaches a person. */}
          <a href="mailto:contact@guapd.com" className="signup-form__forgot-link">
            Trouble signing in?
          </a>
        </div>

        <p className="signup-form__cross">
          Looking to book creators?{' '}
          <Link href="/login/brand" className="signup-form__cross-link">Log in as a brand</Link>
        </p>
      </form>
    </>
  )
}

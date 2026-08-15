'use client'

import { useState } from 'react'
import { setNewPassword } from './actions'
import { validateNewPassword, MIN_PASSWORD_LENGTH } from '@/lib/password'
import FormError from '@/components/FormError'

/**
 * Owns its headings as well as its fields, because both change once the
 * password has been updated and a server component cannot react to that.
 */
export default function ResetPasswordForm({ email }: { email: string }) {
  const [password, setPassword] = useState('')
  const [confirmPw, setConfirmPw] = useState('')
  const [showPw, setShowPw] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [done, setDone] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (loading) return
    setError('')

    // Instant feedback only — actions.ts re-runs this same check server-side.
    const check = validateNewPassword(password, confirmPw)
    if (!check.ok) {
      setError(check.message)
      return
    }

    setLoading(true)
    const res = await setNewPassword(password, confirmPw)

    if (res.status === 'ok') {
      setDone(true)
      setLoading(false)
      return
    }

    setLoading(false)
    if (res.status === 'expired') {
      setError('This reset link has expired or was already used. Request a new one.')
      return
    }
    setError(res.message)
  }

  if (done) {
    return (
      <>
        <h2 className="signup-panel__title">Password updated.</h2>
        <div className="signup-form">
          <p className="signup-form__success">
            You&rsquo;ve been signed out everywhere else. Sign in with your new password.
          </p>
          {/*
            A real anchor with a FULL page load, not router.push. The server
            action cleared the auth cookies, but Next's client router cache
            still holds the RSC payload from when this page rendered
            authenticated — a soft navigation can serve that stale state. A hard
            load guarantees /login/brand re-renders against the signed-out
            session.
          */}
          <a href="/login/brand" className="signup-form__cta signup-form__cta--link">
            Go to log in
          </a>
        </div>
      </>
    )
  }

  return (
    <>
      <h2 className="signup-panel__title">Set a new password.</h2>
      <p className="signup-panel__sub">
        Choose a new password for {email}. You&rsquo;ll be signed out everywhere else.
      </p>

      <form onSubmit={handleSubmit} className="signup-form">
        <div className="fld-box">
          <input
            type={showPw ? 'text' : 'password'}
            placeholder="New password"
            aria-label="New password"
            value={password}
            onChange={(e) => { setPassword(e.target.value); setError('') }}
            minLength={MIN_PASSWORD_LENGTH}
            autoComplete="new-password"
            required
            autoFocus
            disabled={loading}
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

        {/* Kept as a separate field rather than relying on the show/hide toggle
            the way signup does. A typo here locks someone out of the account
            they are in the middle of recovering, with no way to discover it —
            the one screen where the extra keystrokes are worth it. */}
        <div className="fld-box fld-box--gap">
          <input
            type={showPw ? 'text' : 'password'}
            placeholder="Confirm new password"
            aria-label="Confirm new password"
            value={confirmPw}
            onChange={(e) => { setConfirmPw(e.target.value); setError('') }}
            autoComplete="new-password"
            required
            disabled={loading}
            className="fld-box__input"
          />
        </div>

        <p className={`signup-form__hint${password ? ' signup-form__hint--visible' : ''}`}>
          At least {MIN_PASSWORD_LENGTH} characters.
        </p>

        {error && <FormError>{error}</FormError>}

        <button type="submit" disabled={loading} className="signup-form__cta cta">
          {loading ? 'Updating…' : 'Update password'}
        </button>
      </form>
    </>
  )
}

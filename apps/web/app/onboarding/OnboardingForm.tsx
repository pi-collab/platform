'use client'

import { useEffect, useState } from 'react'
import { useFormState, useFormStatus } from 'react-dom'
import { useRouter } from 'next/navigation'
import { submitOnboarding, type OnboardingState, BRAND_CATEGORIES } from './actions'
import FormError from '@/components/FormError'

/** Seconds the celebration holds before it moves on by itself. */
const REDIRECT_SECONDS = 5

function SubmitButton() {
  const { pending } = useFormStatus()
  return (
    <button type="submit" disabled={pending} className="onboard-cta cta">
      {pending ? 'Setting up…' : 'Complete'}
    </button>
  )
}

function Field({
  label,
  optional,
  children,
}: {
  label: string
  optional?: boolean
  children: React.ReactNode
}) {
  return (
    <div className="onboard-field">
      <label className="onboard-label">
        {label}
        {optional && <span className="onboard-label__optional">(optional)</span>}
      </label>
      {children}
    </div>
  )
}

export default function OnboardingForm() {
  const router = useRouter()
  const [state, action] = useFormState<OnboardingState, FormData>(submitOnboarding, null)
  const [countdown, setCountdown] = useState(REDIRECT_SECONDS)

  const done = state?.status === 'ok'

  // The action returns success rather than redirecting, so the celebration in
  // the design has a moment to exist. It is a courtesy, never a gate: the
  // countdown moves on by itself and the button below skips it.
  useEffect(() => {
    if (!done) return
    if (countdown <= 0) {
      router.push('/deals')
      router.refresh()
      return
    }
    const t = setTimeout(() => setCountdown((n) => n - 1), 1000)
    return () => clearTimeout(t)
  }, [done, countdown, router])

  return (
    <>
      <form action={action} className="onboard-form">
        {state?.status === 'error' && <FormError>{state.error}</FormError>}

        <Field label="Company name">
          <div className="fld-box onboard-box">
            <input name="name" required className="onboard-input" placeholder="Acme Studio" />
          </div>
        </Field>

        <Field label="Website">
          <div className="fld-box onboard-box">
            <input name="website" className="onboard-input" placeholder="acmestudio.com" />
          </div>
        </Field>

        <Field label="Industry">
          <select name="category" required defaultValue="" className="fld-box onboard-select">
            <option value="" disabled>Select…</option>
            {BRAND_CATEGORIES.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </Field>

        <Field label="Instagram handle" optional>
          <div className="fld-box onboard-box">
            <span className="onboard-prefix">@</span>
            <input name="instagram" className="onboard-input" placeholder="acmestudio" />
          </div>
        </Field>

        {/* Not in the design, kept deliberately: acceptance is recorded against
            a terms VERSION in the users table, which an implicit "by continuing"
            line cannot evidence. */}
        <label className="onboard-terms">
          <input type="checkbox" name="terms_accepted" value="yes" required />
          <span>
            I agree to the{' '}
            <a href="/terms" target="_blank" rel="noopener noreferrer">Terms of Service</a>
            {' '}and{' '}
            <a href="/privacy" target="_blank" rel="noopener noreferrer">Privacy Policy</a>
          </span>
        </label>

        <SubmitButton />
        <p className="onboard-foot">This helps us set up your account.</p>
      </form>

      {done && (
        <div className="onboard-celebrate" role="dialog" aria-live="polite">
          <div className="onboard-celebrate__card">
            <div className="onboard-celebrate__badge">
              <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#181C24"
                   strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
                <path d="M20 6 9 17l-5-5" />
              </svg>
            </div>
            <h2 className="onboard-celebrate__title">You&rsquo;re all set.</h2>
            <p className="onboard-celebrate__sub">
              Redirecting to your dashboard in {countdown}&hellip;
            </p>
            <button
              type="button"
              onClick={() => { router.push('/deals'); router.refresh() }}
              className="onboard-celebrate__cta cta"
            >
              Go to dashboard now
            </button>
          </div>
        </div>
      )}
    </>
  )
}

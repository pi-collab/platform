'use client'

import { useEffect, useState } from 'react'
import { resendConfirmation } from '@/app/login/actions'

/** Seconds before the button re-arms. Client-side courtesy only — the real
 *  limit is enforced by the mail provider, which this simply keeps us from
 *  hammering into. */
const COOLDOWN_SECONDS = 60

/**
 * "Didn't get the email? Resend it."
 *
 * Shared by the signup confirmation screen and the login page, because both
 * are places a user lands holding an account they cannot get into. Kept as one
 * component so the wording and the cooldown can't drift apart.
 *
 * `email` comes from whichever form is hosting this. When it's empty the button
 * stays disabled rather than firing a request that can only fail.
 */
export default function ResendConfirmation({ email }: { email: string }) {
  const [sending, setSending] = useState(false)
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null)
  const [cooldown, setCooldown] = useState(0)

  useEffect(() => {
    if (cooldown <= 0) return
    const timer = setTimeout(() => setCooldown((n) => n - 1), 1000)
    return () => clearTimeout(timer)
  }, [cooldown])

  async function handleResend() {
    setSending(true)
    setResult(null)
    const res = await resendConfirmation(email)
    setSending(false)
    setResult({ ok: res.status === 'sent', message: res.message })
    // Only start the cooldown on a send that actually went out. A failed
    // attempt shouldn't lock them out of retrying.
    if (res.status === 'sent') setCooldown(COOLDOWN_SECONDS)
  }

  const disabled = sending || cooldown > 0 || !email.trim()

  return (
    <div className="resend">
      <span className="resend__prompt">Didn&rsquo;t get the email?</span>{' '}
      <button
        type="button"
        onClick={handleResend}
        disabled={disabled}
        className="resend__button"
      >
        {sending ? 'Sending…' : cooldown > 0 ? `Resend in ${cooldown}s` : 'Resend it'}
      </button>
      {result && (
        <p
          className={`resend__result${result.ok ? '' : ' resend__result--error'}`}
          role="status"
        >
          {result.message}
        </p>
      )}
    </div>
  )
}

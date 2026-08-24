'use client'

import { useEffect, useRef } from 'react'

const LENGTH = 6

/**
 * Six-cell one-time-code entry, per the creator signup/login designs.
 *
 * Six separate inputs rather than one input styled to look like six: it gives
 * the caret a real position, so backspace and arrow keys behave the way people
 * expect, and it is what password managers and iOS SMS autofill target.
 *
 * Paste is handled explicitly. Codes arrive by SMS and get pasted whole, and
 * without this a paste would drop five of the six digits into one box.
 */
export default function OtpInput({
  value,
  onChange,
  onComplete,
  error = false,
  disabled = false,
  autoFocus = false,
}: {
  value: string
  onChange: (next: string) => void
  /** Fired when the sixth digit lands, so the caller can submit without a click. */
  onComplete?: (code: string) => void
  error?: boolean
  disabled?: boolean
  autoFocus?: boolean
}) {
  const refs = useRef<Array<HTMLInputElement | null>>([])

  // Android: read the code straight from the SMS.
  //
  // iOS needs nothing here — autocomplete="one-time-code" plus the spreading in
  // handleChange is the whole mechanism, and Safari matches the message by
  // heuristic. Android has no such heuristic: WebOTP only fires when the SMS
  // ENDS with a line of the form "@<host> #<code>".
  //
  // Our SMS cannot say that yet. The DLT-approved template is fixed
  // character-for-character — "{#num#} is your Guapd verification code. Do not
  // share it with anyone." — and changing it means a new DLT approval. So this
  // sits dormant until that lands, and works the day it does without a deploy.
  useEffect(() => {
    if (typeof window === 'undefined') return
    if (!('OTPCredential' in window)) return

    const ac = new AbortController()
    navigator.credentials
      .get({ otp: { transport: ['sms'] }, signal: ac.signal } as CredentialRequestOptions)
      .then((cred) => {
        const code = (cred as { code?: string } | null)?.code
        if (!code) return
        const digits = code.replace(/\D/g, '').slice(0, LENGTH)
        if (!digits) return
        onChange(digits)
        if (digits.length === LENGTH) onComplete?.(digits)
      })
      // Aborted on unmount, declined by the user, or simply never delivered.
      // None of those is a problem worth surfacing — the code can be typed.
      .catch(() => {})

    return () => ac.abort()
    // Deliberately once per mount: re-requesting on every keystroke would
    // cancel the outstanding request and re-prompt.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function set(next: string) {
    const clean = next.replace(/\D/g, '').slice(0, LENGTH)
    onChange(clean)
    if (clean.length === LENGTH) onComplete?.(clean)
    return clean
  }

  function handleChange(i: number, raw: string) {
    const digits = raw.replace(/\D/g, '')

    // iOS drops the entire SMS code into whichever box is focused — usually the
    // first — in one event. Taking only the last character of that turns
    // "123456" into "6", which is why tapping the keyboard's code suggestion
    // appeared to do nothing useful. More than one digit means an autofill or a
    // paste, so it fills the whole row.
    if (digits.length > 1) {
      const filled = set(digits)
      refs.current[Math.min(filled.length, LENGTH - 1)]?.focus()
      return filled
    }

    const digit = digits.slice(-1)
    if (!digit) return
    const chars = value.padEnd(LENGTH, ' ').split('')
    chars[i] = digit
    const next = set(chars.join('').trimEnd())
    // Advance past the cell just filled, stopping at the last.
    refs.current[Math.min(i + 1, LENGTH - 1)]?.focus()
    return next
  }

  function handleKeyDown(i: number, e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Backspace') {
      e.preventDefault()
      const chars = value.padEnd(LENGTH, ' ').split('')
      // Empty cell: clear the one before it and step back, which is what
      // holding backspace through a wrong code should do.
      if (!chars[i]?.trim() && i > 0) {
        chars[i - 1] = ' '
        refs.current[i - 1]?.focus()
      } else {
        chars[i] = ' '
      }
      set(chars.join('').trimEnd())
      return
    }
    if (e.key === 'ArrowLeft' && i > 0) refs.current[i - 1]?.focus()
    if (e.key === 'ArrowRight' && i < LENGTH - 1) refs.current[i + 1]?.focus()
  }

  function handlePaste(e: React.ClipboardEvent) {
    e.preventDefault()
    const digits = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, LENGTH)
    if (!digits) return
    set(digits)
    refs.current[Math.min(digits.length, LENGTH - 1)]?.focus()
  }

  return (
    <div className="otp" onPaste={handlePaste}>
      {Array.from({ length: LENGTH }, (_, i) => {
        const char = value[i] ?? ''
        const active = !error && i === Math.min(value.length, LENGTH - 1)
        return (
          <input
            key={i}
            ref={(el) => { refs.current[i] = el }}
            className={`otp__cell${active ? ' otp__cell--active' : ''}${error ? ' otp__cell--error' : ''}`}
            value={char}
            onChange={(e) => handleChange(i, e.target.value)}
            onKeyDown={(e) => handleKeyDown(i, e)}
            onFocus={(e) => e.target.select()}
            inputMode="numeric"
            // Only the first cell claims the SMS code, or the browser offers
            // to autofill the whole code into every box.
            // First box only. Declared on all six, some browsers put the whole
            // code in each one and others refuse to fill at all; the spreading
            // in handleChange takes it from there.
            autoComplete={i === 0 ? 'one-time-code' : 'off'}
            maxLength={1}
            disabled={disabled}
            autoFocus={autoFocus && i === 0}
            aria-label={`Digit ${i + 1} of ${LENGTH}`}
          />
        )
      })}
    </div>
  )
}

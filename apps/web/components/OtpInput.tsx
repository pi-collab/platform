'use client'

import { useRef } from 'react'

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

  function set(next: string) {
    const clean = next.replace(/\D/g, '').slice(0, LENGTH)
    onChange(clean)
    if (clean.length === LENGTH) onComplete?.(clean)
    return clean
  }

  function handleChange(i: number, raw: string) {
    const digit = raw.replace(/\D/g, '').slice(-1)
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

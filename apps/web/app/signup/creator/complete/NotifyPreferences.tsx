'use client'

import { useState } from 'react'
import FormError from '@/components/FormError'
import { isValidIndianMobile } from '@/lib/phone'
import { saveNotifyPreferences } from './actions'

/**
 * "How should we notify you?" on the under-review screen.
 *
 * This is the only moment we can reasonably ask. A creator who signed up by
 * phone has given us no email and one who used Google has given us no phone,
 * so approval mail is unsendable for roughly half of them — and they are about
 * to spend 24 to 48 hours waiting for exactly that message.
 *
 * Whichever channel they already gave is pre-ticked and locked; the other is
 * asked for. The signup phone is NOT assumed to be their WhatsApp number,
 * since WhatsApp is often on a different one, so that field starts empty with
 * a one-tap way to reuse it.
 */
export default function NotifyPreferences({
  knownEmail,
  signupPhone,
}: {
  knownEmail: string | null
  /** Ten digits, no country code. Null for Google signups. */
  signupPhone: string | null
}) {
  const hasEmail = Boolean(knownEmail)

  const [emailOn, setEmailOn] = useState(true)
  const [email, setEmail] = useState('')
  const [waOn, setWaOn] = useState(true)
  const [wa, setWa] = useState('')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  function touch() { setError(''); setSaved(false) }

  const needsEmail = emailOn && !hasEmail
  const needsWa = waOn && !signupPhone
  // Something to save only if they can actually add something we don't have.
  const dirty = (needsEmail && email.trim().length > 0) || (waOn && wa.trim().length > 0)
    || !emailOn || !waOn

  async function handleSave() {
    if (saving) return
    setError('')

    if (needsEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.trim())) {
      setError('Enter a valid email address.')
      return
    }
    if (waOn && wa.trim() && !isValidIndianMobile(wa)) {
      setError('Enter a valid 10-digit Indian mobile number, starting 6, 7, 8 or 9.')
      return
    }

    setSaving(true)
    const res = await saveNotifyPreferences({
      notifyEmail: emailOn,
      notifyWhatsapp: waOn,
      email: needsEmail ? email.trim() : undefined,
      whatsappPhone: wa.trim() || undefined,
    })
    setSaving(false)

    if (res.status === 'error') {
      setError(res.message)
      return
    }
    setSaved(true)
  }

  return (
    <div className="notifybox">
      <div className="notifybox__head">How should we notify you?</div>

      <label className="notifybox__row">
        <input
          type="checkbox"
          checked={emailOn}
          onChange={(e) => { setEmailOn(e.target.checked); touch() }}
          // Locked when we already hold the address: unticking would opt them
          // out of the only channel we can reach them on.
          disabled={hasEmail}
        />
        <span className="notifybox__label">Email</span>
        {hasEmail && <span className="notifybox__value">{knownEmail}</span>}
      </label>

      {needsEmail && (
        <div className="notifybox__field">
          <div className="notifybox__input">
            <input
              type="email"
              placeholder="Add your email"
              aria-label="Email address"
              value={email}
              onChange={(e) => { setEmail(e.target.value); touch() }}
            />
          </div>
        </div>
      )}

      <div className="notifybox__divider" />

      <label className="notifybox__row">
        <input
          type="checkbox"
          checked={waOn}
          onChange={(e) => { setWaOn(e.target.checked); touch() }}
        />
        <span className="notifybox__label">WhatsApp</span>
      </label>

      {waOn && (
        <div className="notifybox__field">
          <div className="notifybox__input">
            <span className="notifybox__prefix">+91</span>
            <span className="notifybox__rule" />
            <input
              type="tel"
              inputMode="numeric"
              placeholder="Add your number"
              aria-label="WhatsApp number"
              value={wa}
              onChange={(e) => { setWa(e.target.value.replace(/\D/g, '').slice(0, 10)); touch() }}
            />
          </div>
          {signupPhone && (
            <button
              type="button"
              onClick={() => { setWa(signupPhone); touch() }}
              className="notifybox__same lnk"
            >
              Same as the number I signed up with
            </button>
          )}
        </div>
      )}

      {error && <div className="notifybox__field"><FormError>{error}</FormError></div>}

      {(dirty || saved) && (
        <div className="notifybox__save">
          <button type="button" onClick={handleSave} disabled={saving || saved} className="notifybox__cta cta">
            {saving ? 'Saving…' : saved ? 'Preferences saved' : 'Save preferences'}
          </button>
        </div>
      )}
    </div>
  )
}

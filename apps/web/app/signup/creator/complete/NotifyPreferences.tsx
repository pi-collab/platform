'use client'

import { useState } from 'react'
import FormError from '@/components/FormError'
import { DIAL_CODES, normalizeE164 } from '@/lib/phone'
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
  // Defaults to India because that is the roster, but a creator whose LOGIN
  // number is Indian may read WhatsApp on a foreign one — which is the whole
  // reason this is selectable rather than the design's fixed +91.
  const [dial, setDial] = useState('+91')
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
    if (waOn && wa.trim() && !normalizeE164(dial, wa)) {
      setError('Enter a valid WhatsApp number for the country code selected.')
      return
    }

    setSaving(true)
    const res = await saveNotifyPreferences({
      notifyEmail: emailOn,
      notifyWhatsapp: waOn,
      email: needsEmail ? email.trim() : undefined,
      whatsappDialCode: dial,
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
            <select
              value={dial}
              onChange={(e) => { setDial(e.target.value); touch() }}
              aria-label="Country code"
              className="notifybox__dial"
            >
              {DIAL_CODES.map((d) => (
                <option key={d.code} value={d.code}>{d.code}</option>
              ))}
            </select>
            <span className="notifybox__rule" />
            <input
              type="tel"
              inputMode="numeric"
              placeholder="Add your number"
              aria-label="WhatsApp number"
              value={wa}
              // 14 digits: E.164 allows 15 including the country code, so this
              // cannot clamp away a digit any supported country still needs.
              onChange={(e) => { setWa(e.target.value.replace(/\D/g, '').slice(0, 14)); touch() }}
            />
          </div>
          {signupPhone && (
            <button
              type="button"
              onClick={() => { setDial('+91'); setWa(signupPhone); touch() }}
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

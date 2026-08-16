'use client'

import { useState } from 'react'
import FormError from '@/components/FormError'
import { DIAL_CODES, normalizeE164, splitE164 } from '@/lib/phone'
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
  saved: savedPrefs,
}: {
  knownEmail: string | null
  /** Ten digits, no country code. Null for Google signups. */
  signupPhone: string | null
  /** What this creator already chose, if anything. */
  saved: { notifyEmail: boolean; notifyWhatsapp: boolean; whatsappPhone: string | null }
}) {
  const hasEmail = Boolean(knownEmail)
  const savedWa = splitE164(savedPrefs.whatsappPhone)

  // Once they have answered, this stops being a question. A form with empty
  // checkboxes and a Save button reads as still unanswered, which is exactly
  // wrong on a screen whose job is to reassure them we know how to reach them.
  const alreadyAnswered =
    savedPrefs.notifyEmail || savedPrefs.notifyWhatsapp || Boolean(savedPrefs.whatsappPhone)

  // Nothing pre-selected — a pre-ticked box records a choice the creator never
  // made. A previously SAVED choice is different: that one they did make, so
  // it is reflected rather than reset.
  const [emailOn, setEmailOn] = useState(savedPrefs.notifyEmail)
  const [email, setEmail] = useState('')
  const [waOn, setWaOn] = useState(savedPrefs.notifyWhatsapp)
  const [wa, setWa] = useState(savedWa.national)
  // Defaults to India because that is the roster, but a creator whose LOGIN
  // number is Indian may read WhatsApp on a foreign one — which is the whole
  // reason this is selectable rather than the design's fixed +91.
  const [dial, setDial] = useState(savedWa.dial)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  const [touched, setTouched] = useState(false)

  function touch() { setError(''); setSaved(false); setTouched(true) }

  const needsEmail = emailOn && !hasEmail
  // Save appears once they have actually chosen something, rather than
  // sitting there from the start inviting a click that saves nothing.
  const dirty = touched

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

  // ── Answered ─────────────────────────────────────────────────────────────
  // A single confirmation rather than a read-back of the channels. The export
  // makes this the moment the screen changes state: the panel is replaced and
  // "what happens next" appears behind it. Repeating the addresses here would
  // re-open a decision they have just closed.
  if (alreadyAnswered || saved) {
    return (
      <div className="savedmark">
        <span className="savedmark__tick" aria-hidden="true">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#fff"
               strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
            <path d="M20 6 9 17l-5-5" />
          </svg>
        </span>
        <div>
          <div className="savedmark__title">Notification preferences saved</div>
          <div className="savedmark__body">We&rsquo;ll reach out as soon as you&rsquo;re approved.</div>
        </div>
      </div>
    )
  }

  return (
    <div className="notifybox">
      <div className="notifybox__head">How should we notify you?</div>

      <label className="notifybox__row">
        <input
          type="checkbox"
          checked={emailOn}
          onChange={(e) => { setEmailOn(e.target.checked); touch() }}
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
            {/* A real <select> carrying the interaction and accessibility,
                sitting invisibly over a styled display. A native select forces
                the closed state and the option list to share one string: full
                country names overflow this narrow field, and bare ISO codes
                are unreadable in the list. This way the field shows "IN +91"
                and the list reads "India +91". */}
            <span className="notifybox__dial">
              <span className="notifybox__dial-text" aria-hidden="true">
                {DIAL_CODES.find((d) => d.code === dial)?.iso ?? ''} {dial}
              </span>
              <svg className="notifybox__dial-caret" aria-hidden="true" width="12" height="12"
                   viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4"
                   strokeLinecap="round" strokeLinejoin="round">
                <path d="m6 9 6 6 6-6" />
              </svg>
              <select
                value={dial}
                onChange={(e) => { setDial(e.target.value); touch() }}
                aria-label="Country code"
                className="notifybox__dial-native"
              >
                {DIAL_CODES.map((d) => (
                  <option key={d.iso} value={d.code}>{d.label} {d.code}</option>
                ))}
              </select>
            </span>
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

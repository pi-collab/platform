'use client'

import { useState } from 'react'
import FormError from '@/components/FormError'
import { sendAppeal } from '@/app/creator/appeal-actions'

/**
 * Shown to a creator whose profile was not approved. Design "Creator Signup
 * Denied - Paged Flow".
 *
 * The appeal box is the point of the screen. Vetting is a judgement on thin
 * evidence, and the people most likely to be turned down early are the ones
 * whose profile was simply too sparse to assess — so the screen has to leave a
 * route back rather than just delivering the verdict.
 */
export default function CreatorRejected({ alreadyAppealed }: { alreadyAppealed: boolean }) {
  const [note, setNote] = useState('')
  const [sent, setSent] = useState(alreadyAppealed)
  const [error, setError] = useState('')
  const [sending, setSending] = useState(false)

  async function handleSend() {
    if (sending) return
    setError('')
    setSending(true)
    const res = await sendAppeal(note)
    setSending(false)

    if (res.status === 'error') {
      setError(res.message)
      return
    }
    setSent(true)
  }

  return (
    <main className="onboard-shell onboard-shell--denied">
      <div className="onboard-shell__dark" />
      <div className="onboard-shell__rule" />

      <div className="onboard-nav-wrap">
        <nav className="onboard-nav onboard-nav--bare">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/guapd-logo-dark.svg" alt="guapd" className="onboard-nav__logo" />
        </nav>
      </div>

      <div className="review-head">
        <div className="denied-badge">
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor"
               strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="9" /><path d="M12 8v5M12 16h.01" />
          </svg>
        </div>
        <h1 className="denied-title">Not approved this time.</h1>
      </div>

      <div className="onboard-body denied-body">
        <div className="onboard-card denied-card">
          <p className="denied-lede">
            Your profile didn&rsquo;t meet our current criteria for approval. This isn&rsquo;t
            permanent, and a lot of creators get in on a second try.
          </p>

          {/* The design says "we'll email you the moment you're eligible
              again", which implies a 30-day timer nothing runs. What is true:
              ops can approve a rejected creator at any point, and vetCreator
              emails them when it happens. The copy promises that instead. */}
          <div className="denied-note">
            <div className="denied-note__title">You can reapply in 30 days</div>
            <div className="denied-note__body">
              If we approve you after that, we&rsquo;ll email you as soon as it happens.
            </div>
          </div>

          <div className="denied-appeal">
            <div className="denied-note__title">Think this was a mistake?</div>
            <div className="denied-note__body">Send us a note and we&rsquo;ll take another look.</div>

            {sent ? (
              <p className="denied-sent">
                Appeal sent. We&rsquo;ll be in touch within 3&ndash;5 days.
              </p>
            ) : (
              <>
                <textarea
                  className="fld-box denied-textarea"
                  placeholder="Tell us why you think this was wrong…"
                  aria-label="Your appeal"
                  value={note}
                  onChange={(e) => { setNote(e.target.value); setError('') }}
                  maxLength={2000}
                  rows={4}
                />
                {error && <FormError>{error}</FormError>}
                <button
                  type="button"
                  onClick={handleSend}
                  disabled={sending || !note.trim()}
                  className="denied-send ghost"
                >
                  {sending ? 'Sending…' : 'Send appeal'}
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </main>
  )
}

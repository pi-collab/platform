'use client'

import { useEffect, useRef, useState } from 'react'
import { requestDemo } from '@/app/brands/demo-actions'

/**
 * "Book demo" form for the brands page.
 *
 * Styled from the page's own design system rather than the app's form styles:
 * the card, hairline border, inset field shadow and neon primary button are the
 * same treatments the export uses for the deal builder, so the dialog reads as
 * part of the page rather than as the product UI bolted on.
 *
 * Field set is deliberately short. Every extra field on a demo form costs
 * completions, so this asks only what is needed to reply and to prepare for the
 * call: who, where to reach them, which brand, and roughly how much they run.
 * Phone and message are optional, and the volume select is there because it is
 * the one answer that changes how the call is run.
 */
export default function BookDemoModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState(false)
  const firstField = useRef<HTMLInputElement>(null)
  const dialog = useRef<HTMLDivElement>(null)

  // onClose is held in a ref, and the effect below depends on `open` alone.
  //
  // Calling a server action re-renders the tree, so the parent hands down a NEW
  // onClose identity. With onClose in the dependency array, the reset effect
  // re-ran on submit and set `done` back to false — the request was stored every
  // time but the confirmation never appeared.
  const closeRef = useRef(onClose)
  useEffect(() => { closeRef.current = onClose }, [onClose])

  useEffect(() => {
    if (!open) return
    setError(''); setDone(false)
    // Focus the first field, and close on Escape — a dialog that traps someone
    // with no way out is worse than no dialog.
    const t = setTimeout(() => firstField.current?.focus(), 60)
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') closeRef.current() }
    document.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { clearTimeout(t); document.removeEventListener('keydown', onKey); document.body.style.overflow = prev }
  }, [open])

  if (!open) return null

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (busy) return
    setBusy(true); setError('')
    const f = new FormData(e.currentTarget)
    const res = await requestDemo({
      name: String(f.get('name') || ''),
      email: String(f.get('email') || ''),
      brand: String(f.get('brand') || ''),
      phone: String(f.get('phone') || ''),
      volume: String(f.get('volume') || ''),
      message: String(f.get('message') || ''),
    })
    setBusy(false)
    if (res.status === 'error') { setError(res.message); return }
    setDone(true)
  }

  return (
    <div
      className="brands-page bd-overlay"
      role="dialog"
      aria-modal="true"
      aria-label="Book a demo"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="bd-card" ref={dialog}>
        <button type="button" className="bd-close" onClick={onClose} aria-label="Close">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
               strokeWidth="2" strokeLinecap="round"><path d="M18 6 6 18M6 6l12 12" /></svg>
        </button>

        {done ? (
          <div className="bd-done">
            <div className="bd-tick" aria-hidden="true">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                   strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="m20 6-11 11-5-5" /></svg>
            </div>
            <h2 className="bd-title">Request received.</h2>
            <p className="bd-sub">We&rsquo;ll be in touch within one working day to set up a time.</p>
            <button type="button" className="bp-btn bd-submit" onClick={onClose}>Done</button>
          </div>
        ) : (
          <>
            <span className="bd-eyebrow">Book a demo</span>
            <h2 className="bd-title">
              See guapd on your <span className="bd-accent">own campaigns.</span>
            </h2>
            <p className="bd-sub">
              Tell us a little about your brand and we&rsquo;ll walk you through it. Usually 20 minutes.
            </p>

            <form onSubmit={onSubmit} className="bd-form">
              <label className="bd-label">
                Your name
                <input ref={firstField} name="name" required autoComplete="name" className="bd-field" placeholder="Priya Sharma" />
              </label>

              <label className="bd-label">
                Work email
                <input name="email" type="email" required autoComplete="email" className="bd-field" placeholder="priya@brand.com" />
              </label>

              <label className="bd-label">
                Brand
                <input name="brand" required autoComplete="organization" className="bd-field" placeholder="Acme Cosmetics" />
              </label>

              <div className="bd-row">
                <label className="bd-label">
                  Phone <span className="bd-optional">optional</span>
                  <input name="phone" type="tel" autoComplete="tel" className="bd-field" placeholder="+91 98765 43210" />
                </label>

                <label className="bd-label">
                  Creator deals a month <span className="bd-optional">optional</span>
                  <select name="volume" className="bd-field bd-select" defaultValue="">
                    <option value="">Select</option>
                    <option>Just starting out</option>
                    <option>1–5</option>
                    <option>6–20</option>
                    <option>20+</option>
                  </select>
                </label>
              </div>

              <label className="bd-label">
                Anything specific you want to see? <span className="bd-optional">optional</span>
                <textarea name="message" rows={3} className="bd-field bd-textarea" placeholder="We run a lot of Reels and payouts are the painful bit." />
              </label>

              {error && <p className="bd-error">{error}</p>}

              <button type="submit" disabled={busy} className="bp-btn bd-submit">
                {busy ? 'Sending…' : 'Request demo'}
              </button>

              <p className="bd-fine">
                We&rsquo;ll only use this to contact you about a demo. No newsletters.
              </p>
            </form>
          </>
        )}
      </div>
    </div>
  )
}

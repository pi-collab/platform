'use client'

import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { submitContact } from '@/app/contact/actions'
// The dialog's .bd-* rules live in brands-page.css. Imported here rather than
// from each page, so every page that renders <Footer> gets them — the footer is
// on /privacy and /terms too, which never load the brands stylesheet. Every
// rule in it is scoped to .brands-page, which only this overlay sets, so
// nothing else on those pages is restyled.
import '@/app/brands-page.css'

/**
 * Contact form, opened from the footer.
 *
 * Deliberately the same dialog as BookDemoModal — same card, hairline border,
 * inset fields and neon primary — because they are the two ways to reach us and
 * a second visual language for the same job reads as a different product.
 *
 * It reuses the .bd-* classes from brands-page.css rather than copying them,
 * and sets .brands-page on the overlay so those scoped rules apply wherever the
 * footer renders. Any page rendering this must import brands-page.css.
 *
 * Field set is short on purpose: name, email, an optional subject, and the
 * message. Anything more is a form people abandon.
 */
/**
 * Rendered into document.body rather than in place.
 *
 * MarketingNav's wrapper is position:sticky with a z-index, which makes it a
 * stacking context — a dialog rendered inside it is trapped beneath that
 * context no matter how high its own z-index goes, and the cookie bar (fixed,
 * z-index 9999, at the bottom of the viewport where this opens) painted over
 * it and swallowed taps. A portal takes the dialog out of the nav's context
 * entirely, which is where a modal belongs anyway.
 */
export default function ContactModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState(false)
  const firstField = useRef<HTMLInputElement>(null)

  // onClose is held in a ref and the effect depends on `open` alone. Calling a
  // server action re-renders the tree, so the parent hands down a NEW onClose
  // identity; with it in the dependency array the reset effect re-ran on submit
  // and set `done` back to false, which is exactly the bug the demo dialog hit.
  const closeRef = useRef(onClose)
  useEffect(() => { closeRef.current = onClose }, [onClose])

  useEffect(() => {
    if (!open) return
    setError(''); setDone(false)
    const t = setTimeout(() => firstField.current?.focus(), 60)
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') closeRef.current() }
    document.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { clearTimeout(t); document.removeEventListener('keydown', onKey); document.body.style.overflow = prev }
  }, [open])

  if (!open || !mounted) return null

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (busy) return
    setBusy(true); setError('')
    const f = new FormData(e.currentTarget)
    const res = await submitContact({
      name: String(f.get('name') || ''),
      email: String(f.get('email') || ''),
      subject: String(f.get('subject') || ''),
      message: String(f.get('message') || ''),
    })
    setBusy(false)
    if (res.status === 'error') { setError(res.message); return }
    setDone(true)
  }

  return createPortal(
    <div
      className="brands-page bd-overlay"
      role="dialog"
      aria-modal="true"
      aria-label="Contact us"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="bd-card">
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
            <h2 className="bd-title">Message sent.</h2>
            <p className="bd-sub">We&rsquo;ll read it and reply within one working day.</p>
            <button type="button" className="bp-btn bd-submit" onClick={onClose}>Done</button>
          </div>
        ) : (
          <>
            <span className="bd-eyebrow">Contact us</span>
            <h2 className="bd-title">
              Ask us <span className="bd-accent">anything.</span>
            </h2>
            <p className="bd-sub">
              Questions about how guapd works, pricing, or your account. We read every message.
            </p>

            <form onSubmit={onSubmit} className="bd-form">
              <label className="bd-label">
                Your name
                <input ref={firstField} name="name" required autoComplete="name" className="bd-field" placeholder="Priya Sharma" />
              </label>

              <label className="bd-label">
                Email
                <input name="email" type="email" required autoComplete="email" className="bd-field" placeholder="priya@brand.com" />
              </label>

              <label className="bd-label">
                Subject <span className="bd-optional">optional</span>
                <input name="subject" className="bd-field" placeholder="Question about payment terms" />
              </label>

              <label className="bd-label">
                How can we help?
                <textarea name="message" required rows={4} className="bd-field bd-textarea" placeholder="Tell us what you need." />
              </label>

              {error && <p className="bd-error">{error}</p>}

              <button type="submit" disabled={busy} className="bp-btn bd-submit">
                {busy ? 'Sending…' : 'Send message'}
              </button>

              <p className="bd-fine">
                We&rsquo;ll only use this to reply to you. No newsletters.
              </p>
            </form>
          </>
        )}
      </div>
    </div>
    ,
    document.body,
  )
}

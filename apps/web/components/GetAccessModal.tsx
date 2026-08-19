'use client'

import Link from 'next/link'
import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

/**
 * "Which side are you?" — the phone stand-in for the landing header's dropdown.
 *
 * The desktop header answers this with a hover menu. A hover menu is not a
 * thing on a phone, and the drawer already carries the same two choices, so on
 * mobile the header CTA opens this instead: two large targets, one tap each.
 *
 * Deliberately not a form. There is nothing to submit — it is a fork in the
 * road, so both options are plain links and the browser handles the rest.
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
export default function GetAccessModal({
  open,
  onClose,
}: {
  open: boolean
  onClose: () => void
}) {
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])
  const closeRef = useRef(onClose)
  closeRef.current = onClose
  const card = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    // Escape closes. A dialog with no keyboard exit strands anyone not using a
    // pointer, and the backdrop tap is a pointer-only affordance.
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') closeRef.current() }
    document.addEventListener('keydown', onKey)
    // Move focus into the dialog so the next Tab lands inside it rather than
    // behind it, on the page the dialog is covering.
    card.current?.querySelector<HTMLElement>('a')?.focus()
    return () => document.removeEventListener('keydown', onKey)
  }, [open])

  if (!open || !mounted) return null

  return createPortal(
    <div
      className="ga-overlay"
      role="dialog"
      aria-modal="true"
      aria-label="Get access"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="ga-card" ref={card}>
        <button type="button" className="ga-close" onClick={onClose} aria-label="Close">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
               strokeWidth="2" strokeLinecap="round"><path d="M18 6 6 18M6 6l12 12" /></svg>
        </button>

        <p className="ga-eyebrow">Sign up as a</p>
        <h2 className="ga-title">Get <span className="ga-italic">guapd.</span></h2>

        <div className="ga-options">
          <Link href="/signup/creator" className="ga-option" onClick={onClose}>
            <span className="ga-option-icon" aria-hidden="true">
              <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                   strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
                <path d="m22 8-6 4 6 4V8Z" />
                <rect width="14" height="12" x="2" y="6" rx="2" />
              </svg>
            </span>
            <span className="ga-option-text">
              <span className="ga-option-label">I&rsquo;m a creator</span>
              <span className="ga-option-sub">Get paid on time, in one place</span>
            </span>
          </Link>

          <Link href="/signup/brand" className="ga-option" onClick={onClose}>
            <span className="ga-option-icon" aria-hidden="true">
              <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                   strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 21h18M5 21V7l7-4 7 4v14" />
                <path d="M10 21v-5h4v5" />
              </svg>
            </span>
            <span className="ga-option-text">
              <span className="ga-option-label">I&rsquo;m a brand</span>
              <span className="ga-option-sub">Run every deal from one dashboard</span>
            </span>
          </Link>
        </div>

        <p className="ga-foot">
          Already have an account? <Link href="/login/creator" onClick={onClose}>Log in</Link>
        </p>
      </div>
    </div>
    ,
    document.body,
  )
}

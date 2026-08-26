'use client'

import { useState } from 'react'
import ContactModal from '@/components/ContactModal'

/**
 * The footer's Contact entry: a dialog trigger rather than a mailto.
 *
 * It is its own client component because <Footer> is a server component and
 * only this one control needs state — the same split CookiePrefsLink uses. A
 * mailto would work, but it loses the message when someone has no mail client
 * configured, and it records nothing our side; the form writes an events row
 * before it emails, so a query survives Resend being down.
 */
export default function ContactLink({ className, label = 'Contact', children }: {
  className?: string
  label?: string
  /**
   * Replaces the label entirely, for menu rows that need an icon beside the
   * text. Optional, so existing callers are untouched. The point is that a
   * caller wanting different CONTENT does not reimplement the dialog wiring and
   * quietly lose the events row the form writes before it emails.
   */
  children?: React.ReactNode
}) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button type="button" className={className} onClick={() => setOpen(true)}>
        {children ?? label}
      </button>
      <ContactModal open={open} onClose={() => setOpen(false)} />
    </>
  )
}

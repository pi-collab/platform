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
export default function ContactLink({ className, style, label = 'Contact', children }: {
  className?: string
  /**
   * Inline styles for the trigger. The creator profile menu styles its rows
   * with a shared inline object rather than a class, and without this a caller
   * has to wrap the button in a styled div — which is how the phone's Help row
   * ended up with a non-interactive wrapper around an interactive control.
   */
  style?: React.CSSProperties
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
      <button type="button" className={className} style={style} onClick={() => setOpen(true)}>
        {children ?? label}
      </button>
      <ContactModal open={open} onClose={() => setOpen(false)} />
    </>
  )
}

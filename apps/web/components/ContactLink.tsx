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
export default function ContactLink({ className, label = 'Contact' }: { className?: string; label?: string }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button type="button" className={className} onClick={() => setOpen(true)}>
        {label}
      </button>
      <ContactModal open={open} onClose={() => setOpen(false)} />
    </>
  )
}

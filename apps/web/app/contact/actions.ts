'use server'

import { createAdminClient } from '@/lib/supabase/admin'
import { BRAND_NAME } from '@/lib/content'
import { sendDealEmail, isEmailConfigured, isPlausibleEmail } from '@/lib/email'
import { renderNoticeEmail } from '@/lib/email-template'

/** Where queries go. The company address, not the ops alert address. */
const CONTACT_INBOX = process.env.CONTACT_EMAIL || 'contact@guapd.com'
const SITE_HOST = (process.env.NEXT_PUBLIC_SITE_URL || 'https://guapd.com').replace(/^https?:\/\//, '').replace(/\/+$/, '')

export type ContactResult =
  | { status: 'ok' }
  | { status: 'error'; message: string }

export interface ContactInput {
  name: string
  email: string
  subject?: string
  message: string
}

/**
 * Take a query from the Contact form in the footer.
 *
 * Same shape as requestDemo, and for the same reason: the row is written BEFORE
 * the email, so a query survives Resend being down or unconfigured. The email
 * is the notification, not the record.
 *
 * Never throws. A contact form that 500s loses the message outright, and the
 * person who sent it has no way of knowing.
 */
export async function submitContact(input: ContactInput): Promise<ContactResult> {
  const name = (input.name || '').trim()
  const email = (input.email || '').trim().toLowerCase()
  const subject = (input.subject || '').trim()
  const message = (input.message || '').trim()

  if (!name) return { status: 'error', message: 'Please tell us your name.' }
  if (!isPlausibleEmail(email)) return { status: 'error', message: 'Please enter a valid email address.' }
  if (!message) return { status: 'error', message: 'Please tell us how we can help.' }
  // Generous ceilings. These only stop a paste of a whole document.
  if (name.length > 120 || subject.length > 200 || message.length > 4000) {
    return { status: 'error', message: 'That looks too long. Please shorten it a little.' }
  }

  try {
    const admin = createAdminClient()

    await admin.from('events').insert({
      deal_id: null,
      event_type: 'contact.submitted',
      detail: { name, email, subject: subject || null, message, source: 'footer' },
    })

    if (!isEmailConfigured()) {
      console.warn('[contact] email not configured, query stored, no notification sent')
      return { status: 'ok' }
    }

    const rows: [string, string][] = [
      ['Name', name],
      ['Email', email],
      ['Subject', subject || '-'],
    ]

    // 1. Tell the team. Reply-to is the sender so hitting reply just works.
    const internal = renderNoticeEmail({
      heading: subject ? `Contact form: ${subject}` : `Contact form message from ${name}`,
      body: [`${name} sent a message through the contact form. Reply to this email to reach them directly.`, message],
      rows,
      footerNote: `Sent from the contact form on ${SITE_HOST}.`,
    })

    const sent = await sendDealEmail({
      to: [CONTACT_INBOX],
      subject: subject ? `Contact: ${subject}` : `Contact form message from ${name}`,
      html: internal.html,
      text: internal.text,
      replyTo: email,
    })

    if (!sent.ok) {
      // Already stored, so this is a notification failure rather than a lost
      // message. Log loudly; do not fail the submission.
      console.error(`[contact] query stored but team email failed: ${sent.reason}`)
    }

    // 2. Confirm to the sender. Failure here must not surface as an error:
    //    their message IS recorded, and telling them it failed invites a
    //    duplicate.
    const confirm = renderNoticeEmail({
      heading: 'Thanks, we have your message.',
      body: [
        `Hi ${name.split(' ')[0]}, thanks for getting in touch with ${BRAND_NAME}.`,
        'Someone from our team will read this and reply within one working day.',
        'If anything changes in the meantime, just reply to this email.',
      ],
      footerNote: `You're receiving this because you used the contact form on ${SITE_HOST}.`,
    })

    const ack = await sendDealEmail({
      to: [email],
      subject: `We received your message`,
      html: confirm.html,
      text: confirm.text,
      replyTo: CONTACT_INBOX,
    })

    if (!ack.ok) console.error(`[contact] confirmation to sender failed: ${ack.reason}`)

    return { status: 'ok' }
  } catch (err) {
    console.error(`[contact] submission failed: ${err instanceof Error ? err.message : String(err)}`)
    return { status: 'error', message: 'Something went wrong. Please try again, or email contact@guapd.com.' }
  }
}

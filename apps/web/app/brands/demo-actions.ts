'use server'

import { createAdminClient } from '@/lib/supabase/admin'
import { BRAND_NAME } from '@/lib/content'
import { sendDealEmail, isEmailConfigured, isPlausibleEmail } from '@/lib/email'
import { renderNoticeEmail } from '@/lib/email-template'

/** Where demo requests go. The company address, not the ops alert address. */
const DEMO_INBOX = process.env.DEMO_REQUEST_EMAIL || 'contact@guapd.com'
const SITE_HOST = (process.env.NEXT_PUBLIC_SITE_URL || 'https://guapd.com').replace(/^https?:\/\//, '').replace(/\/+$/, '')

export type DemoRequestResult =
  | { status: 'ok' }
  | { status: 'error'; message: string }

export interface DemoRequestInput {
  name: string
  email: string
  brand: string
  phone?: string
  volume?: string
  message?: string
}

/**
 * Take a "Book demo" request from the brands page.
 *
 * Records it before emailing. The row is the durable artifact — if Resend is
 * down or unconfigured, the request still exists and can be worked from the
 * database, which is the opposite of the usual "fire an email and hope"
 * failure mode. The email is the notification, not the record.
 *
 * Never throws: a marketing form that 500s loses the lead outright.
 */
export async function requestDemo(input: DemoRequestInput): Promise<DemoRequestResult> {
  const name = (input.name || '').trim()
  const email = (input.email || '').trim().toLowerCase()
  const brand = (input.brand || '').trim()
  const phone = (input.phone || '').trim()
  const volume = (input.volume || '').trim()
  const message = (input.message || '').trim()

  if (!name) return { status: 'error', message: 'Please tell us your name.' }
  if (!isPlausibleEmail(email)) return { status: 'error', message: 'Please enter a valid work email.' }
  if (!brand) return { status: 'error', message: 'Please tell us your brand name.' }
  // Generous ceilings — these only stop a paste of a whole document.
  if (name.length > 120 || brand.length > 160 || message.length > 2000) {
    return { status: 'error', message: 'That looks too long. Please shorten it a little.' }
  }

  try {
    const admin = createAdminClient()

    // Deliberately NOT deduplicated: the same person asking twice is a signal
    // worth seeing, not noise to suppress.
    await admin.from('events').insert({
      deal_id: null,
      event_type: 'demo.requested',
      detail: { name, email, brand, phone: phone || null, volume: volume || null, message: message || null, source: 'brands_page' },
    })

    if (!isEmailConfigured()) {
      console.warn('[demo] email not configured — request stored, no notification sent')
      return { status: 'ok' }
    }

    const rows: [string, string][] = [
      ['Name', name],
      ['Work email', email],
      ['Brand', brand],
      ['Phone', phone || '—'],
      ['Deals a month', volume || '—'],
    ]
    if (message) rows.push(['Message', message])

    // 1. Tell the team. Reply-to is the requester so hitting reply just works.
    const internal = renderNoticeEmail({
      heading: `New demo request from ${brand}`,
      body: [`${name} asked for a demo. Their details are below. Reply to this email to reach them directly.`],
      rows,
      footerNote: 'Sent from the For Brands page on guapd.com.',
    })

    const sent = await sendDealEmail({
      to: [DEMO_INBOX],
      subject: `Demo request: ${brand}`,
      html: internal.html,
      text: internal.text,
      replyTo: email,
    })

    if (!sent.ok) {
      // The request is already stored, so this is a notification failure rather
      // than a lost lead. Log loudly; do not fail the submission.
      console.error(`[demo] request stored but team email failed: ${sent.reason}`)
    }

    // 2. Confirm to the requester, so they know it landed and what happens next.
    //    Failure here must not surface as an error: their request IS recorded,
    //    and telling them it failed would invite a duplicate submission.
    const confirm = renderNoticeEmail({
      heading: 'Thanks, your demo request is in.',
      body: [
        `Hi ${name.split(' ')[0]}, thanks for asking about ${BRAND_NAME}.`,
        'Someone from our team will reach out within one working day to find a time that suits you. The walkthrough usually takes about 20 minutes, and we can run it against the kind of campaigns you actually brief.',
        'If anything changes in the meantime, just reply to this email.',
      ],
      footerNote: `You're receiving this because you requested a demo on ${SITE_HOST}.`,
    })

    const ack = await sendDealEmail({
      to: [email],
      subject: `Thanks for your interest in ${BRAND_NAME}`,
      html: confirm.html,
      text: confirm.text,
      replyTo: DEMO_INBOX,
    })

    if (!ack.ok) console.error(`[demo] confirmation to requester failed: ${ack.reason}`)

    return { status: 'ok' }
  } catch (err) {
    console.error(`[demo] request failed: ${err instanceof Error ? err.message : String(err)}`)
    return { status: 'error', message: 'Something went wrong. Please try again, or email contact@guapd.com.' }
  }
}

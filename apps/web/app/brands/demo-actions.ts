'use server'

import { createAdminClient } from '@/lib/supabase/admin'
import { sendDealEmail, isEmailConfigured, isPlausibleEmail } from '@/lib/email'

/** Where demo requests go. The company address, not the ops alert address. */
const DEMO_INBOX = process.env.DEMO_REQUEST_EMAIL || 'contact@guapd.com'

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

function esc(s: string): string {
  return s.replace(/[<>&"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[c] as string))
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
      ['Message', message || '—'],
    ]

    const html =
      `<h2 style="font-family:system-ui,sans-serif;margin:0 0 16px">New demo request</h2>` +
      `<table style="font-family:system-ui,sans-serif;font-size:14px;border-collapse:collapse">` +
      rows
        .map(
          ([k, v]) =>
            `<tr><td style="padding:6px 16px 6px 0;color:#666;vertical-align:top">${esc(k)}</td>` +
            `<td style="padding:6px 0"><strong>${esc(v)}</strong></td></tr>`,
        )
        .join('') +
      `</table>`

    const text = `New demo request\n\n${rows.map(([k, v]) => `${k}: ${v}`).join('\n')}`

    const sent = await sendDealEmail({
      to: [DEMO_INBOX],
      subject: `Demo request — ${brand}`,
      html,
      text,
    })

    if (!sent.ok) {
      // The request is already stored, so this is a notification failure rather
      // than a lost lead. Log loudly; do not fail the submission.
      console.error(`[demo] request stored but email failed: ${sent.reason}`)
    }

    return { status: 'ok' }
  } catch (err) {
    console.error(`[demo] request failed: ${err instanceof Error ? err.message : String(err)}`)
    return { status: 'error', message: 'Something went wrong. Please try again, or email contact@guapd.com.' }
  }
}

import 'server-only'
import { BRAND_NAME } from '@/lib/content'
import { sendDealEmail, isEmailConfigured, isPlausibleEmail } from '@/lib/email'
import { renderAccountEmail } from '@/lib/email-template'
import { createAdminClient } from '@/lib/supabase/admin'

/**
 * The welcome email, sent once when an account is first created.
 *
 * ── NEVER THROWS, NEVER BLOCKS ────────────────────────────────────────────
 * Signup must not fail because a welcome email did not send. Every path here
 * returns rather than raises, and callers do not await a result they act on —
 * the account already exists by the time this runs.
 *
 * ── SENT ONCE ─────────────────────────────────────────────────────────────
 * Guarded by an `account.welcome_sent` event keyed to the user. A creator can
 * reach the end of signup more than once (claiming a stub, retrying a failed
 * step), and a second "welcome to Guapd" reads as a system that does not know
 * who you are. The check is best-effort by design: if the lookup itself fails
 * we send, because a duplicate welcome is a smaller failure than none at all.
 *
 * ── TWO AUDIENCES, TWO EMAILS ─────────────────────────────────────────────
 * A brand and a creator arrive wanting opposite things, so the copy is not
 * shared. What IS shared is the shell in email-template.ts, so both look like
 * the same product.
 */

const SITE = (process.env.NEXT_PUBLIC_SITE_URL || 'https://guapd.com').replace(/\/+$/, '')

export type Audience = 'brand' | 'creator'

interface WelcomeArgs {
  /** users.id — the guard is keyed to this, not to the email address. */
  userId: string
  /** Optional: creators sign up by phone and often have no address yet, and
   *  the caller should not spend a round trip fetching one that may not exist.
   *  Absent is treated exactly like an unusable address — nothing is sent, and
   *  the once-only guard leaves the door open for a later, real one. */
  to?: string | null
  audience: Audience
  /** First name if we have one. The copy reads fine without it. */
  name?: string | null
}

function content(audience: Audience, firstName: string | null) {
  const hi = firstName ? `Hi ${firstName}, ` : ''

  if (audience === 'brand') {
    return {
      heading: `Welcome to ${BRAND_NAME}.`,
      body: [
        `${hi}your account is ready. ${BRAND_NAME} is where a creator collaboration lives from the first offer to the final payment, instead of across WhatsApp, email and a spreadsheet.`,
        'When you send an offer, the deliverables, rate, timeline, revisions, usage rights and payment terms are agreed in one place and locked once both sides accept. Everything after that, including approvals and payment status, is tracked on the same deal.',
        'The quickest way to see it is to build your first offer. It takes a few minutes.',
      ],
      ctaUrl: `${SITE}/deals/new`,
      ctaLabel: 'Create your first deal',
      footerNote: `You're receiving this because you created a ${BRAND_NAME} account.`,
    }
  }

  return {
    heading: `Welcome to ${BRAND_NAME}.`,
    body: [
      `${hi}your account is ready. ${BRAND_NAME} is one inbox for every brand deal, so offers stop getting buried in DMs and you stop chasing to find out where payment is.`,
      'Every offer arrives with the deliverables, rate, timeline, revisions and payment terms written down. You can accept, counter or decline, and whatever is agreed stays on record for both sides.',
      `${BRAND_NAME} is free for creators. Our fee is paid by the brand on top of your rate, so you receive the full amount you quoted.`,
    ],
    ctaUrl: `${SITE}/creator/dashboard`,
    ctaLabel: 'Open your dashboard',
    footerNote: `You're receiving this because you created a ${BRAND_NAME} account.`,
  }
}

/**
 * Send the welcome email if this user has not had one.
 *
 * Resolves either way. Callers should NOT block signup on the result.
 */
export async function sendWelcomeEmail({ userId, to, audience, name }: WelcomeArgs): Promise<void> {
  try {
    if (!isPlausibleEmail(to || '')) {
      // Creators sign up by phone, so an address is genuinely optional here.
      return
    }
    if (!isEmailConfigured()) {
      console.warn('[welcome] email not configured — no welcome sent')
      return
    }

    const admin = createAdminClient()

    // Already welcomed? Best-effort: on a lookup failure we fall through and
    // send, because a duplicate is a smaller failure than silence.
    const { data: prior } = await admin
      .from('events')
      .select('id')
      .eq('event_type', 'account.welcome_sent')
      .contains('detail', { user_id: userId })
      .limit(1)

    if (prior && prior.length > 0) return

    const firstName = (name || '').trim().split(/\s+/)[0] || null
    const { heading, body, ctaUrl, ctaLabel, footerNote } = content(audience, firstName)
    const email = renderAccountEmail({ heading, body, ctaUrl, ctaLabel, footerNote })

    const sent = await sendDealEmail({
      to: [to as string],
      subject: `Welcome to ${BRAND_NAME}`,
      html: email.html,
      text: email.text,
    })

    if (!sent.ok) {
      console.error(`[welcome] send failed for ${audience}: ${sent.reason}`)
      return
    }

    // Recorded only on success, so a failed send can be retried by a later
    // signup completion rather than being suppressed by its own guard.
    await admin.from('events').insert({
      deal_id: null,
      event_type: 'account.welcome_sent',
      detail: { user_id: userId, audience, to },
    })
  } catch (err) {
    console.error(`[welcome] unexpected failure: ${err instanceof Error ? err.message : String(err)}`)
  }
}

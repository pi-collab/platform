'use server'

import { verifyOpsAccess } from '@/lib/ops-auth'
import { logOpsEvent } from '@/lib/ops-audit'
import { createAdminClient } from '@/lib/supabase/admin'
import { sendAccountEmail, isEmailConfigured, isPlausibleEmail, maskEmail } from '@/lib/email'
import { renderOutreachEmail, type OutreachBullet, type EmailLine } from '@/lib/email-template'

/**
 * Outreach campaigns, sent from the server that already holds the key.
 *
 * ── Why this exists as a page and not a script ──────────────────────────────
 * The Resend key is a production secret and is marked sensitive in Vercel, so
 * it cannot be read back out — which is correct, and means a laptop running a
 * one-off script has to be handed a copy of it. This runs where the key
 * already lives. Nothing is copied anywhere, and every send is audited instead
 * of living in one person's terminal history.
 *
 * ── Admin only ──────────────────────────────────────────────────────────────
 * verifyOpsAccess, not the outreach role. The outreach role reads creators and
 * works the pipeline; mailing a list of strangers from guapd.com is the same
 * class of action as a vetting decision — it reaches real people and it spends
 * the sending domain's reputation, which every transactional email we send
 * depends on.
 */

export interface OutreachRecipient {
  email: string
  /** Empty means the greeting is a bare "Hey," — never a guessed name. */
  name?: string
}

export interface OutreachInput {
  subject: string
  heading: string
  intro: EmailLine[]
  bullets: OutreachBullet[]
  ctaUrl: string
  ctaLabel: string
  signoff: string
  recipients: OutreachRecipient[]
  /** Identifies the campaign for idempotency and in the audit log. */
  campaignId: string
}

export interface OutreachResult {
  email: string
  ok: boolean
  detail?: string
}

/** Hard ceiling per call. Keeps one mistake from becoming a thousand emails,
 *  and keeps the run inside the function's time budget. */
const MAX_RECIPIENTS = 60

/** Between sends. Resend allows far more; the pause is for the domain's
 *  reputation, not for the rate limit. */
const GAP_MS = 400

export async function previewOutreach(input: OutreachInput): Promise<{ html: string; text: string }> {
  const user = await verifyOpsAccess()
  if (!user) throw new Error('Not authorized')

  const first = input.recipients[0]
  return render(input, first?.name ?? '')
}

function render(input: OutreachInput, name: string) {
  return renderOutreachEmail({
    greeting: name.trim() ? `Hey ${name.trim()},` : 'Hey,',
    heading: input.heading,
    intro: input.intro,
    bullets: input.bullets,
    ctaUrl: input.ctaUrl,
    ctaLabel: input.ctaLabel,
    signoff: input.signoff,
  })
}

/**
 * Send one campaign.
 *
 * ── One request per recipient, always ───────────────────────────────────────
 * Resend accepts 50 addresses in `to`, and using that here would put every
 * creator's address in front of every other creator. There is no version of
 * this where the list is batched into one message.
 */
export async function sendOutreach(input: OutreachInput): Promise<{
  ok: boolean
  message?: string
  results?: OutreachResult[]
}> {
  const user = await verifyOpsAccess()
  if (!user) return { ok: false, message: 'Not authorized' }

  if (!isEmailConfigured()) {
    return { ok: false, message: 'Email is not configured in this environment (EMAIL_ENABLED / RESEND_API_KEY / EMAIL_FROM).' }
  }

  if (!input.subject.trim()) return { ok: false, message: 'Subject is required' }
  if (!input.heading.trim()) return { ok: false, message: 'Heading is required' }
  if (!input.campaignId.trim()) return { ok: false, message: 'Campaign id is required' }

  // Deduplicated on the way in: the same address pasted twice is a list that
  // was assembled by hand, not a request to email someone twice.
  const seen = new Set<string>()
  const clean: OutreachRecipient[] = []
  const rejected: string[] = []

  for (const r of input.recipients) {
    const email = r.email.trim().toLowerCase()
    if (!isPlausibleEmail(email)) { rejected.push(r.email); continue }
    if (seen.has(email)) continue
    seen.add(email)
    clean.push({ email, name: (r.name ?? '').trim() })
  }

  if (clean.length === 0) return { ok: false, message: 'No usable addresses' }
  if (clean.length > MAX_RECIPIENTS) {
    return { ok: false, message: `${clean.length} recipients exceeds the ${MAX_RECIPIENTS} per-send cap` }
  }

  /* Audited BEFORE the first send, not after. A run that dies halfway must
     still leave a record that it started, who started it, and to how many —
     "we think someone sent something last Tuesday" is not an audit trail. */
  await logOpsEvent(user, 'outreach.campaign_started', 'campaign', input.campaignId, {
    subject: input.subject,
    heading: input.heading,
    recipients: clean.length,
    rejected: rejected.length,
    cta_url: input.ctaUrl,
  })

  const results: OutreachResult[] = []

  for (const r of clean) {
    const { html, text } = render(input, r.name ?? '')
    const res = await sendAccountEmail({
      to: [r.email],
      subject: input.subject,
      html,
      text,
      // Campaign plus address: a re-run after a partial failure inside Resend's
      // 24h window re-sends to nobody who already received it.
      idempotencyKey: `${input.campaignId}-${r.email}`,
    })
    results.push({ email: r.email, ok: res.ok, detail: res.ok ? undefined : res.reason })
    await new Promise((done) => setTimeout(done, GAP_MS))
  }

  const sent = results.filter((r) => r.ok).length
  const failed = results.length - sent

  await logOpsEvent(user, 'outreach.campaign_sent', 'campaign', input.campaignId, {
    subject: input.subject,
    sent,
    failed,
    // Addresses masked: ops_events is read by people who do not need a list of
    // everyone's inbox, and the count is what the audit question is about.
    failures: results.filter((r) => !r.ok).map((r) => ({ to: maskEmail(r.email), reason: r.detail })),
  })

  /* Also recorded per-recipient in `events`, unmasked, because "did this
     person ever get mailed by us, and when" is a question the next campaign
     needs answered — and it is the only record that a stranger who is not yet
     a row in `creators` was contacted at all. */
  try {
    await createAdminClient().from('events').insert(
      results.map((r) => ({
        event_type: r.ok ? 'outreach.email_sent' : 'outreach.email_failed',
        detail: { campaign: input.campaignId, to: r.email, ...(r.ok ? {} : { reason: r.detail }) },
      })),
    )
  } catch (err) {
    console.error(`[outreach] could not record per-recipient events: ${err instanceof Error ? err.message : String(err)}`)
  }

  return {
    ok: failed === 0,
    message: failed === 0
      ? `Sent ${sent}.`
      : `Sent ${sent}, ${failed} failed.${rejected.length ? ` ${rejected.length} address(es) were unusable and skipped.` : ''}`,
    results,
  }
}

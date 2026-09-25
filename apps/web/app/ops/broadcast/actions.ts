'use server'

import { verifyOpsAccess } from '@/lib/ops-auth'
import { logOpsEvent } from '@/lib/ops-audit'
import { createAdminClient } from '@/lib/supabase/admin'
import { sendWhatsAppTemplate, maskPhone } from '@/lib/whatsapp'
import {
  resolveBroadcastAudience,
  type BroadcastAudience,
  type BroadcastAudienceResult,
} from '@/lib/creator-broadcast'

/**
 * WhatsApp to a list of creators, sent from the server that holds the key.
 *
 * ── Why this exists ─────────────────────────────────────────────────────────
 * sendWhatsAppTemplate was only ever reached by transactional code: one
 * creator, triggered by one event. Telling the whole roster something — a new
 * capability, a storefront that needs finishing — had no path at all, and the
 * MSG91 auth key is a production secret marked sensitive in Vercel, so a
 * one-off script means copying it onto a laptop. This runs where it already is.
 *
 * Same shape as the email outreach next door, deliberately: preview first,
 * hard cap, pause between sends, audit before and after, and per-recipient
 * rows in `events` so a re-run skips whoever already received it.
 *
 * ── Admin only ──────────────────────────────────────────────────────────────
 * verifyOpsAccess. A broadcast reaches real creators on the channel they
 * actually read, and it spends the WhatsApp number's standing with Meta:
 * template sends that get reported cost the number, not the message.
 */

/** Hard ceiling per call: one mistake must not become the whole roster twice,
 *  and the run has to finish inside the function's time budget. */
const MAX_RECIPIENTS = 60

/** Between sends. Not a rate limit — pacing, so a burst of identical template
 *  sends does not read as a blast to Meta's spam heuristics. */
const GAP_MS = 600

export interface BroadcastInput {
  /** The template's name as registered in MSG91, e.g. 'storefront_update'. */
  template: string
  audience: BroadcastAudience
  /** Identifies this campaign for idempotency and in the audit log. */
  campaignId: string
  /** Appended to the template's URL button, when the template declares a
   *  DYNAMIC one. Left empty for a static button — supplying a value for a
   *  button that takes none is rejected outright, which is how two
   *  status_update sends were already lost. */
  buttonValue?: string
}

export interface BroadcastPreview extends BroadcastAudienceResult {
  overCap: boolean
  cap: number
}

/** Read-only. Resolves exactly who would be messaged, and who would not. */
export async function previewBroadcast(input: BroadcastInput): Promise<BroadcastPreview | { error: string }> {
  const user = await verifyOpsAccess()
  if (!user) return { error: 'Not authorized' }

  const resolved = await resolveBroadcastAudience(input.audience, input.campaignId)
  return { ...resolved, overCap: resolved.sendable.length > MAX_RECIPIENTS, cap: MAX_RECIPIENTS }
}

export interface BroadcastSendResult {
  ok: boolean
  message: string
  sent: number
  failed: number
  failures: { name: string; reason: string }[]
}

export async function sendBroadcast(input: BroadcastInput): Promise<BroadcastSendResult | { error: string }> {
  const user = await verifyOpsAccess()
  if (!user) return { error: 'Not authorized' }

  if (!input.template.trim()) return { error: 'Template name is required' }
  if (!input.campaignId.trim()) return { error: 'Campaign id is required' }

  /* Resolved AGAIN here rather than trusting a list posted from the browser.
     The preview is a view; this is the decision. A recipient list round-tripped
     through the client is a list anyone with the page open can edit. */
  const { sendable } = await resolveBroadcastAudience(input.audience, input.campaignId)

  if (sendable.length === 0) {
    return {
      ok: true,
      message: 'Nobody to send to — everyone is already sent, opted out, or has no number.',
      sent: 0, failed: 0, failures: [],
    }
  }
  if (sendable.length > MAX_RECIPIENTS) {
    return { error: `${sendable.length} recipients exceeds the ${MAX_RECIPIENTS} per-send cap` }
  }

  /* Audited BEFORE the first send. A run that dies halfway must still leave a
     record that it started, who started it, and to how many. */
  await logOpsEvent(user, 'broadcast.whatsapp_started', 'creators', null, {
    campaign_id: input.campaignId,
    template: input.template,
    audience: input.audience,
    recipients: sendable.length,
  })

  const admin = createAdminClient()
  let sent = 0
  const failures: { name: string; reason: string }[] = []

  for (const r of sendable) {
    const res = await sendWhatsAppTemplate({
      template: input.template,
      toPhone: r.phone,
      /* Variable 1 is the creator's first name. creatorWhatsAppContact already
         falls back to "there" rather than an empty string: MSG91 rejects a
         blank body parameter, so an unnamed creator would fail the send
         instead of simply being greeted plainly. */
      bodyVars: [r.firstName],
      ...(input.buttonValue ? { buttonValue: input.buttonValue } : {}),
    })

    if (res.ok) sent++
    else failures.push({ name: r.fullName, reason: res.reason })

    /* Written per recipient, immediately — NOT batched at the end. A run that
       times out mid-way has already messaged people, and the next run reads
       these rows to know not to message them twice. Batching would lose
       exactly the records that make the re-run safe. */
    try {
      await admin.from('events').insert({
        event_type: res.ok ? 'broadcast.whatsapp_sent' : 'broadcast.whatsapp_failed',
        detail: {
          campaign: input.campaignId,
          template: input.template,
          creator_id: r.creatorId,
          to: maskPhone(r.phone),
          ...(res.ok ? {} : { reason: res.reason }),
        },
      })
    } catch (err) {
      console.error(`[broadcast] could not record send for ${r.creatorId}: ${err instanceof Error ? err.message : String(err)}`)
    }

    await new Promise((done) => setTimeout(done, GAP_MS))
  }

  await logOpsEvent(user, 'broadcast.whatsapp_finished', 'creators', null, {
    campaign_id: input.campaignId,
    template: input.template,
    sent,
    failed: failures.length,
    failures,
  })

  return {
    ok: failures.length === 0,
    message: failures.length === 0 ? `Sent ${sent}.` : `Sent ${sent}, ${failures.length} failed.`,
    sent,
    failed: failures.length,
    failures,
  }
}

import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import { sendDealEmail, isEmailConfigured } from '@/lib/email'
import { renderDealEmail } from '@/lib/email-template'

/**
 * SEND GATE — the single decision point for whether a brand's outbound deal
 * reaches a creator.
 *
 * Brands can browse vetted creators and send to anyone, so this is what stands
 * between a new signup and a creator's inbox. It is deliberately ONE helper:
 * there are three send paths (createDeal, bulkSendCampaignDrafts, the storefront
 * pitch) and the storefront previously carried its own inline
 * `brand_status !== 'approved'` check, which is exactly why it was invisible to
 * anyone grepping for the shared auth helper. No inline status comparisons
 * anywhere — if you need to know whether a brand may send, call resolveSendMode.
 *
 * The gate is on the BRAND, not the deal: once approved, never re-reviewed.
 *
 * ── The two axes ──────────────────────────────────────────────────────────
 * STARTING a new deal is gated here. PROGRESSING an existing deal (accepting a
 * counter, paying an invoice, approving deliverables, marking shipped) is NOT
 * and must never be — a rejected brand mid-deal would otherwise strand the
 * creator with unapproved work and unpaid invoices. Rejection blocks new sends
 * only.
 */

export type SendMode =
  /** Brand is approved — deliver immediately, fire notifications. */
  | { mode: 'send' }
  /** Not yet reviewed — create the deal but withhold it, and open a review. */
  | { mode: 'hold' }
  /** Rejected — refuse outright. Nothing is created. */
  | { mode: 'block'; message: string }

/**
 * Decide what happens to an outbound deal from this brand.
 *
 * Reads brand_status directly rather than trusting a caller-supplied value:
 * this runs server-side inside the send action, before any notification, and
 * must not be bypassable by a stale client payload.
 */
export async function resolveSendMode(brandId: string): Promise<SendMode> {
  const admin = createAdminClient()
  const { data: brand } = await admin
    .from('brands')
    .select('brand_status, rejection_reason')
    .eq('id', brandId)
    .maybeSingle()

  // No brand row is an integrity problem, not an approval one — refuse rather
  // than silently sending.
  if (!brand) {
    return { mode: 'block', message: 'Brand account not found.' }
  }

  switch (brand.brand_status) {
    case 'approved':
      return { mode: 'send' }
    case 'rejected':
      return {
        mode: 'block',
        message:
          brand.rejection_reason?.trim() ||
          'Your account isn’t cleared to send new deals. Contact support if you think this is a mistake.',
      }
    case 'unreviewed':
    case 'pending_review':
    default:
      return { mode: 'hold' }
  }
}

/**
 * Record that a brand's deal was held, moving it into the review queue.
 *
 * Idempotent by design — a bulk send holds N deals but must produce ONE review
 * task and ONE ops email. The status transition is a conditional UPDATE (only
 * from 'unreviewed'), and the email is guarded on the existence of its own
 * audit event, so retries and concurrent sends cannot duplicate either.
 *
 * Never throws: a failure here must not fail the send action, which has already
 * written the deal.
 */
export async function registerHeldSend(brandId: string, dealId: string): Promise<void> {
  try {
    const admin = createAdminClient()

    // Deal-scoped audit: this specific deal was withheld.
    await admin.from('events').insert({
      deal_id: dealId,
      event_type: 'deal.send_held',
      detail: { brand_id: brandId, reason: 'brand_not_approved' },
    })

    // Conditional transition — only the FIRST held send opens a review.
    const { data: moved } = await admin
      .from('brands')
      .update({ brand_status: 'pending_review' })
      .eq('id', brandId)
      .eq('brand_status', 'unreviewed')
      .select('id, name')

    const justEnteredReview = Boolean(moved && moved.length > 0)

    if (justEnteredReview) {
      await admin.from('events').insert({
        deal_id: dealId,
        event_type: 'brand.pending_review',
        detail: { brand_id: brandId },
      })
    }

    // The email is guarded independently of the status transition: if the
    // transition succeeded but the email failed, a later send retries the email
    // without re-transitioning.
    await notifyOpsOnce(brandId)
  } catch (err) {
    console.error(
      `[send-gate] registerHeldSend failed brand=${brandId} deal=${dealId}: ${
        err instanceof Error ? err.message : String(err)
      }`,
    )
  }
}

/**
 * Email ops that a brand is awaiting approval — at most ONCE per brand, ever.
 *
 * Guarded on EXISTENCE of its own audit event rather than a time window: the
 * requirement is one nudge per brand, not one per day. Same principle as the
 * payment-reminder cooldown — the guard reads from the audit log server-side,
 * so retries and bulk loops cannot get past it.
 *
 * The email is a nudge only. It carries no approve/reject actions; /ops remains
 * the source of truth.
 */
async function notifyOpsOnce(brandId: string): Promise<void> {
  const admin = createAdminClient()

  const { data: alreadySent } = await admin
    .from('events')
    .select('id')
    .eq('event_type', 'brand.pending_review_notified')
    .contains('detail', { brand_id: brandId })
    .limit(1)
    .maybeSingle()

  if (alreadySent) return

  const to = process.env.OPS_NOTIFY_EMAIL
  if (!to) {
    console.warn('[send-gate] OPS_NOTIFY_EMAIL unset — skipping ops notification')
    return
  }
  if (!isEmailConfigured()) {
    console.warn('[send-gate] email not configured — skipping ops notification')
    return
  }

  const { data: brand } = await admin
    .from('brands')
    .select('name')
    .eq('id', brandId)
    .maybeSingle()

  const brandName = brand?.name?.trim() || 'A brand'
  const base = (process.env.NEXT_PUBLIC_SITE_URL || 'https://guapd.com').replace(/\/+$/, '')

  const { html, text } = renderDealEmail({
    heading: `${brandName} is awaiting approval`,
    body: `${brandName} tried to send their first deal. It’s being held until you approve the account. Review them in the ops queue — approving releases every held deal automatically.`,
    dealLabel: brandName,
    dealUrl: `${base}/ops/brands`,
    ctaLabel: 'Open brand review queue',
  })

  const result = await sendDealEmail({
    to: [to],
    subject: `Brand awaiting approval — ${brandName}`,
    html,
    text,
    // Stable key: one send per brand even if this is somehow reached twice.
    idempotencyKey: `brand-pending-${brandId}`,
  })

  // Only record the event on success, so a transient failure retries next time
  // rather than silently burning the one notification this brand ever gets.
  if (result.ok) {
    await admin.from('events').insert({
      event_type: 'brand.pending_review_notified',
      detail: { brand_id: brandId, to_masked: to.replace(/(.{2}).*(@.*)/, '$1***$2') },
    })
  }
}

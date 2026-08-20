import 'server-only'
import { followerRangeOf } from '@/lib/follower-range'
import { createAdminClient } from '@/lib/supabase/admin'
import { sendAccountEmail, isEmailConfigured } from '@/lib/email'
import { renderAccountEmail } from '@/lib/email-template'
import { BRAND_NAME } from '@/lib/content'

/**
 * Account-level emails: the ones that tell someone their account changed
 * state, rather than that a deal did.
 *
 * These are the moments a user is WAITING on us. A brand held at first send
 * and a creator awaiting vetting have both been told "we'll let you know", and
 * until this existed we simply did not — approval happened silently in ops and
 * the only way to discover it was to keep logging in and checking.
 *
 * Every function here:
 *   - never throws, so a mail failure cannot roll back an ops action that
 *     already succeeded
 *   - records the outcome in `events`, so "were they told?" is a query
 *   - is safe to call twice; the idempotency key covers a double-clicked
 *     ops button within Resend's 24h window
 */

function siteBase(): string {
  return (process.env.NEXT_PUBLIC_SITE_URL || 'https://guapd.com').replace(/\/+$/, '')
}

/** Log the attempt so delivery is auditable, never throwing. */
async function record(
  eventType: string,
  detail: Record<string, unknown>,
): Promise<void> {
  try {
    await createAdminClient().from('events').insert({ event_type: eventType, detail })
  } catch (err) {
    console.error(`[account-email] could not record ${eventType}: ${err instanceof Error ? err.message : String(err)}`)
  }
}

/**
 * Tell a brand its account cleared review.
 *
 * Sent to EVERY member, not just the admin who signed up. Any of them may be
 * the one waiting on a held deal, and a brand is a team.
 */
export async function notifyBrandApproved(brandId: string): Promise<void> {
  try {
    const admin = createAdminClient()

    const { data: brand } = await admin
      .from('brands').select('name').eq('id', brandId).maybeSingle()

    const { data: members } = await admin
      .from('brand_members').select('user_id').eq('brand_id', brandId)

    const userIds = (members ?? []).map((m) => m.user_id)
    if (userIds.length === 0) {
      await record('brand.approved_email_skipped', { brand_id: brandId, reason: 'no_members' })
      return
    }

    const { data: users } = await admin
      .from('users').select('email').in('id', userIds)

    const to = (users ?? []).map((u) => u.email).filter((e): e is string => Boolean(e))
    if (to.length === 0) {
      await record('brand.approved_email_skipped', { brand_id: brandId, reason: 'no_addresses' })
      return
    }

    const { html, text } = renderAccountEmail({
      heading: `${brand?.name ?? 'Your brand'} is approved`,
      body: [
        `Your account has been reviewed and cleared, so you can now send deals to creators on ${BRAND_NAME}.`,
        'Anything you had queued while we reviewed you has already gone out. You do not need to send it again.',
      ],
      ctaUrl: `${siteBase()}/dashboard`,
      ctaLabel: 'Go to your dashboard',
      footerNote: `You're receiving this because you're a member of ${brand?.name ?? 'this brand'} on ${BRAND_NAME}.`,
    })

    const res = await sendAccountEmail({
      to,
      subject: `${brand?.name ?? 'Your brand'} is approved on ${BRAND_NAME}`,
      html,
      text,
      // Brand id alone: approval happens once, so a second send within the
      // window is a double-click, not a second event.
      idempotencyKey: `brand-approved-${brandId}`,
    })

    await record(res.ok ? 'brand.approved_email_sent' : 'brand.approved_email_failed', {
      brand_id: brandId,
      recipients: to.length,
      ...(res.ok ? {} : { reason: res.reason }),
    })
  } catch (err) {
    console.error(`[account-email] notifyBrandApproved failed brand=${brandId}: ${err instanceof Error ? err.message : String(err)}`)
  }
}

/** Resolve a creator's best contact address, or null. */
async function creatorEmail(creatorId: string): Promise<{ email: string | null; name: string }> {
  const admin = createAdminClient()
  const { data: creator } = await admin
    .from('creators').select('full_name, contact_email, user_id').eq('id', creatorId).maybeSingle()

  if (!creator) return { email: null, name: 'there' }

  // contact_email is the address the creator gave us for exactly this; the
  // users row only has one if they signed up with Google.
  let email = creator.contact_email ?? null
  if (!email && creator.user_id) {
    const { data: u } = await admin.from('users').select('email').eq('id', creator.user_id).maybeSingle()
    email = u?.email ?? null
  }

  return { email, name: creator.full_name?.split(' ')[0] || 'there' }
}

/** Tell a creator their profile passed vetting. */
export async function notifyCreatorApproved(creatorId: string): Promise<void> {
  try {
    const { email, name } = await creatorEmail(creatorId)
    if (!email) {
      // Expected, not exceptional: a creator who signed up by phone has given
      // us no address. Recorded so the gap is visible rather than silent.
      await record('creator.approved_email_skipped', { creator_id: creatorId, reason: 'no_address' })
      return
    }

    const { html, text } = renderAccountEmail({
      heading: `You're approved, ${name}`,
      body: [
        `Your profile has been reviewed and you're now live on ${BRAND_NAME}.`,
        'Brands can find you and send offers. Set up your storefront so they see your rates and your best work.',
      ],
      ctaUrl: `${siteBase()}/creator/dashboard`,
      ctaLabel: 'Go to your dashboard',
    })

    const res = await sendAccountEmail({
      to: [email],
      subject: `You're approved on ${BRAND_NAME}`,
      html,
      text,
      idempotencyKey: `creator-approved-${creatorId}`,
    })

    await record(res.ok ? 'creator.approved_email_sent' : 'creator.approved_email_failed', {
      creator_id: creatorId,
      ...(res.ok ? {} : { reason: res.reason }),
    })
  } catch (err) {
    console.error(`[account-email] notifyCreatorApproved failed creator=${creatorId}: ${err instanceof Error ? err.message : String(err)}`)
  }
}

/**
 * Tell a creator their profile was not approved.
 *
 * Deliberately leaves a door open rather than closing the account off. Vetting
 * is a judgement made on limited information, and the people most likely to be
 * rejected early are the ones whose profile was simply too thin to assess.
 */
export async function notifyCreatorRejected(creatorId: string): Promise<void> {
  try {
    const { email, name } = await creatorEmail(creatorId)
    if (!email) {
      await record('creator.rejected_email_skipped', { creator_id: creatorId, reason: 'no_address' })
      return
    }

    const { html, text } = renderAccountEmail({
      heading: `An update on your ${BRAND_NAME} profile`,
      body: [
        `Hi ${name}, we've reviewed your profile and can't approve it for ${BRAND_NAME} right now.`,
        'Review looks at a few different parameters, and this is not a judgement on the quality of your work.',
        // NOT "reply to this email": EMAIL_REPLY_TO is unset, so a reply goes
        // nowhere. The appeal box on their profile page does reach us, and it
        // records what they wrote rather than depending on mail routing.
        'If you think we have got this wrong, open your profile and send us a note. We will take another look.',
      ],
      ctaUrl: `${siteBase()}/creator/dashboard`,
      ctaLabel: 'View your profile status',
      footerNote: `This is an automated notification from ${BRAND_NAME}.`,
    })

    const res = await sendAccountEmail({
      to: [email],
      subject: `An update on your ${BRAND_NAME} profile`,
      html,
      text,
      idempotencyKey: `creator-rejected-${creatorId}`,
    })

    await record(res.ok ? 'creator.rejected_email_sent' : 'creator.rejected_email_failed', {
      creator_id: creatorId,
      ...(res.ok ? {} : { reason: res.reason }),
    })
  } catch (err) {
    console.error(`[account-email] notifyCreatorRejected failed creator=${creatorId}: ${err instanceof Error ? err.message : String(err)}`)
  }
}


/**
 * Tell ops a creator has submitted their profile and is waiting on vetting.
 *
 * The mirror of the brand gate's notifyOpsOnce. Without it a creator sits on
 * "check back in 24 to 48 hours" while nobody knows to look: the ops queue is
 * a page somebody has to remember to open, and the creator has been given a
 * deadline we never agreed to internally.
 *
 * Sent ONCE per creator. The event guard is on existence rather than a time
 * window, so re-saving the profile does not re-notify.
 */
export async function notifyOpsCreatorPending(creatorId: string): Promise<void> {
  try {
    const admin = createAdminClient()

    const { data: already } = await admin
      .from('events')
      .select('id')
      .eq('event_type', 'creator.pending_review_notified')
      .contains('detail', { creator_id: creatorId })
      .limit(1)
      .maybeSingle()

    if (already) return

    const to = process.env.OPS_NOTIFY_EMAIL
    if (!to) {
      console.warn('[account-email] OPS_NOTIFY_EMAIL unset, skipping creator review notice')
      return
    }
    if (!isEmailConfigured()) {
      console.warn('[account-email] email not configured, skipping creator review notice')
      return
    }

    const { data: creator } = await admin
      .from('creators')
      .select('full_name, handle, primary_platform, phone, social_accounts')
      .eq('id', creatorId)
      .maybeSingle()

    const name = creator?.full_name?.trim() || 'A creator'
    const handle = creator?.handle ? `@${creator.handle}` : 'no handle'
    const reach = followerRangeOf(creator?.social_accounts)

    const { html, text } = renderAccountEmail({
      heading: `${name} is waiting on vetting`,
      body: [
        `${name} (${handle}) has completed their profile and is waiting to be reviewed.`,
        // The audience band they picked. It is the first thing anyone vetting
        // wants, and putting it here means the obvious calls can be made from
        // the mail without opening ops at all.
        reach
          ? `Audience: ${reach} followers.`
          : 'Audience: not answered (profile predates the follower question).',
        // They have been promised a window; ops needs to know the clock is on.
        'They have been told to check back in 24 to 48 hours, so this one is on a clock.',
      ],
      // Straight to the creator, not the list. The queue is where you end up
      // hunting for the row this email is about.
      ctaUrl: `${siteBase()}/ops/creators/${creatorId}`,
      ctaLabel: 'Review this creator',
      footerNote: `Sent to the ops address for ${BRAND_NAME}.`,
    })

    const res = await sendAccountEmail({
      to: [to],
      subject: `Creator awaiting vetting: ${name}`,
      html,
      text,
      idempotencyKey: `creator-pending-${creatorId}`,
    })

    // Recorded only on success, so a transient failure retries on the next
    // submit rather than burning the single notice this creator gets.
    if (res.ok) {
      await record('creator.pending_review_notified', {
        creator_id: creatorId,
        to_masked: to.replace(/(.{2}).*(@.*)/, '$1***$2'),
      })
    } else {
      console.error(`[account-email] ops creator notice failed creator=${creatorId}: ${res.reason}`)
    }
  } catch (err) {
    console.error(`[account-email] notifyOpsCreatorPending failed creator=${creatorId}: ${err instanceof Error ? err.message : String(err)}`)
  }
}


/**
 * Forward a rejected creator's appeal to ops.
 *
 * The appeal is already stored as an event before this runs, so a mail
 * failure loses the notification, not what they wrote.
 */
export async function notifyOpsCreatorAppeal(creatorId: string, note: string): Promise<void> {
  try {
    const to = process.env.OPS_NOTIFY_EMAIL
    if (!to || !isEmailConfigured()) {
      console.warn('[account-email] ops address or email not configured, appeal not forwarded')
      return
    }

    const admin = createAdminClient()
    const { data: creator } = await admin
      .from('creators').select('full_name, handle').eq('id', creatorId).maybeSingle()

    const name = creator?.full_name?.trim() || 'A creator'

    const { html, text } = renderAccountEmail({
      heading: `${name} has appealed their rejection`,
      body: [
        `${name}${creator?.handle ? ` (@${creator.handle})` : ''} was not approved and has asked us to look again.`,
        note,
      ],
      ctaUrl: `${siteBase()}/ops/creators/${creatorId}`,
      ctaLabel: 'Open their profile',
      footerNote: `Sent to the ops address for ${BRAND_NAME}.`,
    })

    const res = await sendAccountEmail({
      to: [to],
      subject: `Appeal from ${name}`,
      html,
      text,
      idempotencyKey: `creator-appeal-${creatorId}`,
    })

    await record(res.ok ? 'creator.appeal_notified' : 'creator.appeal_notify_failed', {
      creator_id: creatorId,
      ...(res.ok ? {} : { reason: res.reason }),
    })
  } catch (err) {
    console.error(`[account-email] notifyOpsCreatorAppeal failed creator=${creatorId}: ${err instanceof Error ? err.message : String(err)}`)
  }
}


/**
 * Tell ops that a brand has signed up.
 *
 * The creator side has notifyOpsCreatorPending; the brand side had nothing at
 * signup — notifyOpsOnce in send-gate.ts only fires later, when an unapproved
 * brand tries to send a deal. So a brand could sit unreviewed in the queue with
 * nobody told it had arrived.
 *
 * Carries the details rather than just a link, because the first question about
 * a new brand is whether it looks real, and that can usually be answered from
 * the name, the domain and the industry without opening anything.
 *
 * Once-only, keyed to the brand, so a retry cannot send twice. Never throws:
 * this runs inside signup and a failed notification must not fail an account.
 */
export async function notifyOpsBrandSignup(brandId: string): Promise<void> {
  try {
    const admin = createAdminClient()

    const { data: already } = await admin
      .from('events')
      .select('id')
      .eq('event_type', 'ops.brand_signup_notified')
      .contains('detail', { brand_id: brandId })
      .limit(1)
      .maybeSingle()

    if (already) return

    const to = process.env.OPS_NOTIFY_EMAIL
    if (!to) {
      console.warn('[account-email] OPS_NOTIFY_EMAIL unset, skipping brand signup notice')
      return
    }
    if (!isEmailConfigured()) {
      console.warn('[account-email] email not configured, skipping brand signup notice')
      return
    }

    const { data: brand } = await admin
      .from('brands')
      .select('name, category, website, contact_email, contact_phone, contact_name, company_size, location, social_accounts, created_at')
      .eq('id', brandId)
      .maybeSingle()

    if (!brand) return

    const name = brand.name?.trim() || 'A brand'
    const social = Array.isArray(brand.social_accounts) ? brand.social_accounts : []
    const instagram = social
      .map((a) => (a && typeof a === 'object' ? (a as Record<string, unknown>) : null))
      .find((a) => a && a.platform === 'instagram')
    const handle = instagram && typeof instagram.handle === 'string' ? instagram.handle : null

    // One fact per line. Anything missing says so rather than being dropped,
    // because "no website" is itself worth knowing when judging a signup.
    const detail = [
      `Industry: ${brand.category || 'not given'}`,
      `Website: ${brand.website || 'not given'}`,
      `Instagram: ${handle ? '@' + handle : 'not given'}`,
      `Company size: ${brand.company_size || 'not given'}`,
      `Location: ${brand.location || 'not given'}`,
      `Contact: ${brand.contact_name || 'not given'} (${brand.contact_email || 'no email'})`,
      `Phone: ${brand.contact_phone || 'not given'}`,
    ].join('\n')

    const { html, text } = renderAccountEmail({
      heading: `${name} just signed up`,
      body: [
        `${name} created a brand account and is waiting to be reviewed.`,
        detail,
      ],
      ctaUrl: `${siteBase()}/ops/brands`,
      ctaLabel: 'Review this brand',
      footerNote: `Sent to the ops address for ${BRAND_NAME}.`,
    })

    const res = await sendAccountEmail({
      to: [to],
      subject: `New brand signup: ${name}`,
      html,
      text,
      idempotencyKey: `brand-signup-${brandId}`,
    })

    if (res.ok) {
      await record('ops.brand_signup_notified', {
        brand_id: brandId,
        to_masked: to.replace(/(.{2}).*(@.*)/, '$1***$2'),
      })
    } else {
      console.error(`[account-email] ops brand signup notice failed brand=${brandId}: ${res.reason}`)
    }
  } catch (err) {
    console.error(`[account-email] notifyOpsBrandSignup failed brand=${brandId}: ${err instanceof Error ? err.message : String(err)}`)
  }
}

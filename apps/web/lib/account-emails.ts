import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import { sendAccountEmail } from '@/lib/email'
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
        'This is usually about fit with the brands currently hiring, not the quality of your work, and it can change as more brands join.',
        'If you think we have got this wrong, reply to this email and we will take another look.',
      ],
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

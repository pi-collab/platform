import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import { createNotification } from '@/lib/notifications'
import { sendDealEmail, isPlausibleEmail } from '@/lib/email'
import { isSyntheticEmail } from '@/lib/synthetic-email'
import { renderNoticeEmail } from '@/lib/email-template'
import { experienceStaffUserIds } from '@/lib/staff-access-server'

/**
 * Notifications for counters on a creator leg and for payout-detail changes
 * (0542). IN-APP + EMAIL only. Never throws. No message carries an amount for
 * anyone but the creator about their own deal, and none carries bank details.
 */
function siteBase(): string {
  return (process.env.NEXT_PUBLIC_SITE_URL || 'https://guapd.com').replace(/\/+$/, '')
}

async function creatorOfLeg(dealId: string) {
  const admin = createAdminClient()
  const { data: deal } = await admin.from('deals').select('id, title, creator_id, experience_id, experience_brand_name, leg_role').eq('id', dealId).maybeSingle()
  if (!deal || deal.leg_role !== 'creator_leg') return null
  const { data: creator } = await admin.from('creators').select('user_id, full_name').eq('id', deal.creator_id).maybeSingle()
  if (!creator?.user_id) return null
  const { data: user } = await admin.from('users').select('email').eq('id', creator.user_id).maybeSingle()
  return { deal, userId: creator.user_id as string, name: creator.full_name as string | null, email: (user?.email ?? null) as string | null }
}

/** Guapd answered the creator's counter, or sent one: tell the creator. */
export async function notifyCreatorCounter(dealId: string, kind: 'guapd_counter' | 'declined' | 'accepted', idKey: string): Promise<void> {
  try {
    const c = await creatorOfLeg(dealId)
    if (!c) return
    const brand = c.deal.experience_brand_name ?? 'your shoot'
    const body = kind === 'guapd_counter' ? `Guapd sent you a new offer for ${brand}. Open it to accept, counter or decline.`
      : kind === 'accepted' ? `Guapd accepted your counter for ${brand}. Your shoot is booked at your terms.`
      : `Guapd declined your counter for ${brand}. The earlier offer still stands: accept, counter again or decline.`
    await createNotification({ userId: c.userId, dealId, type: `experience_leg_counter_${kind}`, body })
    if (isPlausibleEmail(c.email) && !isSyntheticEmail(c.email)) {
      const first = (c.name ?? '').split(' ')[0] || 'there'
      const { html, text } = renderNoticeEmail({ heading: kind === 'accepted' ? 'Your counter was accepted' : kind === 'declined' ? 'About your counter' : 'A new offer from Guapd',
        body: [`Hi ${first}, ${body}`], ctaUrl: `${siteBase()}/creator/deals/${dealId}`, ctaLabel: 'Open your offer' })
      const r = await sendDealEmail({ to: [c.email as string], subject: `${brand} · Managed by Guapd: ${kind === 'accepted' ? 'counter accepted' : kind === 'declined' ? 'counter declined' : 'new offer'}`,
        html, text, dealId, idempotencyKey: `leg-counter-${idKey}-${kind}` })
      if (!r.ok) console.warn(`[experience-counter] email not sent deal=${dealId}`)
    }
  } catch (err) {
    console.error(`[experience-counter] creator notification failed deal=${dealId}: ${err instanceof Error ? err.message : String(err)}`)
  }
}

/** The creator countered: tell the Experiences staff (in-app). */
export async function notifyStaffCreatorCountered(dealId: string): Promise<void> {
  try {
    const c = await creatorOfLeg(dealId)
    if (!c) return
    const staff = await experienceStaffUserIds(createAdminClient())
    const body = `${c.name ?? 'A creator'} countered their offer for ${c.deal.title ?? 'an Experience'}. It needs an answer.`
    for (const userId of staff) await createNotification({ userId, dealId: null, type: 'experience_leg_countered', body })
  } catch (err) {
    console.error(`[experience-counter] staff notification failed deal=${dealId}: ${err instanceof Error ? err.message : String(err)}`)
  }
}

/** A creator's bank details changed: a security notice to them (never the details). */
export async function notifyPayoutDetailsChanged(userId: string): Promise<void> {
  try {
    const admin = createAdminClient()
    const { data: user } = await admin.from('users').select('email, full_name').eq('id', userId).maybeSingle()
    const body = 'Your bank details for Guapd payouts were changed. If this was not you, write to contact@guapd.com straight away.'
    await createNotification({ userId, dealId: null, type: 'payout_details_changed', body })
    const email = (user?.email ?? null) as string | null
    if (isPlausibleEmail(email) && !isSyntheticEmail(email)) {
      const { html, text } = renderNoticeEmail({ heading: 'Your payout details were changed', body: [body],
        ctaUrl: `${siteBase()}/creator/payments`, ctaLabel: 'Check your payout details' })
      await sendDealEmail({ to: [email as string], subject: 'Your Guapd payout details were changed', html, text, idempotencyKey: `payout-details-${userId}-${Date.now().toString().slice(0, -4)}` })
    }
  } catch (err) {
    console.error(`[experience-counter] payout-details notice failed user=${userId}: ${err instanceof Error ? err.message : String(err)}`)
  }
}

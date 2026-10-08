import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import { createNotification } from '@/lib/notifications'
import { sendDealEmail, isPlausibleEmail } from '@/lib/email'
import { isSyntheticEmail } from '@/lib/synthetic-email'
import { renderNoticeEmail } from '@/lib/email-template'
import { formatPaiseINR } from '@/lib/money'
import { experienceStaffUserIds } from '@/lib/staff-access-server'

/**
 * Notifications for Experience creator legs (Leg 2).
 *
 * Channels, decided for legs (Palak, 2026-10-07): IN-APP + EMAIL only.
 * WhatsApp stays OFF for legs: the marketplace offer template states an
 * amount computed the marketplace way, which is wrong for a leg. A
 * leg-specific MSG91 template is a to-do (docs/experiences-plan.md); until it
 * is approved nothing here calls lib/whatsapp.
 *
 * Amounts come from the leg's own locked terms (experience_creator_terms),
 * never from deals.price_paise or the fee ladder.
 *
 * The house brand has no members, so anything "the brand" would hear about on
 * a leg goes to staff with Experiences operational access instead.
 *
 * Never throws: a notification failure must not fail the action that sent it.
 */

function siteBase(): string {
  return (process.env.NEXT_PUBLIC_SITE_URL || 'https://guapd.com').replace(/\/+$/, '')
}

export async function notifyCreatorLegOffer(dealId: string): Promise<void> {
  try {
    const admin = createAdminClient()
    const { data: deal } = await admin.from('deals')
      .select('id, title, deal_ref, creator_id, experience_brand_name, leg_role')
      .eq('id', dealId).maybeSingle()
    if (!deal || deal.leg_role !== 'creator_leg') return
    const [{ data: terms }, { data: creator }] = await Promise.all([
      admin.from('experience_creator_terms').select('creator_net_paise, days').eq('deal_id', dealId).maybeSingle(),
      admin.from('creators').select('user_id, full_name').eq('id', deal.creator_id).maybeSingle(),
    ])
    const brand = deal.experience_brand_name ?? 'A brand'
    const net = terms ? formatPaiseINR(Number(terms.creator_net_paise)) : null
    const body = `${brand} · Managed by Guapd: a shoot offer${net ? `, ${net} to you` : ''}. Accept or decline.`

    if (creator?.user_id) {
      await createNotification({ userId: creator.user_id, dealId, type: 'experience_leg_offer', body })

      const { data: user } = await admin.from('users').select('email').eq('id', creator.user_id).maybeSingle()
      const email = user?.email
      if (isPlausibleEmail(email) && !isSyntheticEmail(email)) {
        const first = (creator.full_name ?? '').split(' ')[0] || 'there'
        const { html, text } = renderNoticeEmail({
          heading: `A shoot offer from ${brand}`,
          body: [
            `Hi ${first}, Guapd has booked you for a managed shoot with ${brand}.`,
            'Open the offer to see the days, what you will make, and what you take home. Then accept or decline.',
          ],
          rows: [
            ['Shoot', deal.title ?? 'Shoot'],
            ...(net ? [['You take home', net] as [string, string]] : []),
          ],
          ctaUrl: `${siteBase()}/creator/deals/${dealId}`,
          ctaLabel: 'View the offer',
        })
        const r = await sendDealEmail({ to: [email], subject: `${brand} · Managed by Guapd: a shoot offer`, html, text, dealId, idempotencyKey: `leg-offer-${dealId}` })
        if (!r.ok) console.warn(`[experience-leg] offer email not sent deal=${dealId}`)
      }
    }
  } catch (err) {
    console.error(`[experience-leg] offer notification failed deal=${dealId}: ${err instanceof Error ? err.message : String(err)}`)
  }
}

/** The creator answered: tell the Experiences staff (in-app). */
export async function notifyStaffLegAnswer(dealId: string, accepted: boolean): Promise<void> {
  try {
    const admin = createAdminClient()
    const [{ data: deal }, staff] = await Promise.all([
      admin.from('deals').select('title, creator_id, leg_role').eq('id', dealId).maybeSingle(),
      experienceStaffUserIds(admin),
    ])
    if (!deal || deal.leg_role !== 'creator_leg') return
    const { data: creator } = await admin.from('creators').select('full_name').eq('id', deal.creator_id).maybeSingle()
    const who = creator?.full_name ?? 'A creator'
    const body = `${who} ${accepted ? 'accepted' : 'declined'} their deal for ${deal.title ?? 'an Experience'}.`
    // deal_id left null: staff open Experiences from the console, not from a
    // deal page the house brand's (non-existent) members would use.
    for (const userId of staff) {
      await createNotification({ userId, dealId: null, type: 'experience_leg_answer', body })
    }
  } catch (err) {
    console.error(`[experience-leg] staff notification failed deal=${dealId}: ${err instanceof Error ? err.message : String(err)}`)
  }
}

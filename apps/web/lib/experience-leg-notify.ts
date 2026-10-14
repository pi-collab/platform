import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import { createNotification } from '@/lib/notifications'
import { sendDealEmail, isPlausibleEmail } from '@/lib/email'
import { isSyntheticEmail } from '@/lib/synthetic-email'
import { renderNoticeEmail } from '@/lib/email-template'
import { formatPaiseINR } from '@/lib/money'
import { experienceStaffUserIds } from '@/lib/staff-access-server'
import { emailExperienceStaff } from '@/lib/experience-staff-email'
import { sendLegWhatsApp, legTotalPaise } from '@/lib/experience-leg-whatsapp'

/**
 * Notifications for Experience creator legs (Leg 2).
 *
 * Channels, decided for legs (Palak, 2026-10-07): IN-APP + EMAIL only.
 * WhatsApp (0547): the approved experience_offer_sent / _offer_updated /
 * _payment_sent templates through lib/experience-leg-whatsapp (sent only when
 * EXPERIENCE_LEG_WHATSAPP=true).
 * Never the marketplace offer template: its amount is computed the
 * marketplace way, which is wrong for a leg.
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
      admin.from('experience_creator_terms').select('creator_net_paise, allowance_paise, days').eq('deal_id', dealId).maybeSingle(),
      admin.from('creators').select('user_id, full_name').eq('id', deal.creator_id).maybeSingle(),
    ])
    const brand = deal.experience_brand_name ?? 'A brand'
    // What reaches the creator in all: their net (after the fee) plus any allowance (no fee).
    const totalPaise = terms ? Number(terms.creator_net_paise) + Number(terms.allowance_paise ?? 0) : null
    const net = totalPaise != null ? formatPaiseINR(totalPaise) : null
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
    await sendLegWhatsApp('offer', dealId, totalPaise)
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
    // 0546: the leg's deal id; the staff bell opens it on the console (never /deals).
    for (const userId of staff) {
      await createNotification({ userId, dealId, type: 'experience_leg_answer', body })
    }
    await emailExperienceStaff(staff, { subject: `${who} ${accepted ? 'accepted' : 'declined'} their Experience deal`, heading: accepted ? 'A creator accepted' : 'A creator declined', body, dealId, idKey: `staff-answer-${dealId}` })
  } catch (err) {
    console.error(`[experience-leg] staff notification failed deal=${dealId}: ${err instanceof Error ? err.message : String(err)}`)
  }
}

async function legCreator(dealId: string) {
  const admin = createAdminClient()
  const { data: deal } = await admin.from('deals')
    .select('id, title, creator_id, experience_brand_name, leg_role').eq('id', dealId).maybeSingle()
  if (!deal || deal.leg_role !== 'creator_leg') return null
  const { data: creator } = await admin.from('creators').select('user_id, full_name').eq('id', deal.creator_id).maybeSingle()
  const { data: user } = creator?.user_id ? await admin.from('users').select('email').eq('id', creator.user_id).maybeSingle() : { data: null }
  return {
    deal, userId: (creator?.user_id ?? null) as string | null, name: (creator?.full_name ?? null) as string | null,
    first: ((creator?.full_name ?? '').split(' ')[0] || 'there') as string, email: (user?.email ?? null) as string | null,
    brand: (deal.experience_brand_name ?? 'your shoot') as string,
  }
}

async function emailCreator(c: NonNullable<Awaited<ReturnType<typeof legCreator>>>, subject: string, heading: string, body: string[], ctaLabel: string, idempotencyKey: string) {
  if (!isPlausibleEmail(c.email) || isSyntheticEmail(c.email)) return
  const { html, text } = renderNoticeEmail({ heading, body, ctaUrl: `${siteBase()}/creator/deals/${c.deal.id}`, ctaLabel })
  const r = await sendDealEmail({ to: [c.email as string], subject, html, text, dealId: c.deal.id as string, idempotencyKey })
  if (!r.ok) console.warn(`[experience-leg] email not sent deal=${c.deal.id}`)
}

/** 0546: the brief a creator sees changed (shared, or their own). In-app + email. */
export async function notifyCreatorsBriefChanged(dealIds: string[]): Promise<void> {
  for (const dealId of dealIds) {
    try {
      const c = await legCreator(dealId)
      if (!c?.userId) continue
      const body = `Guapd updated the brief for your ${c.brand} shoot. Take a look before the shoot.`
      await createNotification({ userId: c.userId, dealId, type: 'experience_brief_updated', body })
      await emailCreator(c, `${c.brand} · Managed by Guapd: the brief was updated`, 'The brief was updated',
        [`Hi ${c.first}, Guapd updated the brief for your ${c.brand} shoot.`, 'Open your deal to read the latest version.'],
        'Read the brief', `leg-brief-${dealId}-${Date.now().toString().slice(0, -5)}`)
      await sendLegWhatsApp('updated', dealId, await legTotalPaise(dealId))   // experience_offer_updated
    } catch (err) {
      console.error(`[experience-leg] brief notification failed deal=${dealId}: ${err instanceof Error ? err.message : String(err)}`)
    }
  }
}

/** 0564: the shoot moved to a new date. Every creator with a live deal (offer out, accepted or paid). In-app + email. */
export async function notifyCreatorsShootDateChanged(dealIds: string[], date: string): Promise<void> {
  const when = new Date(`${date}T00:00:00`).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })
  for (const dealId of dealIds) {
    try {
      const c = await legCreator(dealId)
      if (!c?.userId) continue
      const body = `The ${c.brand} shoot has moved to ${when}.`
      await createNotification({ userId: c.userId, dealId, type: 'experience_shoot_date_changed', body })
      await emailCreator(c, `${c.brand} · Managed by Guapd: the shoot date changed`, 'The shoot date changed',
        [`Hi ${c.first}, the ${c.brand} shoot has moved to ${when}.`, 'Open your deal for the details. Reply there if the new date does not work for you.'],
        'Open your deal', `leg-shoot-date-${dealId}-${date}`)
    } catch (err) {
      console.error(`[experience-leg] shoot date notification failed deal=${dealId}: ${err instanceof Error ? err.message : String(err)}`)
    }
  }
}

/** 0546: Guapd wrote to the creator on their deal. In-app + email (never the message text in email). */
export async function notifyCreatorGuapdMessage(dealId: string): Promise<void> {
  try {
    const c = await legCreator(dealId)
    if (!c?.userId) return
    const body = `Guapd sent you a message about your ${c.brand} shoot.`
    await createNotification({ userId: c.userId, dealId, type: 'experience_leg_message', body })
    // At most one email per deal every quarter of an hour, so a back-and-forth is not an inbox flood.
    await emailCreator(c, `${c.brand} · Managed by Guapd: a message from Guapd`, 'A message from Guapd',
      [`Hi ${c.first}, Guapd sent you a message about your ${c.brand} shoot.`, 'Open your deal to read it and reply.'],
      'Read and reply', `leg-msg-${dealId}-${Date.now().toString().slice(0, -6)}`)
    // No WhatsApp for a message: there is no approved message template (in-app + email only).
  } catch (err) {
    console.error(`[experience-leg] message notification failed deal=${dealId}: ${err instanceof Error ? err.message : String(err)}`)
  }
}

/** 0546: the creator wrote to Guapd: tell the Experiences staff (in-app), never the brand. */
export async function notifyStaffCreatorMessage(dealId: string): Promise<void> {
  try {
    const admin = createAdminClient()
    const [c, staff] = await Promise.all([legCreator(dealId), experienceStaffUserIds(admin)])
    if (!c) return
    const body = `${c.name ?? 'A creator'} sent Guapd a message about ${c.deal.title ?? 'an Experience'}.`
    for (const userId of staff) await createNotification({ userId, dealId, type: 'experience_leg_message_in', body })
    // One email per thread per ~15 minutes, so a conversation is not an inbox flood. Never the message text.
    await emailExperienceStaff(staff, { subject: `New message from ${c.name ?? 'a creator'}`, heading: 'A creator wrote to Guapd', body, dealId, idKey: `staff-msg-${dealId}-${Date.now().toString().slice(0, -6)}` })
  } catch (err) {
    console.error(`[experience-leg] staff message notification failed deal=${dealId}: ${err instanceof Error ? err.message : String(err)}`)
  }
}

/** 0547: a sent leg's scope was re-split (labels only, no money). In-app + email + experience_offer_updated. */
export async function notifyCreatorScopeChanged(dealId: string): Promise<void> {
  try {
    const c = await legCreator(dealId)
    if (!c?.userId) return
    const body = `Guapd updated what you make for your ${c.brand} shoot. Your pay is unchanged.`
    await createNotification({ userId: c.userId, dealId, type: 'experience_scope_updated', body })
    await emailCreator(c, `${c.brand} · Managed by Guapd: your shoot was updated`, 'Your shoot was updated',
      [`Hi ${c.first}, Guapd updated what you make for your ${c.brand} shoot (which videos carry the affiliate link, ad rights or boosting).`, 'Your pay is unchanged. Open your deal to see the details.'],
      'See what changed', `leg-scope-${dealId}-${Date.now().toString().slice(0, -5)}`)
    await sendLegWhatsApp('updated', dealId, await legTotalPaise(dealId))
  } catch (err) {
    console.error(`[experience-leg] scope notification failed deal=${dealId}: ${err instanceof Error ? err.message : String(err)}`)
  }
}

/** 0555: Guapd offered the creator extra deliverables on their deal. In-app + email (no amounts in the email subject). */
export async function notifyCreatorExtraOffer(dealId: string, revised: boolean): Promise<void> {
  try {
    const c = await legCreator(dealId)
    if (!c?.userId) return
    const body = revised
      ? `Guapd revised the extra deliverables offer for your ${c.brand} shoot. Review it and accept or decline.`
      : `Guapd offered you extra deliverables for your ${c.brand} shoot. Review it and accept or decline.`
    await createNotification({ userId: c.userId, dealId, type: 'experience_extra_offer', body })
    await emailCreator(c, `${c.brand} · Managed by Guapd: ${revised ? 'a revised' : 'an'} extra offer`, revised ? 'A revised extra offer' : 'An extra offer from Guapd',
      [`Hi ${c.first}, ${body.charAt(0).toLowerCase()}${body.slice(1)}`, 'Open your deal to see what it adds and what you receive.'],
      'See the offer', `leg-extra-${dealId}-${Date.now().toString().slice(0, -5)}`)
  } catch (err) {
    console.error(`[experience-leg] extra offer notification failed deal=${dealId}: ${err instanceof Error ? err.message : String(err)}`)
  }
}

/** 0555: the creator answered an extra offer: tell the Experiences staff (in-app + email). */
export async function notifyStaffExtraAnswer(dealId: string, accepted: boolean): Promise<void> {
  try {
    const admin = createAdminClient()
    const [c, staff] = await Promise.all([legCreator(dealId), experienceStaffUserIds(admin)])
    if (!c) return
    const body = `${c.name ?? 'A creator'} ${accepted ? 'accepted' : 'declined'} the extra deliverables for ${c.deal.title ?? 'an Experience'}.`
    for (const userId of staff) await createNotification({ userId, dealId, type: 'experience_extra_answer', body })
    await emailExperienceStaff(staff, { subject: `${c.name ?? 'A creator'} ${accepted ? 'accepted' : 'declined'} an extra`, heading: accepted ? 'Extra accepted' : 'Extra declined', body, dealId, idKey: `staff-extra-${dealId}-${Date.now().toString().slice(0, -5)}` })
  } catch (err) {
    console.error(`[experience-leg] staff extra notification failed deal=${dealId}: ${err instanceof Error ? err.message : String(err)}`)
  }
}

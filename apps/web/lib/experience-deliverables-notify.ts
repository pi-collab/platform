import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import { createNotification } from '@/lib/notifications'
import { sendDealEmail, isPlausibleEmail } from '@/lib/email'
import { isSyntheticEmail } from '@/lib/synthetic-email'
import { renderNoticeEmail } from '@/lib/email-template'
import { experienceStaffUserIds } from '@/lib/staff-access-server'

/**
 * Notifications for the shoot and deliverables stage of an Experience (0538).
 *
 * IN-APP + EMAIL only, as for creator legs (lib/experience-leg-notify.ts):
 * WhatsApp stays off until a leg template is approved. No message here
 * carries a price, rate, net or margin.
 *
 * Never throws: a notification failure must not fail the action that sent it.
 */

function siteBase(): string {
  return (process.env.NEXT_PUBLIC_SITE_URL || 'https://guapd.com').replace(/\/+$/, '')
}

async function creatorOfLeg(dealId: string) {
  const admin = createAdminClient()
  const { data: deal } = await admin.from('deals')
    .select('id, title, creator_id, experience_brand_name, leg_role, settings_snapshot')
    .eq('id', dealId).maybeSingle()
  if (!deal || deal.leg_role !== 'creator_leg') return null
  const { data: creator } = await admin.from('creators').select('user_id, full_name').eq('id', deal.creator_id).maybeSingle()
  if (!creator?.user_id) return null
  const { data: user } = await admin.from('users').select('email').eq('id', creator.user_id).maybeSingle()
  const owner = (deal.settings_snapshot as { deliverables_owner?: string } | null)?.deliverables_owner === 'creator' ? 'creator' : 'guapd'
  return { deal, userId: creator.user_id as string, first: (creator.full_name ?? '').split(' ')[0] || 'there', email: user?.email as string | null, owner }
}

async function emailCreator(c: NonNullable<Awaited<ReturnType<typeof creatorOfLeg>>>, subject: string, heading: string, body: string[], key: string) {
  if (!isPlausibleEmail(c.email) || isSyntheticEmail(c.email)) return
  const { html, text } = renderNoticeEmail({ heading, body, ctaUrl: `${siteBase()}/creator/deals/${c.deal.id}`, ctaLabel: 'Open your shoot' })
  const r = await sendDealEmail({ to: [c.email as string], subject, html, text, dealId: c.deal.id, idempotencyKey: key })
  if (!r.ok) console.warn(`[experience-deliverables] email not sent deal=${c.deal.id} key=${key}`)
}

/** Guapd withdrew an offer the creator had not answered. */
export async function notifyCreatorLegWithdrawn(dealId: string): Promise<void> {
  try {
    const c = await creatorOfLeg(dealId)
    if (!c) return
    const brand = c.deal.experience_brand_name ?? 'A brand'
    const body = `${brand} · Managed by Guapd: this shoot offer has been withdrawn. Nothing for you to do.`
    await createNotification({ userId: c.userId, dealId, type: 'experience_leg_withdrawn', body })
    await emailCreator(c, `${brand} · Managed by Guapd: offer withdrawn`, 'This shoot offer was withdrawn',
      [`Hi ${c.first}, Guapd has withdrawn the shoot offer for ${brand}.`, 'There is nothing for you to do. Questions? Write to contact@guapd.com.'],
      `leg-withdrawn-${dealId}`)
  } catch (err) {
    console.error(`[experience-deliverables] withdraw notification failed deal=${dealId}: ${err instanceof Error ? err.message : String(err)}`)
  }
}

/** Guapd reviewed a deliverable the creator submitted (creator-submit legs only). */
export async function notifyCreatorItemReviewed(dealId: string, label: string, decision: 'approve' | 'revision'): Promise<void> {
  try {
    const c = await creatorOfLeg(dealId)
    if (!c || c.owner !== 'creator') return
    const brand = c.deal.experience_brand_name ?? 'the brand'
    const body = decision === 'approve'
      ? `Guapd approved your ${label} for ${brand}.`
      : `Guapd asked for changes to your ${label} for ${brand}. Open it to see what to change.`
    await createNotification({ userId: c.userId, dealId, type: decision === 'approve' ? 'experience_item_approved' : 'experience_item_revision', body })
    await emailCreator(c, decision === 'approve' ? `Approved: your ${label}` : `Changes asked: your ${label}`,
      decision === 'approve' ? 'Your deliverable is approved' : 'Guapd asked for a change',
      [`Hi ${c.first}, ${body}`], `item-review-${dealId}-${label}-${decision}-${Date.now().toString().slice(0, -5)}`)
  } catch (err) {
    console.error(`[experience-deliverables] review notification failed deal=${dealId}: ${err instanceof Error ? err.message : String(err)}`)
  }
}

/** A creator submitted a deliverable: tell the Experiences staff (in-app). */
export async function notifyStaffItemSubmitted(dealId: string, label: string): Promise<void> {
  try {
    const admin = createAdminClient()
    const [{ data: deal }, staff] = await Promise.all([
      admin.from('deals').select('title, creator_id, leg_role').eq('id', dealId).maybeSingle(),
      experienceStaffUserIds(admin),
    ])
    if (!deal || deal.leg_role !== 'creator_leg') return
    const { data: creator } = await admin.from('creators').select('full_name').eq('id', deal.creator_id).maybeSingle()
    const body = `${creator?.full_name ?? 'A creator'} submitted ${label} for ${deal.title ?? 'an Experience'}. It needs Guapd's review.`
    for (const userId of staff) await createNotification({ userId, dealId: null, type: 'experience_item_submitted', body })
  } catch (err) {
    console.error(`[experience-deliverables] staff notification failed deal=${dealId}: ${err instanceof Error ? err.message : String(err)}`)
  }
}

/**
 * Guapd shared deliverables with the brand: tell the brand's members (in-app
 * and email), linking to /experiences/[id], which shows released items only.
 * Says how many, never who made them or anything about money.
 */
export async function notifyBrandDeliverablesShared(experienceId: string, count: number): Promise<void> {
  try {
    if (count <= 0) return
    const admin = createAdminClient()
    const { data: exp } = await admin.from('experiences').select('id, title, brand_id').eq('id', experienceId).maybeSingle()
    if (!exp) return
    const { data: members } = await admin.from('brand_members').select('user_id, users(email)').eq('brand_id', exp.brand_id)
    const what = `${count} new deliverable${count === 1 ? '' : 's'}`
    const body = `${what} from ${exp.title} ${count === 1 ? 'is' : 'are'} ready to view.`
    const emails: string[] = []
    for (const m of (members ?? []) as unknown as { user_id: string; users: { email: string | null } | { email: string | null }[] | null }[]) {
      await createNotification({ userId: m.user_id, dealId: null, type: 'experience_deliverables_shared', body })
      const u = Array.isArray(m.users) ? m.users[0] : m.users
      const e = u?.email
      if (isPlausibleEmail(e) && !isSyntheticEmail(e)) emails.push(e as string)
    }
    if (emails.length) {
      const { html, text } = renderNoticeEmail({
        heading: 'New deliverables to view',
        body: [`Guapd has shared ${what} from ${exp.title}.`, 'Open the Experience to view them. Reply to Guapd with any changes.'],
        ctaUrl: `${siteBase()}/experiences/${exp.id}`,
        ctaLabel: 'View deliverables',
      })
      const r = await sendDealEmail({ to: emails, subject: `${exp.title}: ${what} to view`, html, text, idempotencyKey: `xp-shared-${exp.id}-${Date.now().toString().slice(0, -4)}` })
      if (!r.ok) console.warn(`[experience-deliverables] brand email not sent experience=${exp.id}`)
    }
  } catch (err) {
    console.error(`[experience-deliverables] brand notification failed experience=${experienceId}: ${err instanceof Error ? err.message : String(err)}`)
  }
}

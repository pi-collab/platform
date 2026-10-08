import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import { createNotification } from '@/lib/notifications'
import { sendDealEmail, isPlausibleEmail } from '@/lib/email'
import { isSyntheticEmail } from '@/lib/synthetic-email'
import { renderNoticeEmail } from '@/lib/email-template'
import { experienceStaffUserIds } from '@/lib/staff-access-server'
import { formatRupees } from '@/lib/experience-request'

/**
 * Notifications for the money loop of an Experience (0540). IN-APP + EMAIL
 * only (WhatsApp stays off for legs). Never throws: a notification failure must
 * not fail the money action that sent it.
 *
 * The figures in these messages come from the caller, which read them with the
 * signed-in staff member's own session (experience_console_invoice_doc /
 * experience_console_payouts). This file never reads invoices or payouts
 * itself: it only finds who to tell.
 *
 *   brand    "Invoice GPD/26-27/0001 for <Experience>: ₹X" (their own price, nothing else)
 *   creator  "Guapd paid you ₹X · ref UTR" (fires when a person RECORDS a real
 *            transfer with its reference and proof; the wording says exactly that)
 *   staff    "A payout needs approving" (to the other Experiences staff, never the requester)
 */

function siteBase(): string {
  return (process.env.NEXT_PUBLIC_SITE_URL || 'https://guapd.com').replace(/\/+$/, '')
}

export async function notifyBrandInvoiceIssued(experienceId: string, inv: { number: string; totalPaise: number; dueDate: string | null; title: string }): Promise<void> {
  try {
    const admin = createAdminClient()
    const { data: exp } = await admin.from('experiences').select('id, brand_id').eq('id', experienceId).maybeSingle()
    if (!exp) return
    const { data: members } = await admin.from('brand_members').select('user_id, users(email)').eq('brand_id', exp.brand_id)
    const due = inv.dueDate ? ` Due ${new Date(`${inv.dueDate}T00:00:00`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}.` : ''
    const body = `Invoice ${inv.number} for ${inv.title}: ${formatRupees(inv.totalPaise)}.${due}`
    const emails: string[] = []
    for (const m of (members ?? []) as unknown as { user_id: string; users: { email: string | null } | { email: string | null }[] | null }[]) {
      await createNotification({ userId: m.user_id, dealId: null, type: 'experience_invoice_issued', body })
      const u = Array.isArray(m.users) ? m.users[0] : m.users
      if (isPlausibleEmail(u?.email) && !isSyntheticEmail(u?.email)) emails.push(u!.email as string)
    }
    if (emails.length) {
      const { html, text } = renderNoticeEmail({
        heading: `Invoice ${inv.number}`,
        body: [`Guapd has issued invoice ${inv.number} for ${inv.title}: ${formatRupees(inv.totalPaise)}.${due}`, 'Open the Experience to download the PDF. Questions? Reply to contact@guapd.com.'],
        ctaUrl: `${siteBase()}/experiences/${experienceId}`,
        ctaLabel: 'View the invoice',
      })
      const r = await sendDealEmail({ to: emails, subject: `Invoice ${inv.number} from Guapd`, html, text, idempotencyKey: `xp-invoice-${inv.number}` })
      if (!r.ok) console.warn(`[experience-money] invoice email not sent experience=${experienceId}`)
    }
  } catch (err) {
    console.error(`[experience-money] invoice notification failed experience=${experienceId}: ${err instanceof Error ? err.message : String(err)}`)
  }
}

export async function notifyCreatorPaid(dealId: string, paid: { paidPaise: number; reference: string; payoutId: string }): Promise<void> {
  try {
    const admin = createAdminClient()
    const { data: deal } = await admin.from('deals').select('id, creator_id, experience_brand_name, leg_role').eq('id', dealId).maybeSingle()
    if (!deal || deal.leg_role !== 'creator_leg') return
    const { data: creator } = await admin.from('creators').select('user_id, full_name').eq('id', deal.creator_id).maybeSingle()
    if (!creator?.user_id) return
    const { data: user } = await admin.from('users').select('email').eq('id', creator.user_id).maybeSingle()
    const brand = deal.experience_brand_name ?? 'your shoot'
    const body = `Guapd paid you ${formatRupees(paid.paidPaise)} for ${brand} · ref ${paid.reference}`
    await createNotification({ userId: creator.user_id, dealId, type: 'experience_payout_paid', body })
    const email = user?.email as string | null
    if (isPlausibleEmail(email) && !isSyntheticEmail(email)) {
      const first = (creator.full_name ?? '').split(' ')[0] || 'there'
      const { html, text } = renderNoticeEmail({
        heading: 'Guapd paid you',
        body: [`Hi ${first}, Guapd paid you ${formatRupees(paid.paidPaise)} for ${brand}.`, `Bank reference: ${paid.reference}. Your payout statement is on your deal page.`],
        ctaUrl: `${siteBase()}/creator/deals/${dealId}`,
        ctaLabel: 'Open your statement',
      })
      const r = await sendDealEmail({ to: [email as string], subject: `Guapd paid you ${formatRupees(paid.paidPaise)} · ref ${paid.reference}`, html, text, dealId, idempotencyKey: `xp-paid-${paid.payoutId}` })
      if (!r.ok) console.warn(`[experience-money] paid email not sent deal=${dealId}`)
    }
  } catch (err) {
    console.error(`[experience-money] paid notification failed deal=${dealId}: ${err instanceof Error ? err.message : String(err)}`)
  }
}

export async function notifyStaffPayoutToApprove(experienceId: string, creatorName: string, requesterUserId: string | null): Promise<void> {
  try {
    const admin = createAdminClient()
    const [{ data: exp }, staff] = await Promise.all([
      admin.from('experiences').select('title').eq('id', experienceId).maybeSingle(),
      experienceStaffUserIds(admin),
    ])
    const body = `A payout to ${creatorName} for ${exp?.title ?? 'an Experience'} needs approving by someone other than who requested it.`
    for (const userId of staff) {
      if (userId === requesterUserId) continue
      await createNotification({ userId, dealId: null, type: 'experience_payout_to_approve', body })
    }
  } catch (err) {
    console.error(`[experience-money] approval notification failed experience=${experienceId}: ${err instanceof Error ? err.message : String(err)}`)
  }
}

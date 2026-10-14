import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import { createNotification } from '@/lib/notifications'
import { sendDealEmail, isPlausibleEmail } from '@/lib/email'
import { isSyntheticEmail } from '@/lib/synthetic-email'
import { renderNoticeEmail } from '@/lib/email-template'
import { experienceStaffUserIds } from '@/lib/staff-access-server'
import { emailExperienceStaff } from '@/lib/experience-staff-email'

/**
 * Notifications between a brand and Guapd on an Experience (0544).
 *   - Brand → Guapd: when the brand acts in the portal, the Experiences staff
 *     are told in-app.
 *   - Guapd → brand: when something waits on the brand (a quote, creators to
 *     review), the brand's members are told in-app and by email, linking to
 *     /experiences/[id].
 * IN-APP + EMAIL only (WhatsApp stays off). Never a creator's rate or pay; a
 * quote message says a price is ready, not what it is.
 * Never throws: a notification failure must not fail the action.
 */
function siteBase(): string {
  return (process.env.NEXT_PUBLIC_SITE_URL || 'https://guapd.com').replace(/\/+$/, '')
}

async function experienceTitle(experienceId: string) {
  const { data } = await createAdminClient().from('experiences').select('id, title, brand_id, brands(name)').eq('id', experienceId).maybeSingle()
  if (!data) return null
  const b = (data as unknown as { brands: { name: string } | { name: string }[] | null }).brands
  return { id: data.id as string, title: data.title as string, brandId: data.brand_id as string, brandName: (Array.isArray(b) ? b[0]?.name : b?.name) ?? 'A brand' }
}

/** The brand did something on Guapd: tell the Experiences staff (in-app). */
export async function notifyStaffBrandActed(experienceId: string, what: string): Promise<void> {
  try {
    const admin = createAdminClient()
    const [e, staff] = await Promise.all([experienceTitle(experienceId), experienceStaffUserIds(admin)])
    if (!e) return
    const body = `${e.brandName} ${what} on ${e.title}.`
    for (const userId of staff) await createNotification({ userId, dealId: null, type: 'experience_brand_acted', body })
    await emailExperienceStaff(staff, { subject: `${e.brandName} acted on ${e.title}`, heading: 'The brand acted on Guapd', body, dealId: null, idKey: `staff-brand-${experienceId}-${Date.now().toString().slice(0, -5)}-${what.length}` })
  } catch (err) {
    console.error(`[experience-brand] staff notification failed experience=${experienceId}: ${err instanceof Error ? err.message : String(err)}`)
  }
}

/** Something waits on the brand: tell the brand's members (in-app + email). */
export async function notifyBrandWaiting(experienceId: string, kind: 'quote' | 'roster' | 'addon', count = 0): Promise<void> {
  try {
    const e = await experienceTitle(experienceId)
    if (!e) return
    const admin = createAdminClient()
    const { data: members } = await admin.from('brand_members').select('user_id, users(email)').eq('brand_id', e.brandId)
    // Creators are added one at a time from the pool: one nudge an hour, not one per click.
    if (kind === 'roster' && members?.length) {
      const { count: recent } = await admin.from('notifications').select('id', { count: 'exact', head: true })
        .eq('user_id', (members[0] as { user_id: string }).user_id).eq('type', 'experience_roster_ready')
        .like('body', `%for ${e.title.replace(/[%_]/g, '')} %`).gte('created_at', new Date(Date.now() - 3600_000).toISOString())
      if ((recent ?? 0) > 0) return
    }
    const body = kind === 'quote'
      ? `Guapd's price for ${e.title} is ready. Accept it, or tell Guapd what would work.`
      : kind === 'addon'
      ? `Guapd sent an add-on to your agreed price for ${e.title}. Review it and accept, or tell Guapd what would work.`
      : `Creators for ${e.title} are ready for your review.`
    const emails: string[] = []
    for (const m of (members ?? []) as unknown as { user_id: string; users: { email: string | null } | { email: string | null }[] | null }[]) {
      await createNotification({ userId: m.user_id, dealId: null, type: kind === 'quote' ? 'experience_quote_ready' : kind === 'addon' ? 'experience_addon_ready' : 'experience_roster_ready', body })
      const u = Array.isArray(m.users) ? m.users[0] : m.users
      if (isPlausibleEmail(u?.email) && !isSyntheticEmail(u?.email)) emails.push(u!.email as string)
    }
    if (emails.length) {
      const { html, text } = renderNoticeEmail({
        heading: kind === 'quote' ? 'Your Experience price is ready' : kind === 'addon' ? 'An add-on to your agreed price' : 'Creators to review',
        body: [body],
        ctaUrl: `${siteBase()}/experiences/${e.id}`,
        ctaLabel: kind === 'quote' ? 'See the price' : kind === 'addon' ? 'Review the add-on' : 'Review creators',
      })
      const r = await sendDealEmail({ to: emails, subject: `${e.title}: ${kind === 'quote' ? 'price ready' : kind === 'addon' ? 'add-on to review' : 'creators to review'}`, html, text,
        idempotencyKey: `xp-${kind}-${e.id}-${Date.now().toString().slice(0, -5)}` })
      if (!r.ok) console.warn(`[experience-brand] brand email not sent experience=${e.id}`)
    }
  } catch (err) {
    console.error(`[experience-brand] brand notification failed experience=${experienceId}: ${err instanceof Error ? err.message : String(err)}`)
  }
}

/** 0564: Guapd moved the shoot date: tell the brand's members (in-app + email). */
export async function notifyBrandShootDateChanged(experienceId: string, date: string): Promise<void> {
  try {
    const e = await experienceTitle(experienceId)
    if (!e) return
    const when = new Date(`${date}T00:00:00`).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })
    const { data: members } = await createAdminClient().from('brand_members').select('user_id, users(email)').eq('brand_id', e.brandId)
    const body = `The shoot for ${e.title} has moved to ${when}.`
    const emails: string[] = []
    for (const m of (members ?? []) as unknown as { user_id: string; users: { email: string | null } | { email: string | null }[] | null }[]) {
      await createNotification({ userId: m.user_id, dealId: null, type: 'experience_shoot_date_changed', body })
      const u = Array.isArray(m.users) ? m.users[0] : m.users
      if (isPlausibleEmail(u?.email) && !isSyntheticEmail(u?.email)) emails.push(u!.email as string)
    }
    if (emails.length) {
      const { html, text } = renderNoticeEmail({ heading: 'The shoot date changed', body: [body], ctaUrl: `${siteBase()}/experiences/${e.id}`, ctaLabel: 'See your Experience' })
      const r = await sendDealEmail({ to: emails, subject: `${e.title}: the shoot date changed`, html, text, idempotencyKey: `xp-shoot-date-${e.id}-${date}` })
      if (!r.ok) console.warn(`[experience-brand] brand email not sent experience=${e.id}`)
    }
  } catch (err) {
    console.error(`[experience-brand] shoot date notification failed experience=${experienceId}: ${err instanceof Error ? err.message : String(err)}`)
  }
}

/** 0550: Guapd wrote in the brand thread: tell the brand's members (in-app + email, never the text). */
export async function notifyBrandGuapdMessage(experienceId: string): Promise<void> {
  try {
    const e = await experienceTitle(experienceId)
    if (!e) return
    const admin = createAdminClient()
    const { data: members } = await admin.from('brand_members').select('user_id, users(email)').eq('brand_id', e.brandId)
    const body = `Guapd sent you a message about ${e.title}.`
    const emails: string[] = []
    for (const m of (members ?? []) as unknown as { user_id: string; users: { email: string | null } | { email: string | null }[] | null }[]) {
      await createNotification({ userId: m.user_id, dealId: null, type: 'experience_guapd_message', body })
      const u = Array.isArray(m.users) ? m.users[0] : m.users
      if (isPlausibleEmail(u?.email) && !isSyntheticEmail(u?.email)) emails.push(u!.email as string)
    }
    if (emails.length) {
      const { html, text } = renderNoticeEmail({ heading: 'A message from Guapd', body: [body, 'Open the Experience to read it and reply.'],
        ctaUrl: `${siteBase()}/experiences/${e.id}#messages`, ctaLabel: 'Read and reply' })
      // One email per Experience every ~15 minutes, so a conversation is not an inbox flood.
      const r = await sendDealEmail({ to: emails, subject: `${e.title}: a message from Guapd`, html, text, idempotencyKey: `xp-msg-out-${e.id}-${Date.now().toString().slice(0, -6)}` })
      if (!r.ok) console.warn(`[experience-brand] message email not sent experience=${e.id}`)
    }
  } catch (err) {
    console.error(`[experience-brand] message notification failed experience=${experienceId}: ${err instanceof Error ? err.message : String(err)}`)
  }
}

/** 0550: the brand wrote to Guapd: tell the Experiences staff (in-app + email), never the brand's other side. */
export async function notifyStaffBrandMessage(experienceId: string): Promise<void> {
  try {
    const admin = createAdminClient()
    const [e, staff] = await Promise.all([experienceTitle(experienceId), experienceStaffUserIds(admin)])
    if (!e) return
    const body = `${e.brandName} sent Guapd a message about ${e.title}.`
    for (const userId of staff) await createNotification({ userId, dealId: null, type: 'experience_brand_message_in', body })
    await emailExperienceStaff(staff, { subject: `New message from ${e.brandName}`, heading: 'The brand wrote to Guapd', body, dealId: null, idKey: `staff-brandmsg-${e.id}-${Date.now().toString().slice(0, -6)}` })
  } catch (err) {
    console.error(`[experience-brand] staff message notification failed experience=${experienceId}: ${err instanceof Error ? err.message : String(err)}`)
  }
}
